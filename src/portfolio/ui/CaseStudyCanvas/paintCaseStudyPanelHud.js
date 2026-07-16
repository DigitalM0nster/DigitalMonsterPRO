/**
 * Shared offscreen paint for case panel HUD (left content + project nav).
 * WebGL path: paint from/to once per content change; stage mix is a shader uniform.
 */
import { resolveCaseStudyLayout } from "@/portfolio/ui/CaseStudyCanvas/caseStudyCanvasLayout.js";
import { drawLeftPanel } from "@/portfolio/ui/CaseStudyCanvas/caseStudyCanvasDraw.js";
import { resolveLeftPanelDrawConfig } from "@/portfolio/ui/CaseStudyCanvas/caseStudyLeftPanelConfig.js";
import {
	prepareCaseStudyCanvasContext,
	resolveCaseStudyPanelHudPixelRatio,
} from "@/portfolio/ui/CaseStudyCanvas/caseStudyCanvasSurface.js";
import { measureLeftPanelFlowHeight } from "@/portfolio/ui/CaseStudyCanvas/caseStudyLeftPanelFlow.js";
import { resolveCaseProjectNavigationReservePx } from "@/portfolio/ui/CaseProjectNavigation/caseProjectNavigationLayout.js";
import {
	drawCaseProjectCanvasNavigation,
	resolveCaseProjectCanvasNavigationLayout,
} from "@/portfolio/ui/CaseStudyCanvas/caseProjectCanvasNavigation.js";
import { store } from "@/store.jsx";

/**
 * @returns {{ zoneTop: number, zoneBottom: number, zoneHeight: number } | null}
 */
export function resolveLeftPanelVerticalZone(caseNavigationLayout, canvasOriginY = 0, cachedZoneRef = null, zoneKey = "") {
	if (cachedZoneRef?.current && cachedZoneRef.current.key === zoneKey) {
		return cachedZoneRef.current.zone;
	}

	const brand = typeof document !== "undefined"
		? document.querySelector("[data-site-top-hud-brand]")
		: null;
	if (!brand || !caseNavigationLayout?.allProjects) {
		return null;
	}

	const brandRect = brand.getBoundingClientRect();
	const zoneTop = brandRect.bottom - canvasOriginY;
	const zoneBottom = caseNavigationLayout.allProjects.y;
	const zoneHeight = zoneBottom - zoneTop;
	if (zoneHeight <= 0) {
		return null;
	}

	const zone = { zoneTop, zoneBottom, zoneHeight };
	if (cachedZoneRef) {
		cachedZoneRef.current = { key: zoneKey, zone };
	}
	return zone;
}

function applyLeftPanelContentCentering(ctx, layout, frame, cfg, verticalZone) {
	if (!layout?.leftPanel || !verticalZone) {
		return;
	}

	const pad = layout.leftPanel.padding ?? 0;
	const innerW = Math.max(1, layout.leftPanel.width - pad * 2);
	const contentHeight = measureLeftPanelFlowHeight(ctx, frame, cfg, innerW);
	if (contentHeight <= 0) {
		return;
	}

	const contentTop = verticalZone.zoneTop + Math.max(0, (verticalZone.zoneHeight - contentHeight) / 2);
	layout.leftPanel.y = contentTop - pad;
	if (layout.centerClear) {
		layout.centerClear.y = layout.leftPanel.y;
		layout.centerClear.height = Math.max(120, verticalZone.zoneBottom - layout.leftPanel.y);
	}
}

/**
 * Paint one HUD frame into `canvas` (clears + draws).
 * @returns {{ hitRegions: any[] } | null}
 */
