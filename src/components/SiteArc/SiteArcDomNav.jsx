/**
 * Right-arc project labels + hit targets as DOM.
 * Track / nodes / glow — WebGL. Labels — CanvasGlitchText snake (hub list engine).
 * Num/title offsets match caseStudyCanvasDraw (absolute around node Y).
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import PropTypes from "prop-types";
import { useLocation } from "react-router-dom";
import { useSnapshot } from "valtio";
import { store } from "@/app/store.jsx";
import {
	markSiteArcDirty,
	registerSiteArcPaint,
	wakeCaseStudyAnimationFrame,
} from "@/pages/portfolio/core/caseStudyAnimationFrame.js";
import { syncArcGlowTargetFromScroll } from "./siteArcGlowMotion.js";
import { setSiteArcPreviewProjectId } from "./siteArcProjects.js";
import { buildSiteArcNavLayout } from "./siteArcNavLayout.js";
import { SITE_ARC_DISPLAY_FONT, SITE_ARC_TEXT_COLOR } from "./siteArcConfig.js";
import {
	disposeSiteArcNavSnakeIfOrphaned,
	paintSiteArcNavSnakeDomLabel,
	playSiteArcNavSnakeHover,
	registerSiteArcNavSnakeRepaint,
	syncSiteArcNavSnakeLines,
} from "./siteArcNavSnake.js";
import styles from "./SiteArcDomNav.module.scss";
import { getSiteArcViewportOpacity } from "./siteArcCarouselMotion.js";

const MAX_ITEMS = 16;
const MAX_TITLE_LINES = 2;
const SLOT_KEYS = Array.from({ length: MAX_ITEMS }, (_, i) => `arc-slot-${i}`);
/** Em letter-spacing for CanvasGlitchText (not px). Hub titles ~0.08–0.12; arc needs more air at 9px. */
const TITLE_LETTER_SPACING_EM = 0.16;
const NUM_LETTER_SPACING_EM = 0.06;
/** Matches siteArcNavSnake CanvasGlitchText padding — cancel so glyphs stay on the node stack. */
const SNAKE_PAD_X = 10;
const SNAKE_PAD_Y = 6;

function clearCanvas(canvas) {
	if (!(canvas instanceof HTMLCanvasElement)) {
		return;
	}
	if (canvas.width !== 1) canvas.width = 1;
	if (canvas.height !== 1) canvas.height = 1;
	canvas.style.width = "0px";
	canvas.style.height = "0px";
	canvas.style.top = "0px";
}

/**
 * @param {{
 *   activeItemId?: string | null,
 *   onActivateItem?: ((item: object) => void) | null,
 * }} props
 */
