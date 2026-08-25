import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { subscribe, useSnapshot } from "valtio";
import { store } from "@/app/store.jsx";
import { getLocalizedText } from "@/app/localization/interfaceTranslations.js";
import { normalizeSiteLocale } from "@/functions/siteLocale.js";
import { commitPortfolioHubCaseRoute } from "@/functions/portfolioHubNavigate.js";
import {
	requestHubPlateCaseClose,
	requestHubPlateCaseSwitch,
	setHubPlateCaseGalleryIndex,
} from "../../hubPlateCase/hubPlateCaseStore.js";
import {
	getPortfolioProjectByPath,
	projectsData,
} from "@/three/scenes/portfolio/hub/projectsData.js";
import { getHubPlateInnerPanelData } from "@/three/scenes/portfolio/hub/hubPlateInnerPanelData.js";
import styles from "./ResponsiveHubCase.module.scss";

const COPY = {
	case: { ru: "Кейс", en: "Case", zh: "案例" },
	year: { ru: "Год", en: "Year", zh: "年份" },
	type: { ru: "Тип", en: "Type", zh: "类型" },
	gallery: { ru: "Галерея", en: "Gallery", zh: "画廊" },
	previousImage: { ru: "Предыдущее изображение", en: "Previous image", zh: "上一张图片" },
	nextImage: { ru: "Следующее изображение", en: "Next image", zh: "下一张图片" },
	allProjects: { ru: "Все проекты", en: "All projects", zh: "所有项目" },
	previousProject: { ru: "Предыдущий проект", en: "Previous project", zh: "上一个项目" },
	nextProject: { ru: "Следующий проект", en: "Next project", zh: "下一个项目" },
};

const SLIDE_DURATION_MS = 360;

function wrapIndex(index, length) {
	if (length <= 0) {
		return 0;
	}
	return ((index % length) + length) % length;
}

function pad(value) {
	return String(value).padStart(2, "0");
}

