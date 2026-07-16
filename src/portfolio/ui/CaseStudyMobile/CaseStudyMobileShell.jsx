import { useCallback, useEffect, useMemo, useState } from "react";
import { usePortfolioProject } from "@/portfolio/core/PortfolioProjectContext.jsx";
import { buildCaseStudyFrameData, resolveStateChapterLabel } from "@/portfolio/core/caseStudyFrameData.js";
import { parseTraitMetricRow } from "../CaseStudyCanvas/caseStudyLeftPanelTraitsList.js";
import CaseStudyMobileBottomSheet from "./CaseStudyMobileBottomSheet.jsx";
import { useCaseStudyMobileSwipe } from "./useCaseStudyMobileSwipe.js";
import styles from "./CaseStudyMobileShell.module.scss";
import { useSnapshot } from "valtio";
import { store } from "@/store.jsx";
import { normalizeSiteLocale } from "@/utils/siteLocale.js";

const MOBILE_COPY = {
	ru: { details: "Подробнее", swipe: "Свайпните, чтобы продолжить →", close: "Закрыть" },
	en: { details: "Details", swipe: "Swipe to continue →", close: "Close" },
	zh: { details: "详情", swipe: "滑动以继续 →", close: "关闭" },
};

/**
 * Мобильный режим кейса: компактная шапка + горизонтальные карточки сцен.
 */