export function paintCaseStudyPanelHudFrame(args) {
	const {
		canvas,
		viewportW,
		viewportH,
		project,
		siteLocale,
		pathname,
		frame,
		projectNavigationData,
		panelConfigRevision = 0,
		hideProjectNavigation = false,
		cachedZoneRef,
	} = args;

	if (!canvas || viewportW <= 0 || viewportH <= 0 || !frame) {
		return null;
	}

	const dpr = resolveCaseStudyPanelHudPixelRatio(store.graphicsTier);
	const ctx = prepareCaseStudyCanvasContext(canvas, viewportW, viewportH, dpr);
	if (!ctx) {
		return null;
	}

	ctx.clearRect(0, 0, viewportW, viewportH);
	const hitRegions = [];
	// Bottom/right model darkening lives in ScreenCompositor case edge shade
	// (bg+models only) so HUD glyphs are not dimmed.

	const panelWidth = project.config.caseStudy?.panelWidth;
	const navigationReserve = hideProjectNavigation
		? 0
		: resolveCaseProjectNavigationReservePx(viewportW, viewportH);
	const configuredBottomInset = project.config.caseStudy?.contentBottomInsetPx ?? 0;
	const layoutOptions = {
		...(panelWidth ? { panelWidth } : {}),
		...(project.config.caseStudy?.contentTopPx != null
			? { contentTopPx: project.config.caseStudy.contentTopPx }
			: {}),
		contentBottomInsetPx: Math.max(configuredBottomInset, navigationReserve - 32),
	};
	const layout = resolveCaseStudyLayout(
		viewportW,
		viewportH,
		project.states.length,
		{ x: 0, y: 0 },
		null,
		layoutOptions,
	);
	if (!layout) {
		return { hitRegions };
	}

	const projectNavLayout = resolveCaseProjectCanvasNavigationLayout(viewportW, viewportH, layout.leftPanel);
	const stageGlitchConfig = {
		...resolveLeftPanelDrawConfig(viewportW),
		...(project.config.caseStudy?.leftPanel ?? {}),
	};
	const verticalZone = resolveLeftPanelVerticalZone(
		projectNavLayout,
		0,
		cachedZoneRef,
		`${siteLocale}|${viewportW}|${viewportH}|${panelConfigRevision}`,
	);
	applyLeftPanelContentCentering(ctx, layout, frame, stageGlitchConfig, verticalZone);
	drawLeftPanel(ctx, layout, frame, canvas);
	// Project nav is painted onto a separate persistent chrome canvas — never into content.

	// Mosaic only above «ВСЕ ПРОЕКТЫ» / prev-next — project nav must stay static.
	const panel = layout.leftPanel;
	const padding = 20;
	const mosaicBottomGap = 4;
	const captureOverflowRight = Math.max(
		200,
		(stageGlitchConfig.titleFontSize ?? 32) * 6,
		(stageGlitchConfig.mosaicScatterX ?? 0) + (stageGlitchConfig.titleFontSize ?? 32) * 2,
	);
	const captureTop = (verticalZone?.zoneTop ?? panel.y) - padding;
	const captureBottom = (verticalZone?.zoneBottom ?? panel.y + (layout.centerClear?.height ?? viewportH)) - mosaicBottomGap;
	const mosaicBounds = {
		x: panel.x - padding,
		y: captureTop,
		width: panel.width + padding + captureOverflowRight,
		height: Math.max(1, captureBottom - captureTop),
		viewportW,
		viewportH,
	};

	return { hitRegions, mosaicBounds, projectNavLayout };
}

/**
 * Paint shared project-nav chrome only (all-projects + prev/next).
 * Lives on a persistent canvas — not snapshotted with left content.
 * @returns {{ hitRegions: any[], chromeBounds: object } | null}
 */
export function paintCaseStudyPanelHudChrome(args) {
	const {
		canvas,
		viewportW,
		viewportH,
		project,
		pathname,
		projectNavigationData,
		hideProjectNavigation = false,
	} = args;

	if (!canvas || viewportW <= 0 || viewportH <= 0 || hideProjectNavigation || !projectNavigationData) {
		return null;
	}

	const dpr = resolveCaseStudyPanelHudPixelRatio(store.graphicsTier);
	const ctx = prepareCaseStudyCanvasContext(canvas, viewportW, viewportH, dpr);
	if (!ctx) {
		return null;
	}

	ctx.imageSmoothingEnabled = false;
	ctx.clearRect(0, 0, viewportW, viewportH);
	const hitRegions = [];
	const panelWidth = project.config.caseStudy?.panelWidth;
	const navigationReserve = resolveCaseProjectNavigationReservePx(viewportW, viewportH);
	const configuredBottomInset = project.config.caseStudy?.contentBottomInsetPx ?? 0;
	const layoutOptions = {
		...(panelWidth ? { panelWidth } : {}),
		...(project.config.caseStudy?.contentTopPx != null
			? { contentTopPx: project.config.caseStudy.contentTopPx }
			: {}),
		contentBottomInsetPx: Math.max(configuredBottomInset, navigationReserve - 32),
	};
	const layout = resolveCaseStudyLayout(
		viewportW,
		viewportH,
		project.states.length,
		{ x: 0, y: 0 },
		null,
		layoutOptions,
	);
	if (!layout) {
		return { hitRegions, chromeBounds: null };
	}

	const projectNavLayout = resolveCaseProjectCanvasNavigationLayout(viewportW, viewportH, layout.leftPanel);
	drawCaseProjectCanvasNavigation(
		ctx,
		projectNavLayout,
		projectNavigationData,
		hitRegions,
		pathname,
	);

	const allY = projectNavLayout.allProjects?.y ?? viewportH * 0.72;
	const chromeBounds = {
		x: 0,
		y: allY,
		width: viewportW,
		height: Math.max(1, viewportH - allY),
		viewportW,
		viewportH,
	};

	return { hitRegions, chromeBounds, projectNavLayout };
}

/** @deprecated Use paintCaseStudyPanelHudFrame — mosaic is shader-blended on GPU. */
export function paintCaseStudyPanelHud(args) {
	return paintCaseStudyPanelHudFrame({
		...args,
		frame: args.currentFrame,
	});
}

export function hitRegionsSignature(regions) {
	if (!regions?.length) {
		return "";
	}
	return regions.map((r) => `${r.id}:${r.x}:${r.y}:${r.w}:${r.h}:${r.targetPath}`).join("|");
}