export default function ResponsiveHubCase() {
	const { pathname } = useLocation();
	const snap = useSnapshot(store);
	const locale = normalizeSiteLocale(snap.siteLocale);
	const project = useMemo(() => getPortfolioProjectByPath(pathname), [pathname]);
	const projectIndex = project ? projectsData.indexOf(project) : -1;
	const panelData = useMemo(
		() => (project ? getHubPlateInnerPanelData(project, locale) : null),
		[locale, project],
	);
	const gallery = panelData?.gallery ?? [];
	const scrollRef = useRef(null);
	const galleryViewportRef = useRef(null);
	const settleTimerRef = useRef(0);
	const pendingDirectionRef = useRef(0);
	const dragRef = useRef({ pointerId: null, startX: 0, startY: 0, axis: null });
	const [galleryIndex, setGalleryIndex] = useState(0);
	const [galleryOffset, setGalleryOffset] = useState(0);
	const [galleryAnimating, setGalleryAnimating] = useState(false);
	const [galleryDragging, setGalleryDragging] = useState(false);
	const [panelVisible, setPanelVisible] = useState(false);

	const finishGalleryMotion = useCallback(() => {
		window.clearTimeout(settleTimerRef.current);
		const direction = pendingDirectionRef.current;
		pendingDirectionRef.current = 0;
		setGalleryAnimating(false);
		setGalleryOffset(0);
		setGalleryDragging(false);
		if (!direction || gallery.length <= 1) {
			return;
		}
		setGalleryIndex((current) => {
			const next = wrapIndex(current + direction, gallery.length);
			setHubPlateCaseGalleryIndex(next);
			return next;
		});
	}, [gallery.length]);

	const settleGallery = useCallback((direction = 0) => {
		if (galleryAnimating || gallery.length <= 1) {
			return;
		}
		const width = galleryViewportRef.current?.clientWidth ?? 0;
		if (width < 1) {
			return;
		}
		pendingDirectionRef.current = direction;
		setGalleryAnimating(true);
		setGalleryDragging(false);
		requestAnimationFrame(() => {
			setGalleryOffset(direction === 0 ? 0 : -direction * width);
		});
		window.clearTimeout(settleTimerRef.current);
		settleTimerRef.current = window.setTimeout(finishGalleryMotion, SLIDE_DURATION_MS + 80);
	}, [finishGalleryMotion, gallery.length, galleryAnimating]);

	useEffect(() => {
		window.clearTimeout(settleTimerRef.current);
		pendingDirectionRef.current = 0;
		setGalleryIndex(0);
		setGalleryOffset(0);
		setGalleryAnimating(false);
		setGalleryDragging(false);
		setHubPlateCaseGalleryIndex(0);
		scrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
	}, [pathname]);

	useEffect(() => () => window.clearTimeout(settleTimerRef.current), []);

	useEffect(() => {
		setPanelVisible(false);
		const syncVisibility = () => {
			const state = store.portfolioPlateCase;
			const visible = Boolean(
				state.open &&
				state.projectIndex === projectIndex &&
				state.progress >= 0.94
			);
			setPanelVisible((current) => (current === visible ? current : visible));
		};
		syncVisibility();
		return subscribe(store.portfolioPlateCase, syncVisibility);
	}, [projectIndex]);

	const handleGalleryPointerDown = useCallback((event) => {
		if (galleryAnimating || gallery.length <= 1 || event.button !== 0) {
			return;
		}
		dragRef.current = {
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			axis: null,
		};
		event.currentTarget.setPointerCapture(event.pointerId);
		setGalleryDragging(true);
	}, [gallery.length, galleryAnimating]);

	const handleGalleryPointerMove = useCallback((event) => {
		const drag = dragRef.current;
		if (drag.pointerId !== event.pointerId || galleryAnimating) {
			return;
		}
		const deltaX = event.clientX - drag.startX;
		const deltaY = event.clientY - drag.startY;
		if (!drag.axis) {
			if (Math.abs(deltaX) < 7 && Math.abs(deltaY) < 7) {
				return;
			}
			drag.axis = Math.abs(deltaX) > Math.abs(deltaY) ? "x" : "y";
		}
		if (drag.axis !== "x") {
			return;
		}
		event.preventDefault();
		const width = galleryViewportRef.current?.clientWidth ?? 1;
		setGalleryOffset(Math.max(-width * 1.08, Math.min(width * 1.08, deltaX)));
	}, [galleryAnimating]);

	const handleGalleryPointerEnd = useCallback((event) => {
		const drag = dragRef.current;
		if (drag.pointerId !== event.pointerId) {
			return;
		}
		dragRef.current.pointerId = null;
		setGalleryDragging(false);
		if (drag.axis !== "x") {
			setGalleryOffset(0);
			return;
		}
		const width = galleryViewportRef.current?.clientWidth ?? 1;
		const threshold = Math.min(92, Math.max(44, width * 0.14));
		if (Math.abs(galleryOffset) >= threshold) {
			settleGallery(galleryOffset < 0 ? 1 : -1);
		} else {
			settleGallery(0);
		}
	}, [galleryOffset, settleGallery]);

	const handleProjectChange = useCallback((direction) => {
		if (projectIndex < 0) {
			return;
		}
		const nextIndex = wrapIndex(projectIndex + direction, projectsData.length);
		requestHubPlateCaseSwitch(nextIndex);
		commitPortfolioHubCaseRoute(projectsData[nextIndex].path, pathname);
	}, [pathname, projectIndex]);

	const handleAllProjects = useCallback(() => {
		requestHubPlateCaseClose();
		commitPortfolioHubCaseRoute("/portfolio", pathname);
	}, [pathname]);

	if (!project || !panelData) {
		return null;
	}

	const slideEntries = gallery.length <= 1
		? [{ offset: 0, index: 0 }]
		: [-1, 0, 1].map((offset) => ({
			offset,
			index: wrapIndex(galleryIndex + offset, gallery.length),
		}));

	return (
		<section
			ref={scrollRef}
			className={[styles.caseViewport, panelVisible && styles.visible].filter(Boolean).join(" ")}
			data-hub-case-responsive="true"
			data-canvas-pointer-blocker="true"
			aria-hidden={!panelVisible}
			aria-label={`${getLocalizedText(COPY.case, locale)} ${project.id}: ${panelData.title}`}
		>
			<article className={styles.casePanel}>
				<header className={styles.caseHeader}>
					<div className={styles.caseHeading}>
						<span className={styles.eyebrow}>{panelData.currentProjectLabel}</span>
						<h1 className={styles.title}>{panelData.title}</h1>
						<p className={styles.typeLead}>{panelData.type}</p>
					</div>
					<div className={styles.caseNumber}>
						<span>{getLocalizedText(COPY.case, locale)}</span>
						<strong>{project.id}</strong>
						<small>/ {pad(projectsData.length)}</small>
					</div>
					<p className={styles.description}>{panelData.description}</p>
					<div className={styles.headerActions}>
						<button type="button" className={styles.allProjectsButton} onClick={handleAllProjects}>
							<span aria-hidden="true">←</span> {getLocalizedText(COPY.allProjects, locale)}
						</button>
						{panelData.url && (
							<a className={styles.siteLink} href={panelData.url} target="_blank" rel="noreferrer">
								{panelData.visitSiteLabel} <span aria-hidden="true">↗</span>
							</a>
						)}
					</div>
				</header>

				<div className={styles.gallerySection}>
					<div className={styles.galleryTopline}>
						<span>{getLocalizedText(COPY.gallery, locale)}</span>
						<span>{pad(galleryIndex + 1)} / {pad(Math.max(gallery.length, 1))}</span>
					</div>
					<div
						ref={galleryViewportRef}
						className={[styles.galleryViewport, galleryDragging && styles.dragging].filter(Boolean).join(" ")}
						tabIndex={gallery.length > 1 ? 0 : -1}
						onPointerDown={handleGalleryPointerDown}
						onPointerMove={handleGalleryPointerMove}
						onPointerUp={handleGalleryPointerEnd}
						onPointerCancel={handleGalleryPointerEnd}
						onKeyDown={(event) => {
							if (event.key === "ArrowLeft") settleGallery(-1);
							if (event.key === "ArrowRight") settleGallery(1);
						}}
						aria-roledescription="carousel"
					>
						<div
							className={[styles.galleryTrack, galleryAnimating && styles.animating].filter(Boolean).join(" ")}
							style={{ transform: `translate3d(${galleryOffset}px, 0, 0)` }}
							onTransitionEnd={finishGalleryMotion}
						>
							{slideEntries.map(({ offset, index }) => (
								<figure
									key={`${offset}-${index}-${gallery[index]}`}
									className={styles.gallerySlide}
									style={{ "--slideOffset": offset }}
									aria-hidden={offset !== 0}
								>
									<img
										src={gallery[index]}
										alt={offset === 0 ? `${panelData.title}, ${galleryIndex + 1}` : ""}
										draggable={false}
										loading={offset === 0 ? "eager" : "lazy"}
									/>
								</figure>
							))}
						</div>
					</div>
					<nav className={styles.galleryNavigation} aria-label={getLocalizedText(COPY.gallery, locale)}>
						<button type="button" onClick={() => settleGallery(-1)} disabled={gallery.length <= 1} aria-label={getLocalizedText(COPY.previousImage, locale)}>
							<span aria-hidden="true">‹</span>
						</button>
						<div className={styles.galleryDots}>
							{gallery.map((image, index) => (
								<button
									key={`${image}-${index}`}
									type="button"
									className={index === galleryIndex ? styles.activeDot : undefined}
									onClick={() => {
										if (index === galleryIndex || galleryAnimating) return;
										setGalleryIndex(index);
										setHubPlateCaseGalleryIndex(index);
									}}
									aria-label={`${index + 1}`}
									aria-current={index === galleryIndex ? "true" : undefined}
								/>
							))}
						</div>
						<button type="button" onClick={() => settleGallery(1)} disabled={gallery.length <= 1} aria-label={getLocalizedText(COPY.nextImage, locale)}>
							<span aria-hidden="true">›</span>
						</button>
					</nav>
				</div>

				<footer className={styles.caseFooter}>
					<dl className={styles.metaList}>
						<div><dt>{getLocalizedText(COPY.year, locale)}</dt><dd>{panelData.year}</dd></div>
						<div><dt>{getLocalizedText(COPY.type, locale)}</dt><dd>{panelData.type}</dd></div>
					</dl>
					<nav className={styles.projectNavigation} aria-label={getLocalizedText(COPY.allProjects, locale)}>
						<button type="button" onClick={() => handleProjectChange(-1)}>
							<span aria-hidden="true">←</span><span>{getLocalizedText(COPY.previousProject, locale)}</span>
						</button>
						<button type="button" onClick={() => handleProjectChange(1)}>
							<span>{getLocalizedText(COPY.nextProject, locale)}</span><span aria-hidden="true">→</span>
						</button>
					</nav>
				</footer>
			</article>
		</section>
	);
}
