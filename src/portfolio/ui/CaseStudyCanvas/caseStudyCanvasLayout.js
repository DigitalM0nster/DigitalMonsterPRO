/**
 * Layout левой колонки и зоны дуги на экране.
 *
 * NIPIGAS — гайд по редактированию: src/portfolio/projects/nipigas/LEFT_PANEL.md
 * Стили nipigas: nipigas/project.config.js → caseStudy.contentTopPx, panelWidth, leftPanel
 *
 * Этот файл считает leftPanel.{ x, y, width } — откуда canvas начнёт рисовать текст.
 */
import { MOBILE_BREAKPOINT } from "./caseStudyCanvasTheme.js";
import { resolveCaseStudyContentBottomPx, resolveCaseStudyContentTopPx, resolveHomeIconCircleTopLocalY } from "@/components/HTML/components/leftMenu/leftMenuLayout.js";
import { getLeftMenuWidthPx, resolveHeroTextOffsetX } from "@/three/scenes/home/heroText/heroTextLayout.js";
import { heroTextPositionConfig } from "@/three/scenes/home/heroText/heroTextPositionConfig.js";
import { caseStudyLeftPanelConfig } from "./caseStudyLeftPanelConfig.js";

/** Canvas и host совпадают по origin; для якоря меню надёжнее host. */
export function resolveCaseStudyCanvasSurface(canvas) {
	return canvas?.parentElement ?? canvas ?? null;
}

/**
 * @typedef {{
 *   isMobile: boolean,
 *   viewportWidth: number,
 *   leftPanel: { x: number, y: number, width: number, padding?: number },
 *   arc: { mode: string, anchorX: number, anchorY: number, radius: number, stateCount: number },
 *   centerClear: { x: number, y: number, width: number, height: number },
 * }} CaseStudyLayout
 */

/** Горизонтальный отступ контента — как hero-текст на главной (меню + offsetXAfterMenuVw). */
export function resolveCaseStudyContentLeftPx(viewportWidth) {
	return resolveHeroTextOffsetX(heroTextPositionConfig.offsetXAfterMenuVw, viewportWidth) * viewportWidth;
}

/** Ширина глобального LeftMenu из CSS-переменной. */
export function readLeftMenuReserve() {
	return getLeftMenuWidthPx(typeof window !== "undefined" ? window.innerWidth : 1920);
}

/**
 * Верх контентной зоны: home-icon или фиксированный offset от viewport (макет nipigas).
 */
export function resolveCaseStudyPanelTopLocal(surfaceEl, originY = 0, options = {}) {
	const cfg = caseStudyLeftPanelConfig;

	if (options.contentTopPx != null && Number.isFinite(options.contentTopPx)) {
		const surfaceTop = surfaceEl?.getBoundingClientRect?.()?.top ?? 0;
		return options.contentTopPx - surfaceTop - originY;
	}

	return (
		resolveHomeIconCircleTopLocalY(surfaceEl, cfg.contentTopGap) ??
		(resolveCaseStudyContentTopPx(cfg.contentTopGap) != null ? resolveCaseStudyContentTopPx(cfg.contentTopGap) - originY : null)
	);
}

/**
 * Высота зоны контента в локальных координатах surface (от якоря до низа рельсы).
 */
export function resolveCaseStudyContentMaxHeightLocal(surfaceEl, viewportHeight, options = {}) {
	const cfg = caseStudyLeftPanelConfig;
	const topLocal = resolveCaseStudyPanelTopLocal(surfaceEl, 0, options);
	const surfaceTop = surfaceEl?.getBoundingClientRect?.()?.top;

	if (topLocal == null || surfaceTop == null || !Number.isFinite(surfaceTop)) {
		return resolveCaseStudyContentBounds(viewportHeight).maxHeight;
	}

	const bottomViewport = Number.isFinite(options.contentBottomInsetPx)
		? viewportHeight - options.contentBottomInsetPx
		: resolveCaseStudyContentBottomPx(viewportHeight, cfg.contentBottomGap);
	const bottomLocal = bottomViewport - surfaceTop;

	return Math.max(40, bottomLocal - topLocal);
}

/**
 * Вертикальная зона рельсы меню — для centerClear дуги, не для ужимания контента.
 *
 * @param {number} viewportHeight
 */
export function resolveCaseStudyContentBounds(viewportHeight) {
	const cfg = caseStudyLeftPanelConfig;
	const top = resolveCaseStudyContentTopPx(cfg.contentTopGap);
	const bottom = resolveCaseStudyContentBottomPx(viewportHeight, cfg.contentBottomGap);

	if (top == null) {
		return { top: 0, bottom, maxHeight: Math.max(80, bottom) };
	}

	const maxHeight = Math.max(80, bottom - top);

	return { top, bottom, maxHeight };
}

/**
 * @param {number} width
 * @param {number} height
 * @param {number} stateCount
 * @param {{ x?: number, y?: number }} [canvasOrigin]
 * @param {HTMLCanvasElement | null} [canvas]
 * @param {{ panelWidth?: { min?: number, max?: number, ratio?: number }, contentTopPx?: number, contentBottomInsetPx?: number }} [options]
 */
export function resolveCaseStudyLayout(width, height, stateCount, canvasOrigin = { x: 0, y: 0 }, canvas = null, options = {}) {
	const isMobile = width < MOBILE_BREAKPOINT;
	const cfg = caseStudyLeftPanelConfig;
	const originX = canvasOrigin.x ?? 0;
	const originY = canvasOrigin.y ?? 0;
	const surface = resolveCaseStudyCanvasSurface(canvas);
	const panelTopLocal = resolveCaseStudyPanelTopLocal(surface, originY, options);

	if (panelTopLocal == null) {
		return null;
	}

	if (isMobile) {
		const maxHeight = resolveCaseStudyContentMaxHeightLocal(surface, height, options);

		return {
			isMobile: true,
			viewportWidth: width,
			leftPanel: {
				x: 14 - originX,
				y: panelTopLocal,
				width: width - 28,
				padding: 16,
			},
			arc: {
				mode: "compact",
				stateCount,
				isMobile: true,
			},
			centerClear: {
				x: 0,
				y: panelTopLocal,
				width,
				height: maxHeight,
			},
		};
	}

	const maxHeight = resolveCaseStudyContentMaxHeightLocal(surface, height, options);
	const arcTop = Math.min(116, Math.max(88, height * 0.105));
	const arcBottom = panelTopLocal + maxHeight;
	const panelWidthOverride = options.panelWidth ?? {};
	const panelWidthMin = panelWidthOverride.min ?? cfg.panelWidthMin;
	const panelWidthMax = panelWidthOverride.max ?? cfg.panelWidthMax;
	const panelWidthRatio = panelWidthOverride.ratio ?? cfg.panelWidthRatio;
	const panelWidth = Math.min(panelWidthMax, Math.max(panelWidthMin, width * panelWidthRatio));
	const panelX = resolveCaseStudyContentLeftPx(width) - originX;

	return {
		isMobile: false,
		viewportWidth: width,
		leftPanel: {
			x: panelX,
			y: panelTopLocal,
			width: panelWidth,
			padding: 0,
		},
		arc: {
			mode: "arc",
			stateCount,
			isMobile: false,
			viewportTop: arcTop,
			viewportBottom: arcBottom,
		},
		centerClear: {
			x: panelX + panelWidth + 32,
			y: panelTopLocal,
			width: Math.max(200, width - panelX - panelWidth - 320),
			height: maxHeight,
		},
	};
}