export default function CaseStudyMobileShell() {
	const { project, activeState, activeStateIndex, activeStateId, goToState } = usePortfolioProject();
	const locale = normalizeSiteLocale(useSnapshot(store).siteLocale);
	const localeCopy = MOBILE_COPY[locale];
	const [detailsOpen, setDetailsOpen] = useState(false);
	const [cardStepPx, setCardStepPx] = useState(0);

	const onIndexChange = useCallback(
		(index) => {
			const state = project.states[index];
			if (!state) {
				return;
			}
			goToState(state.id);
		},
		[goToState, project.states],
	);

	const swipe = useCaseStudyMobileSwipe({
		stateCount: project.states.length,
		activeIndex: activeStateIndex,
		onIndexChange,
		blocked: detailsOpen,
	});

	useEffect(() => {
		const viewport = swipe.trackRef.current;
		if (!viewport || typeof ResizeObserver === "undefined") {
			return undefined;
		}

		const measure = () => {
			const width = viewport.clientWidth;
			setCardStepPx(Math.max(1, width - 20 + 20));
		};

		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(viewport);
		return () => observer.disconnect();
	}, [swipe.trackRef]);

	const caseStudy = project.config.caseStudy ?? {};
	const cardGap = 20;
	const cardPeek = 20;
	const cardWidth = `calc(100% - ${cardPeek}px)`;
	const isDragging = Math.abs(swipe.dragOffsetPx) > 0.5;
	const trackTranslatePx = -activeStateIndex * cardStepPx + swipe.dragOffsetPx;

	const mobileContent = locale === "ru" ? project.mobileContent?.[activeStateId] : null;
	const frameData = useMemo(
		() => buildCaseStudyFrameData(project, activeState, activeStateIndex, activeStateId, { locale }),
		[project, activeState, activeStateIndex, activeStateId, locale],
	);

	const shortDescription = mobileContent?.shortDescription ?? frameData.descriptionParagraphs?.[0] ?? frameData.description;
	const detailsTitle = mobileContent?.detailsTitle ?? localeCopy.details;
	const showDetailsButton = (frameData.descriptionParagraphs?.length ?? 0) > 1 || (frameData.description?.length ?? 0) > (shortDescription?.length ?? 0) + 40;

	return (
		<div className={styles.mobileShell} data-case-study-mobile>
			<div className={styles.sceneHeader}>
				<div className={styles.sceneIdentity}>
					<span className={styles.sceneCounter}>
						{String(activeStateIndex + (caseStudy.chapterBase ?? 1)).padStart(2, "0")} / {String(project.states.length).padStart(2, "0")}
					</span>
					{caseStudy.footerLabel && (
						<span className={styles.brandLabel}>
							{caseStudy.footerLabelCopy?.[locale] ?? caseStudy.footerLabel}
						</span>
					)}
				</div>
				<div className={styles.progressRail} aria-hidden="true">
					{project.states.map((state, index) => (
						<button
							key={state.id}
							type="button"
							className={[styles.progressDot, index === activeStateIndex && styles.active].filter(Boolean).join(" ")}
							onClick={() => onIndexChange(index)}
							aria-label={resolveStateChapterLabel(project, index, locale)}
						/>
					))}
				</div>
			</div>

			<div
				ref={swipe.trackRef}
				className={styles.cardsViewport}
				onPointerDown={swipe.onPointerDown}
				onPointerMove={swipe.onPointerMove}
				onPointerUp={swipe.onPointerUp}
				onPointerCancel={swipe.onPointerCancel}
			>
				<div
					className={styles.cardsTrack}
					style={{
						gap: `${cardGap}px`,
						transform: `translate3d(${trackTranslatePx}px, 0, 0)`,
						transition: isDragging ? "none" : "transform 0.28s ease",
					}}
				>
					{project.states.map((state, index) => {
						const chapterLabel = resolveStateChapterLabel(project, index, locale);
						const content = locale === "ru" ? project.mobileContent?.[state.id] : null;
						const cardFrame = buildCaseStudyFrameData(project, state, index, state.id, { locale });
						const cardDescription = content?.shortDescription ?? cardFrame.descriptionParagraphs?.[0] ?? cardFrame.description;
						const cardFeatures = content?.shortFeatures ?? cardFrame.features;
						const cardMetrics = cardFrame.metrics;
						const badgeMatch = chapterLabel.match(/^(\S+)\s*(.*)$/);
						const badgeChapter = badgeMatch?.[1] ?? chapterLabel;
						const badgeRest = badgeMatch?.[2] ?? "";

						return (
							<article
								key={state.id}
								className={styles.sceneCard}
								style={{ width: cardWidth, flex: `0 0 ${cardWidth}` }}
								aria-hidden={index !== activeStateIndex}
							>
								<p className={styles.sceneBadge}>
									<span className={styles.sceneBadgeChapter}>{badgeChapter}</span>
									{badgeRest && <span className={styles.sceneBadgeRest}>{badgeRest}</span>}
								</p>
								<h2 className={styles.sceneTitle}>{cardFrame.title}</h2>
								<p className={styles.sceneDescription}>{cardDescription}</p>
								{cardFeatures?.length > 0 ? (
									<ul className={styles.featureList}>
										{cardFeatures.map((feature) => (
											<li key={feature.title} className={styles.featureItem}>
												<span className={styles.featureTitle}>{feature.title}</span>
												{feature.subtitle && <span className={styles.featureSubtitle}>{feature.subtitle}</span>}
											</li>
										))}
									</ul>
								) : cardMetrics?.length > 0 ? (
									<ul className={styles.traitsList}>
										{cardMetrics.map((metric) => {
											const row = parseTraitMetricRow(metric);
											return (
												<li key={`${row.topText}-${row.bottomText}`} className={styles.traitItem}>
													<span className={styles.traitGlyph} aria-hidden="true">
														{row.glyphType === "number" ? row.glyph : "+"}
													</span>
													<div className={styles.traitCopy}>
														<span className={styles.traitTop}>{row.topText}</span>
														<span className={styles.traitBottom}>{row.bottomText}</span>
													</div>
												</li>
											);
										})}
									</ul>
								) : null}
								{index === activeStateIndex && showDetailsButton && (
									<button type="button" className={styles.detailsButton} onClick={() => setDetailsOpen(true)}>
										{detailsTitle} +
									</button>
								)}
							</article>
						);
					})}
				</div>

				{swipe.showSwipeHint && activeStateIndex === 0 && (
					<p className={styles.swipeHint}>{localeCopy.swipe}</p>
				)}
			</div>

			<CaseStudyMobileBottomSheet
				open={detailsOpen}
				title={frameData.title}
				paragraphs={frameData.descriptionParagraphs}
				closeLabel={localeCopy.close}
				onClose={() => setDetailsOpen(false)}
			/>
		</div>
	);
}