export default function SiteArcDomNav({
	activeItemId = null,
	onActivateItem = null,
}) {
	const { pathname } = useLocation();
	const snap = useSnapshot(store);
	const hostRef = useRef(/** @type {HTMLDivElement | null} */ (null));
	const itemRefs = useRef([]);
	// Slot children are fixed for this mount. Resolve them once, not on every
	// animation/snake repaint. Stable callbacks also survive route re-renders.
	const itemRefCallbacks = useMemo(() => SLOT_KEYS.map((_, index) => (element) => {
		itemRefs.current[index] = element ? {
			element,
			numCanvas: element.querySelector("canvas[data-arc-num]"),
			titleCanvases: element.querySelectorAll("canvas[data-arc-title-line]"),
			labelHit: element.querySelector("[data-arc-label-hit]"),
			empty: false,
		} : null;
	}), []);
	const layoutRef = useRef(/** @type {ReturnType<typeof buildSiteArcNavLayout> | null} */ (null));
	const viewportRef = useRef({ width: 0, height: 0 });
	const measureViewport = useCallback(() => {
		viewportRef.current.width = hostRef.current?.clientWidth || window.innerWidth;
		viewportRef.current.height = hostRef.current?.clientHeight || window.innerHeight;
	}, []);

	const syncDom = useCallback(() => {
		const host = hostRef.current;
		if (!host) {
			return;
		}
		const w = viewportRef.current.width || window.innerWidth;
		const h = viewportRef.current.height || window.innerHeight;
		const layout = buildSiteArcNavLayout(w, h, w < 768);
		const viewportOpacity = getSiteArcViewportOpacity(w);
		host.style.opacity = String(viewportOpacity);
		host.style.visibility = viewportOpacity > 0.01 ? "visible" : "hidden";
		layoutRef.current = layout;
		host.style.setProperty("--arc-active", layout.activeColor);

		const items = layout.items;
		const activeColor = layout.activeColor;
		const inactiveColor = `rgba(255, 255, 255, ${layout.inactiveTextOpacity ?? 0.45})`;
		const indexFont = layout.indexFontPx ?? 10;
		const titleFont = layout.titleFontPx ?? 9;
		const titleLineH = titleFont * 1.15;
		// Same split as caseStudyCanvasDraw: num above node, title below.
		const stackGap = layout.stackGap ?? 8;

		for (let i = 0; i < MAX_ITEMS; i += 1) {
			const slot = itemRefs.current[i];
			if (!slot) {
				continue;
			}
			const { element: el, numCanvas, titleCanvases, labelHit } = slot;
			const item = items[i] ?? null;

			if (!item) {
				// Hidden slots were cleared on their first empty frame. Clear again
				// only after actual content occupied the slot (e.g. another route).
				if (slot.empty) continue;
				slot.empty = true;
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
			slot.empty = false;

			const color = item.isActive ? activeColor : inactiveColor;
			const titleColor = item.isActive ? SITE_ARC_TEXT_COLOR : inactiveColor;
			const titleLines = item.titleLines?.length ? item.titleLines : [item.title];
			let maxLabelWidth = 48;

			el.hidden = false;
			el.dataset.projectId = item.id;
			el.style.pointerEvents = "auto";
			// Labels live on the inner side of the right arc: their right edge is
			// anchored before the node, while the node itself stays on the orbit.
			el.style.left = `${item.x - item.labelGap}px`;
			el.style.top = `${item.y}px`;
			el.style.setProperty("--node-offset", `${item.labelGap}px`);
			el.style.opacity = String(item.opacity);
			el.classList.toggle(styles.itemActive, item.isActive);

			syncSiteArcNavSnakeLines(item.id, titleLines.length);

			if (numCanvas instanceof HTMLCanvasElement) {
				// caseStudyCanvasDraw: y = -stackGap/2 - indexFontSize (minus glow pad)
				// CanvasGlitchText has horizontal glow padding. With a right-edge
				// anchor the positive compensation puts the glyph edge (not the
				// transparent canvas edge) next to the node.
				numCanvas.style.top = `${-(stackGap / 2) - indexFont - SNAKE_PAD_Y}px`;
				const metrics = paintSiteArcNavSnakeDomLabel(numCanvas, `${item.id}::num`, item.chapterNum, {
					fontSize: indexFont,
					fontWeight: 500,
					letterSpacing: NUM_LETTER_SPACING_EM,
					fontFamily: SITE_ARC_DISPLAY_FONT,
					color,
					uppercase: false,
				});
				maxLabelWidth = Math.max(maxLabelWidth, metrics?.width ?? 0);
				// The item is a zero-width right-edge anchor. CSS `right` keeps this
				// stable even while CanvasGlitchText changes the canvas width.
				numCanvas.style.left = "auto";
				numCanvas.style.right = `${-SNAKE_PAD_X}px`;
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
				canvas.style.top = `${stackGap / 2 + line * titleLineH - SNAKE_PAD_Y}px`;
				const metrics = paintSiteArcNavSnakeDomLabel(canvas, `${item.id}::${line}`, lineText, {
					fontSize: titleFont,
					fontWeight: 500,
					letterSpacing: TITLE_LETTER_SPACING_EM,
					fontFamily: SITE_ARC_DISPLAY_FONT,
					color: titleColor,
					uppercase: true,
				});
				maxLabelWidth = Math.max(maxLabelWidth, metrics?.width ?? 0);
				canvas.style.left = "auto";
				canvas.style.right = `${-SNAKE_PAD_X}px`;
			}

			// One hit region spans the left-growing labels, the gap and the node.
			if (labelHit instanceof HTMLElement) {
				const numTop = -(stackGap / 2) - indexFont;
				const titleCount = Math.min(MAX_TITLE_LINES, titleLines.filter(Boolean).length);
				const titleBottom = titleCount > 0
					? stackGap / 2 + titleCount * titleLineH
					: 0;
				const padY = 4;
				const top = Math.min(numTop, 0) - padY;
				const bottom = Math.max(titleBottom, 0) + padY;
				// These widths were just computed by the painter. Reading clientWidth
				// here after style writes forces layout once per label stack.
				const maxW = Math.round(maxLabelWidth);
				const gap = Math.max(0, item.labelGap ?? 30);
				const nodeHitR = 18;
				const left = -(maxW + 8);
				labelHit.style.left = `${left}px`;
				labelHit.style.top = `${top}px`;
				labelHit.style.height = `${Math.max(1, bottom - top)}px`;
				labelHit.style.width = `${Math.max(48, maxW + gap + nodeHitR + 16)}px`;
			}
		}
	}, []);

	useLayoutEffect(() => {
		measureViewport();
		registerSiteArcPaint(syncDom);
		const unregisterSnake = registerSiteArcNavSnakeRepaint(syncDom);
		syncDom();
		wakeCaseStudyAnimationFrame();
		return () => {
			registerSiteArcPaint(null);
			unregisterSnake();
			disposeSiteArcNavSnakeIfOrphaned();
		};
	}, [syncDom, measureViewport]);

	useEffect(() => {
		const onResize = () => {
			measureViewport();
			markSiteArcDirty();
			wakeCaseStudyAnimationFrame();
		};
		window.addEventListener("resize", onResize);
		const observer = new ResizeObserver(onResize);
		if (hostRef.current) observer.observe(hostRef.current);
		return () => {
			window.removeEventListener("resize", onResize);
			observer.disconnect();
		};
	}, [measureViewport]);

	useEffect(() => {
		markSiteArcDirty();
		wakeCaseStudyAnimationFrame();
	}, [snap.siteLocale, snap.portfolioExperience?.slug, pathname]);

	const onActivateIndex = useCallback((index) => {
		const item = layoutRef.current?.items?.[index];
		if (!item?.route) {
			return;
		}
		if (item.id !== activeItemId) {
			setSiteArcPreviewProjectId(item.id);
			if (Number.isFinite(item.angle)) {
				syncArcGlowTargetFromScroll(item.angle);
			}
			markSiteArcDirty();
		}
		onActivateItem?.(item);
	}, [activeItemId, onActivateItem]);

	const onHoverSnake = useCallback((index) => {
		const el = itemRefs.current[index]?.element;
		const projectId = el?.dataset?.projectId;
		if (!projectId || el?.hidden) {
			return;
		}
		playSiteArcNavSnakeHover(projectId);
	}, []);

	return (
		<div ref={hostRef} className={styles.arcNav} data-site-arc-dom>
			{SLOT_KEYS.map((key, index) => (
				<div
					key={key}
					ref={itemRefCallbacks[index]}
					className={styles.item}
					hidden
					onPointerEnter={() => onHoverSnake(index)}
					onClick={() => onActivateIndex(index)}
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

SiteArcDomNav.propTypes = {
	activeItemId: PropTypes.string,
	onActivateItem: PropTypes.func,
};
