/**
 * Right-arc project labels + hit targets as DOM.
 * Track / nodes / glow — WebGL. Labels — CanvasGlitchText snake (hub list engine).
 * Num/title offsets match caseStudyCanvasDraw (absolute around node Y).
 */
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import PropTypes from "prop-types";
import { useLocation } from "react-router-dom";
import { useSnapshot } from "valtio";
import { store } from "@/store.jsx";
import { usePortfolioProject } from "@/portfolio/core/PortfolioProjectContext.jsx";
import {
	markCaseStudyArcDirty,
	registerCaseStudyArcPaint,
	wakeCaseStudyAnimationFrame,
} from "@/portfolio/core/caseStudyAnimationFrame.js";
import { syncArcGlowTargetFromScroll } from "./caseStudyArcGlowMotion.js";
import { setCaseStudyArcPreviewProjectId } from "./caseStudyArcProjects.js";
import { activateCaseProjectCanvasNavigation } from "./caseProjectCanvasNavigation.js";
import { buildCaseStudyArcNavLayout } from "./caseStudyArcNavLayout.js";
import { useCaseStudyArcLifecycle } from "./useCaseStudyArcLifecycle.js";
import { CASE_STUDY_CANVAS_THEME } from "./caseStudyCanvasTheme.js";
import { CASE_STUDY_DISPLAY_FONT } from "./caseStudyCanvasText.js";
import { caseChromeOwnsHexHitAtClientY } from "@/three/render/overlay/hexHitOwnership.js";
import {
	disposeCaseStudyArcNavSnakeIfOrphaned,
	paintCaseStudyArcNavSnakeDomLabel,
	playCaseStudyArcNavSnakeHover,
	registerCaseStudyArcNavSnakeRepaint,
	syncCaseStudyArcNavSnakeLines,
} from "./caseStudyArcNavSnake.js";
import styles from "./CaseStudyArcDomNav.module.scss";

const MAX_ITEMS = 16;
const MAX_TITLE_LINES = 2;
const SLOT_KEYS = Array.from({ length: MAX_ITEMS }, (_, i) => `arc-slot-${i}`);
/** Em letter-spacing for CanvasGlitchText (not px). Hub titles ~0.08–0.12; arc needs more air at 9px. */
const TITLE_LETTER_SPACING_EM = 0.16;
const NUM_LETTER_SPACING_EM = 0.06;
/** Matches caseStudyArcNavSnake CanvasGlitchText padding — cancel so glyphs stay on the node stack. */
const SNAKE_PAD_X = 10;
const SNAKE_PAD_Y = 6;

function clearCanvas(canvas) {
	if (!(canvas instanceof HTMLCanvasElement)) {
		return;
	}
	canvas.width = 1;
	canvas.height = 1;
	canvas.style.width = "0px";
	canvas.style.height = "0px";
	canvas.style.top = "0px";
}

/**
 * @param {{
 *   skipPanelIntro?: boolean,
 *   panelIntroDelayMs?: number,
 * }} props
 */
