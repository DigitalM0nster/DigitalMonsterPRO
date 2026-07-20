/**
 * Shared offscreen paint for case panel HUD (left content + project nav).
 * WebGL path: paint from/to once per content change; stage mix is a shader uniform.
 */
import {
	resolveCaseStudyLayout,
	resolveSiteTopHudBrandLeftPx,
} from "@/portfolio/ui/CaseStudyCanvas/caseStudyCanvasLayout.js";
import { drawLeftPanel } from "@/portfolio/ui/CaseStudyCanvas/caseStudyCanvasDraw.js";
import { resolveLeftPanelDrawConfig } from "@/portfolio/ui/CaseStudyCanvas/caseStudyLeftPanelConfig.js";
import {
	prepareCaseStudyCanvasContext,
	resolveCaseStudyPanelHudPixelRatio,
} from "@/portfolio/ui/CaseStudyCanvas/caseStudyCanvasSurface.js";
import { resolveCaseProjectNavigationReservePx } from "@/portfolio/ui/CaseProjectNavigation/caseProjectNavigationLayout.js";
import {
	drawCaseProjectCanvasNavigation,
	resolveCaseProjectCanvasNavigationLayout,
} from "@/portfolio/ui/CaseStudyCanvas/caseProjectCanvasNavigation.js";
import {
	drawCaseStudyStageRail,
	getCaseStudyStageRailSpineOffset,
	getCaseStudyStageRailWidth,
	resolveCaseStudyStageRailFloat,
} from "@/portfolio/ui/CaseStudyCanvas/caseStudyStageRail.js";
import { store } from "@/store.jsx";

/**
 * Content zone under the fixed header — used for mosaic capture height.
 * Header Y is pinned via contentTopPx (no vertical centering).
 * @returns {{ zoneTop: number, zoneBottom: number, zoneHeight: number } | null}
 */