export default function CaseStudyArcDomNav({
	skipPanelIntro = false,
	panelIntroDelayMs = 500,
}) {
	const { project } = usePortfolioProject();
	const { pathname } = useLocation();
	const snap = useSnapshot(store);
	const hostRef = useRef(/** @type {HTMLDivElement | null} */ (null));
	const itemRefs = useRef(/** @type {Array<HTMLDivElement | null>} */ ([]));
	const layoutRef = useRef(/** @type {ReturnType<typeof buildCaseStudyArcNavLayout> | null} */ (null));

	useCaseStudyArcLifecycle({
		enabled: true,
		skipPanelIntro,
		panelIntroDelayMs,
	});

	const syncDom = useCallback(() => {
		const host = hostRef.current;
		if (!host) {
			return;
		}
		const w = host.clientWidth || window.innerWidth;
		const h = host.clientHeight || window.innerHeight;
		const layout = buildCaseStudyArcNavLayout(w, h, w < 768);
		layoutRef.current = layout;
		host.style.setProperty("--arc-active", layout.activeColor || CASE_STUDY_CANVAS_THEME.cyan);

		const items = layout.items;
		const activeColor = layout.activeColor || CASE_STUDY_CANVAS_THEME.cyan;
		const inactiveColor = `rgba(255, 255, 255, ${layout.inactiveTextOpacity ?? 0.45})`;
		const indexFont = layout.indexFontPx ?? 10;
		const titleFont = layout.titleFontPx ?? 9;
		const titleLineH = titleFont * 1.15;
		// Same split as caseStudyCanvasDraw: num above node, title below.
		const stackGap = layout.stackGap ?? 8;

		for (let i = 0; i < MAX_ITEMS; i += 1) {
			const el = itemRefs.current[i];
			if (!el) {
				continue;
			}
			const item = items[i] ?? null;
			const numCanvas = el.querySelector("canvas[data-arc-num]");
			const titleCanvases = el.querySelectorAll("canvas[data-arc-title-line]");
			const labelHit = el.querySelector("[data-arc-label-hit]");

			if (!item) {
				el.hidden = true;
				el.dataset.projectId = "";
				el.style.opacity = "0";
				el.style.pointerEvents = "none";
				clearCanvas(numCanvas);
				titleCanvases.forEach((c) => clearCanvas(c));
				if (labelHit instanceof HTMLElement) {
					labelHit.style.width = "0px";
					labelHit.style.height = "0px";
				}
				continue;
			}

			const color = item.isActive ? activeColor : inactiveColor;
			const titleColor = item.isActive ? CASE_STUDY_CANVAS_THEME.text : inactiveColor;
			const titleLines = item.titleLines?.length ? item.titleLines : [item.title];

			el.hidden = false;
			el.dataset.projectId = item.id;
			el.style.pointerEvents = "auto";
			el.style.left = `${item.x + item.labelGap}px`;
			el.style.top = `${item.y}px`;
			el.style.setProperty("--node-offset", `${-item.labelGap}px`);
			el.style.opacity = String(item.opacity);
			el.classList.toggle(styles.itemActive, item.isActive);

			syncCaseStudyArcNavSnakeLines(item.id, titleLines.length);

			if (numCanvas instanceof HTMLCanvasElement) {
				// caseStudyCanvasDraw: y = -stackGap/2 - indexFontSize (minus glow pad)
				numCanvas.style.left = `${-SNAKE_PAD_X}px`;
				numCanvas.style.top = `${-(stackGap / 2) - indexFont - SNAKE_PAD_Y}px`;
				paintCaseStudyArcNavSnakeDomLabel(numCanvas, `${item.id}::num`, item.chapterNum, {
					fontSize: indexFont,
					fontWeight: 500,
					letterSpacing: NUM_LETTER_SPACING_EM,
					fontFamily: CASE_STUDY_DISPLAY_FONT,
					color,
					uppercase: false,
				});
			}

			for (let line = 0; line < MAX_TITLE_LINES; line += 1) {
				const canvas = titleCanvases[line];
				const lineText = titleLines[line] ?? "";
				if (!(canvas instanceof HTMLCanvasElement)) {
					continue;
				}
				if (!lineText) {
					clearCanvas(canvas);
					continue;
				}
				// caseStudyCanvasDraw: y = stackGap/2 + lineIndex * titleLineH (minus glow pad)
				canvas.style.left = `${-SNAKE_PAD_X}px`;
				canvas.style.top = `${stackGap / 2 + line * titleLineH - SNAKE_PAD_Y}px`;
				paintCaseStudyArcNavSnakeDomLabel(canvas, `${item.id}::${line}`, lineText, {
					fontSize: titleFont,
					fontWeight: 500,
					letterSpacing: TITLE_LETTER_SPACING_EM,
					fontFamily: CASE_STUDY_DISPLAY_FONT,
					color: titleColor,
					uppercase: true,
				});
			}

			// Hit: node → gap → num/titles (item left is at text; node is --node-offset).
			if (labelHit instanceof HTMLElement) {
				const numTop = -(stackGap / 2) - indexFont;
				const titleCount = Math.min(MAX_TITLE_LINES, titleLines.filter(Boolean).length);
				const titleBottom = titleCount > 0
					? stackGap / 2 + titleCount * titleLineH
					: 0;
				const padY = 4;
				const top = Math.min(numTop, 0) - padY;
				const bottom = Math.max(titleBottom, 0) + padY;
				let maxW = 48;
				if (numCanvas instanceof HTMLCanvasElement) {
					maxW = Math.max(maxW, numCanvas.clientWidth || 0);
				}
				titleCanvases.forEach((c) => {
					if (c instanceof HTMLCanvasElement) {
						maxW = Math.max(maxW, c.clientWidth || 0);
					}
				});
				const gap = Math.max(0, item.labelGap ?? 30);
				const nodeHitR = 18;
				const left = -(gap + nodeHitR);
				labelHit.style.left = `${left}px`;
				labelHit.style.top = `${top}px`;
				labelHit.style.height = `${Math.max(1, bottom - top)}px`;
				labelHit.style.width = `${Math.max(48, -left + maxW + 8)}px`;
			}
		}
	}, []);

	useLayoutEffect(() => {
		registerCaseStudyArcPaint(syncDom);
		const unregisterSnake = registerCaseStudyArcNavSnakeRepaint(syncDom);
		syncDom();
		wakeCaseStudyAnimationFrame();
		return () => {
			registerCaseStudyArcPaint(null);
			unregisterSnake();
			disposeCaseStudyArcNavSnakeIfOrphaned();
		};
	}, [syncDom]);

	useEffect(() => {
		const onResize = () => {
			markCaseStudyArcDirty();
			wakeCaseStudyAnimationFrame();
		};
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, []);

	useEffect(() => {
		markCaseStudyArcDirty();
		wakeCaseStudyAnimationFrame();
	}, [snap.siteLocale, snap.portfolioExperience?.slug, pathname]);

	const onActivateIndex = useCallback((index, clientY) => {
		if (!caseChromeOwnsHexHitAtClientY(clientY)) {
			return;
		}
		const item = layoutRef.current?.items?.[index];
		if (!item?.route) {
			return;
		}
		if (item.id !== project.config.id) {
			setCaseStudyArcPreviewProjectId(item.id);
			if (Number.isFinite(item.angle)) {
				syncArcGlowTargetFromScroll(item.angle);
			}
			markCaseStudyArcDirty();
		}
		activateCaseProjectCanvasNavigation(
			{ type: "projectNavigation", id: item.id, targetPath: item.route },
			pathname,
		);
	}, [pathname, project.config.id]);

	const onHoverSnake = useCallback((index) => {
		const el = itemRefs.current[index];
		const projectId = el?.dataset?.projectId;
		if (!projectId || el?.hidden) {
			return;
		}
		playCaseStudyArcNavSnakeHover(projectId);
	}, []);

	return (
		<div ref={hostRef} className={styles.arcNav} data-case-study-arc-dom>
			{SLOT_KEYS.map((key, index) => (
				<div
					key={key}
					ref={(el) => {
						itemRefs.current[index] = el;
					}}
					className={styles.item}
					hidden
					onPointerEnter={() => onHoverSnake(index)}
					onClick={(event) => onActivateIndex(index, event.clientY)}
				>
					<span className={styles.hit} aria-hidden="true" />
					<span className={styles.labelHit} data-arc-label-hit aria-hidden="true" />
					<canvas className={styles.num} data-arc-num aria-hidden="true" />
					{Array.from({ length: MAX_TITLE_LINES }, (_, line) => (
						<canvas
							key={`${key}-t${line}`}
							className={styles.titleLine}
							data-arc-title-line={line}
							aria-hidden="true"
						/>
					))}
				</div>
			))}
		</div>
	);
}

CaseStudyArcDomNav.propTypes = {
	skipPanelIntro: PropTypes.bool,
	panelIntroDelayMs: PropTypes.number,
};