export function resolveLeftPanelVerticalZone(caseNavigationLayout, canvasOriginY = 0, cachedZoneRef = null, zoneKey = "", viewportH = 0) {
	if (cachedZoneRef?.current && cachedZoneRef.current.key === zoneKey) {
		return cachedZoneRef.current.zone;
	}

	let headerTop = null;
	if (caseNavigationLayout?.headerTop != null && Number.isFinite(caseNavigationLayout.headerTop)) {
		headerTop = caseNavigationLayout.headerTop;
	} else if (caseNavigationLayout?.allProjects) {
		headerTop = caseNavigationLayout.allProjects.y + caseNavigationLayout.allProjects.h + 14;
	}
	if (headerTop == null || !Number.isFinite(headerTop)) {
		return null;
	}

	const zoneTop = headerTop - canvasOriginY;
	const zoneBottom = Math.max(zoneTop + 120, (viewportH || window.innerHeight || 900) - 48);
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

/**
 * Paint one HUD frame into `canvas` (clears + draws).
 * @returns {{ hitRegions: any[], stageHitRegions?: any[], mosaicBounds?: object, projectNavLayout?: object } | null}
 */
export function paintCaseStudyPanelHudFrame(args) {
	const {
		canvas,
		viewportW,
		viewportH,
		project,
		siteLocale,
		frame,
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
		contentBottomInsetPx: Math.max(configuredBottomInset, navigationReserve),
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

	// Pin header: leftPanel.y stays at contentTopPx from layout — never re-centered.
	const projectNavLayout = resolveCaseProjectCanvasNavigationLayout(viewportW, viewportH, layout.leftPanel);
	projectNavLayout.headerTop = layout.leftPanel.y;
	const stageGlitchConfig = {
		...resolveLeftPanelDrawConfig(viewportW),
		...(project.config.caseStudy?.leftPanel ?? {}),
	};
	const verticalZone = resolveLeftPanelVerticalZone(
		projectNavLayout,
		0,
		cachedZoneRef,
		`${siteLocale}|${viewportW}|${viewportH}|${panelConfigRevision}`,
		viewportH,
	);
	if (verticalZone && layout.centerClear) {
		layout.centerClear.y = layout.leftPanel.y;
		layout.centerClear.height = Math.max(120, verticalZone.zoneBottom - layout.leftPanel.y);
	}

	drawLeftPanel(ctx, layout, frame);

	const panel = layout.leftPanel;
	const padding = 20;
	const mosaicBottomGap = 4;
	const captureOverflowRight = Math.max(
		200,
		(stageGlitchConfig.titleFontSize ?? 32) * 6,
		(stageGlitchConfig.mosaicScatterX ?? 0) + (stageGlitchConfig.titleFontSize ?? 32) * 2,
	);
	const captureTop = panel.y - padding;
	const captureBottom = (verticalZone?.zoneBottom ?? panel.y + (layout.centerClear?.height ?? viewportH)) - mosaicBottomGap;
	// Stage rail is chrome-only — mosaic covers text column only.
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
 * Chrome layer: compact «all projects» + stage rail.
 * Not snapshotted into left from/to — stage mosaic never reshapes the rail.
 * @returns {{ hitRegions: any[], stageHitRegions: any[], chromeBounds: object } | null}
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
		frame = null,
		/** When true, do not clear — used to redraw rail after chrome enter mosaic. */
		skipClear = false,
		/** When true, skip «all projects» (rail only). */
		stageRailOnly = false,
		/** 0…1 — full chrome enter/exit; rail is outside mosaic bounds so it fades here. */
		stageRailOpacity = 1,
	} = args;

	if (!canvas || viewportW <= 0 || viewportH <= 0) {
		return null;
	}

	const dpr = resolveCaseStudyPanelHudPixelRatio(store.graphicsTier);
	const ctx = prepareCaseStudyCanvasContext(canvas, viewportW, viewportH, dpr);
	if (!ctx) {
		return null;
	}

	ctx.imageSmoothingEnabled = false;
	const hitRegions = [];
	const stageHitRegions = [];
	const panelWidth = project.config.caseStudy?.panelWidth;
	const navigationReserve = resolveCaseProjectNavigationReservePx(viewportW, viewportH);
	const configuredBottomInset = project.config.caseStudy?.contentBottomInsetPx ?? 0;
	const layoutOptions = {
		...(panelWidth ? { panelWidth } : {}),
		...(project.config.caseStudy?.contentTopPx != null
			? { contentTopPx: project.config.caseStudy.contentTopPx }
			: {}),
		contentBottomInsetPx: Math.max(configuredBottomInset, navigationReserve),
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
		return { hitRegions, stageHitRegions, chromeBounds: null };
	}

	const panel = layout.leftPanel;
	const leftPanelCfg = project.config.caseStudy?.leftPanel ?? {};
	const panelPad = panel.padding ?? 0;
	const contentLeft = panel.x + panelPad;
	const brandLeft = resolveSiteTopHudBrandLeftPx(viewportW);
	const railX = brandLeft - getCaseStudyStageRailSpineOffset();
	const railClearW = Math.max(
		getCaseStudyStageRailWidth() + 28,
		contentLeft - railX + 48,
	);

	const projectNavLayout = resolveCaseProjectCanvasNavigationLayout(viewportW, viewportH, layout.leftPanel);

	if (!skipClear) {
		if (stageRailOnly) {
			// Rail redraw on scroll must not wipe «all projects» above the header.
			const allBottom = (projectNavLayout.allProjects?.y ?? 0)
				+ (projectNavLayout.allProjects?.h ?? 28)
				+ 6;
			const clearTop = Math.max(0, Math.floor(Math.min(panel.y - 12, allBottom)));
			ctx.clearRect(Math.max(0, railX - 8), clearTop, railClearW + 16, Math.max(0, viewportH - clearTop));
		} else {
			ctx.clearRect(0, 0, viewportW, viewportH);
		}
	}

	if (!stageRailOnly && !hideProjectNavigation && projectNavigationData) {
		drawCaseProjectCanvasNavigation(
			ctx,
			projectNavLayout,
			projectNavigationData,
			hitRegions,
			pathname,
		);
	}

	const stageFrame = frame ?? {
		states: project.states,
		activeStateId: project.states[0]?.id,
		chapterBase: project.config.caseStudy?.chapterBase ?? 0,
	};
	const states = stageFrame.states ?? project.states;
	const categoryFontSize = leftPanelCfg.categoryFontSize ?? 13;
	// Same X as drawSectionBadge chapter digits (content layer).
	const headerTextX = contentLeft
		+ (leftPanelCfg.sectionBadgeShowDot === true ? 16 : 0);
	const activeStateIndex = Number.isFinite(stageFrame.activeStateIndex)
		? stageFrame.activeStateIndex
		: Math.max(0, states.findIndex((state) => state.id === stageFrame.activeStateId));
	const activeFloat = Number.isFinite(stageFrame.activeFloat)
		? stageFrame.activeFloat
		: resolveCaseStudyStageRailFloat(activeStateIndex, states.length);
	const railAlpha = Math.max(0, Math.min(1, Number(stageRailOpacity) || 0));
	if (railAlpha > 0.001) {
		const prevAlpha = ctx.globalAlpha;
		ctx.globalAlpha = prevAlpha * railAlpha;
		drawCaseStudyStageRail(
			ctx,
			railX,
			panel.y,
			{
				states,
				activeStateId: stageFrame.activeStateId,
				activeStateIndex,
				activeFloat,
				chapterBase: stageFrame.chapterBase ?? project.config.caseStudy?.chapterBase ?? 0,
				categoryFontSize,
				headerTextX,
				viewportH,
			},
			railAlpha > 0.5 ? stageHitRegions : null,
		);
		ctx.globalAlpha = prevAlpha;
	}

	// Enter-mosaic bounds = «all projects» only (never the stage rail).
	const all = projectNavLayout.allProjects;
	const chromeBounds = {
		x: Math.max(0, (all?.x ?? 0) - 8),
		y: Math.max(0, (all?.y ?? 0) - 4),
		width: Math.min(viewportW, (all?.w ?? 200) + 80),
		height: Math.max(1, (all?.h ?? 28) + 8),
		viewportW,
		viewportH,
	};

	return { hitRegions, stageHitRegions, chromeBounds, projectNavLayout };
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
	return regions.map((r) => `${r.id ?? r.stateId}:${r.x}:${r.y}:${r.w ?? r.r}:${r.h ?? 0}:${r.targetPath ?? ""}`).join("|");
}
