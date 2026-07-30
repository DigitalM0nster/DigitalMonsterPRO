import { CASE_STUDY_CANVAS_THEME } from "./caseStudyCanvasTheme.js";
import { resolveLeftPanelDrawConfig } from "./caseStudyLeftPanelConfig.js";
import { measureLeftPanelFlowHeight, paintLeftPanelFlow } from "./caseStudyLeftPanelFlow.js";
import { caseStudyDensePanelOverrides } from "@/pages/portfolio/core/caseStudyReferencePanelPreset.js";
import { CASE_STUDY_DISPLAY_FONT, measureTextWithSpacing } from "./caseStudyCanvasText.js";
import {
	drawSiteArcNavSnakeLabel,
	syncSiteArcNavSnakeLines,
} from "@/components/SiteArc/siteArcNavSnake.js";
import { drawSiteArcDebug, getSiteArcStepPositionsFromAngles, resolveSiteArcGeometry } from "@/components/SiteArc/siteArcGeometry.js";
import {
	siteArcConfig,
	siteArcInternals,
	siteArcRuntime,
	resolveNodeMarkerRadii,
} from "@/components/SiteArc/siteArcConfig.js";
import { isArcGlowManualOverride } from "@/components/SiteArc/siteArcGlowMotion.js";
import { setArcGlowPulseGate } from "@/components/SiteArc/siteArcNodeHighlight.js";
import { getArcSegmentOpacity, getArcLineCutoutHalfRad, resolveArcFadeBounds } from "@/components/SiteArc/siteArcOpacity.js";
import { setArcNavLabelSlotCount, syncArcNavLabelColorTargets } from "@/components/SiteArc/siteArcNavLabelMotion.js";
import { getSiteArcShift, setSiteArcShiftTarget } from "@/components/SiteArc/siteArcPositionMotion.js";
import { getCyclicItemRelativeDeg } from "@/components/SiteArc/siteArcCycle.js";
import {
	resolveSiteArcProjectItems,
	syncSiteArcPreviewNavigation,
} from "@/components/SiteArc/siteArcProjects.js";
import { getSiteArcSelectPhase, syncSiteArcSelectSequence } from "@/components/SiteArc/siteArcSelectSequence.js";
import {
	getArcLabelMaskMul,
	setArcLabelHoverSlots,
	setArcLabelHoverTarget,
} from "@/components/SiteArc/siteArcLabelHover.js";
import { getCachedArcPathTitleLayout } from "@/components/SiteArc/siteArcLabelLayoutCache.js";
import { getSceneCarousel } from "@/three/render/transition/carouselPage.js";

function wrapArcLabelWords(ctx, title, maxWidth, letterSpacing) {
	const words = String(title).toUpperCase().split(/\s+/).filter(Boolean);
	if (words.length === 0) {
		return [""];
	}

	const lines = [];
	let currentLine = words[0];
	for (let index = 1; index < words.length; index += 1) {
		const candidate = `${currentLine} ${words[index]}`;
		if (measureTextWithSpacing(ctx, candidate, letterSpacing) <= maxWidth) {
			currentLine = candidate;
		} else {
			lines.push(currentLine);
			currentLine = words[index];
		}
	}
	lines.push(currentLine);
	return lines;
}

/**
 * @typedef {{ type: 'state', stateId: string, x: number, y: number, r: number, anchorX?: number, anchorY?: number, anchorDiameter?: number }} CaseStudyHitRegion
 */

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('./caseStudyCanvasLayout.js').CaseStudyLayout} layout
 * @param {{
 *   categoryLabel: string,
 *   title: string,
 *   description?: string,
 *   tags: string[],
 *   metrics: { label: string, value: string }[],
 *   chapterNum: string,
 *   scrollProgress: number,
 *   contentAlpha?: number,
 * }} data
 * @param {HTMLCanvasElement | null} [canvasEl]
 */
export function drawLeftPanel(ctx, layout, data) {
	const theme = CASE_STUDY_CANVAS_THEME;
	const viewportWidth = layout.viewportWidth ?? 0;
	const baseCfg = {
		...resolveLeftPanelDrawConfig(viewportWidth),
		...(data.leftPanelOverrides ?? {}),
	};
	const panel = layout.leftPanel;
	const alpha = data.contentAlpha ?? 1;
	if (alpha <= 0.01) {
		return;
	}

	const pad = panel.padding ?? 0;
	const innerX = panel.x + pad;
	const innerY = panel.y + pad;
	const innerW = Math.max(1, panel.width - pad * 2);
	const availableHeight = layout.centerClear?.height;
	const regularHeight = measureLeftPanelFlowHeight(ctx, data, baseCfg, innerW);
	const shouldUseDensePanel = Number.isFinite(availableHeight)
		&& regularHeight > Math.max(120, availableHeight - 8);
	const cfg = shouldUseDensePanel
		? { ...baseCfg, ...caseStudyDensePanelOverrides }
		: baseCfg;

	const contentHeight = measureLeftPanelFlowHeight(ctx, data, cfg, innerW);
	const zoneHeight = Math.max(120, layout.centerClear?.height ?? contentHeight);

	ctx.save();
	ctx.globalAlpha = alpha;
	ctx.translate(innerX, innerY);

	if (layout.isMobile) {
		const mobileBoxH = data.anchorFooterBlock ? zoneHeight : contentHeight;
		ctx.fillStyle = theme.panelBg;
		ctx.strokeStyle = theme.line;
		ctx.lineWidth = 1;
		roundRect(ctx, 0, 0, innerW, mobileBoxH, 6);
		ctx.fill();
		ctx.stroke();
	}

	paintLeftPanelFlow(ctx, 0, 0, innerW, cfg, theme, data, zoneHeight);
	ctx.restore();

	// Stage rail is chrome-only (paintCaseStudyPanelHudChrome) — never in mosaic from/to.
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('./caseStudyCanvasLayout.js').CaseStudyLayout} layout
 * @param {{
 *   states: import('@/pages/portfolio/core/types.js').PortfolioState[],
 *   activeStateId: string,
 *   activeStateIndex: number,
 *   scrollProgress: number,
 *   contentAlpha?: number,
 * }} data
 * @param {CaseStudyHitRegion[]} hitRegions
 * @param {number} viewportWidth
 * @param {number} canvasHeight
 * @param {number} canvasWidth
 */
export function drawArcNavigation(ctx, layout, data, hitRegions, viewportWidth, canvasHeight, canvasWidth) {
	const theme = CASE_STUDY_CANVAS_THEME;
	const introOpacity = Math.max(0, Math.min(1, siteArcRuntime.introOpacity ?? 1));
	const alpha = (data.contentAlpha ?? 1) * introOpacity;
	if (alpha <= 0.01) {
		return;
	}

	// Arc = portfolio project list (stages moved to left rail). Overflow → CASE_NAV_FOLLOWUPS.md
	const carousel = getSceneCarousel();
	const navigating = Boolean(
		carousel?.isHexNavigationActive?.() || carousel?.isCaseBoundaryDrive?.(),
	);
	syncSiteArcPreviewNavigation(navigating);
	const arcProjects = resolveSiteArcProjectItems(data.locale, data.activeProjectId ?? null);
	const navStates = arcProjects.items;
	const internal = siteArcInternals;
	const ringGapDeg = arcProjects.ringGapDeg;
	const ringPeriodDeg = arcProjects.ringPeriodDeg;
	const focusIndex = arcProjects.activeNavIndex;
	// Focus may be frozen while glow travels — use live runtime angle for layout.
	const focusDeg = siteArcRuntime.focusRotationDeg ?? (focusIndex >= 0 ? focusIndex * ringGapDeg : 0);

	const arcGeo = resolveSiteArcGeometry(
		viewportWidth,
		canvasHeight,
		Math.min(navStates.length, internal.maxNavItems ?? 5),
		layout.isMobile,
		layout.arc?.viewportTop != null && layout.arc?.viewportBottom != null ? { top: layout.arc.viewportTop, bottom: layout.arc.viewportBottom } : null,
	);
	let { centerX } = arcGeo;
	const { centerY, radius, angleStart, angleEnd } = arcGeo;
	const DEG = Math.PI / 180;
	const navItemAngles = navStates.map((_, index) => (
		getCyclicItemRelativeDeg(index, focusDeg, ringGapDeg, navStates.length) * DEG + arcGeo.rotationRad
	));
	const positionIndices = Array.from({ length: navStates.length }, (_, i) => i);

	const focusSpinning = getSiteArcSelectPhase() === "focusSpin";
	const titleFontSize = layout.isMobile ? 8 : 9;
	const indexFontSize = layout.isMobile ? 9 : 10;
	/** Em units for CanvasGlitchText (`fontSize * letterSpacing`); px for measure/wrap. */
	const titleLetterSpacingEm = 0.16;
	const titleSpacing = titleFontSize * titleLetterSpacingEm;
	const labelGap = layout.isMobile ? 10 : internal.labelGapRight;
	const stackGap = internal.labelStackGap;
	const titleLineH = titleFontSize * 1.15;
	ctx.font = `500 ${titleFontSize}px ${CASE_STUDY_DISPLAY_FONT}`;
	const labelLineMaxWidth = layout.isMobile ? 72 : 110;
	const { pathTitleLines, maxRenderedLineWidth } = getCachedArcPathTitleLayout(
		ctx,
		navStates,
		labelLineMaxWidth,
		titleSpacing,
		titleFontSize,
		wrapArcLabelWords,
	);
	const wedgePadDeg = 6;
	const inWedgeMask = navStates.map((_, index) => (
		Math.abs(getCyclicItemRelativeDeg(index, focusDeg, ringGapDeg, navStates.length))
		<= internal.fadeEndDeg + wedgePadDeg
	));
	// Freeze horizontal shift while the ring spins — recomputing overflow every frame is wasted work.
	if (!focusSpinning) {
		const initialPositions = getSiteArcStepPositionsFromAngles(navItemAngles, centerX, centerY, radius);
		const rightmostNodeX = Math.max(
			0,
			...positionIndices
				.filter((slotIndex) => inWedgeMask[slotIndex])
				.map((slotIndex) => initialPositions[slotIndex]?.x ?? 0),
		);
		const viewportRightInset = layout.isMobile ? 8 : 20;
		const labelOverflow = Math.max(0, rightmostNodeX + labelGap + maxRenderedLineWidth - (viewportWidth - viewportRightInset));
		setSiteArcShiftTarget(labelOverflow);
	}
	centerX -= getSiteArcShift();
	arcGeo.centerX = centerX;
	const labelPositions = getSiteArcStepPositionsFromAngles(navItemAngles, centerX, centerY, radius);

	const { outer: markerOuterR } = resolveNodeMarkerRadii(internal, layout.isMobile);
	// Cutouts / fade zone only for nodes inside the visible wedge (cyclic ring may place others far away).
	const lineCutoutAngles = navStates
		.map((_, index) => (inWedgeMask[index] ? (labelPositions[positionIndices[index]]?.angle ?? null) : null))
		.filter((angle) => angle != null);
	const lineCutoutHalfRad = getArcLineCutoutHalfRad(markerOuterR, radius, internal.trackWidth);
	const arcFadeBounds = resolveArcFadeBounds(
		angleStart,
		angleEnd,
		lineCutoutAngles,
		lineCutoutHalfRad,
	);

	const activeNavIndex = arcProjects.activeNavIndex;
	const activeSlotIndex = activeNavIndex >= 0 ? positionIndices[activeNavIndex] : -1;
	const activeAngle = activeSlotIndex >= 0 ? labelPositions[activeSlotIndex]?.angle : null;

	// Glow → then ring spin (see siteArcSelectSequence).
	if (!isArcGlowManualOverride()) {
		syncSiteArcSelectSequence({
			activeIndex: activeNavIndex,
			ringGapDeg,
			ringPeriodDeg,
			activeAngleRad: activeAngle,
		});
	}

	setArcLabelHoverSlots(navStates.map((state) => state.id));
	setArcLabelHoverTarget(data.hoveredArcStateId ?? null);

	// Keep glow pulse idle — node bloom lives in WebGL.
	setArcGlowPulseGate(0);
	pushArcNodeHitRegions(
		navStates,
		labelPositions,
		positionIndices,
		viewportWidth,
		alpha,
		markerOuterR,
		hitRegions,
		arcFadeBounds,
	);

	// Labels (snake) + hit — единственный Canvas-слой дуги
	ctx.save();
	ctx.globalAlpha = alpha;

	const activeLabelColor = siteArcConfig.activeColor;
	const inactiveLabelColor = theme.textDim;

	setArcNavLabelSlotCount(navStates.length);

	navStates.forEach((state, index) => {
		const pos = labelPositions[positionIndices[index]];
		if (!pos) {
			return;
		}
		const labelAlpha = getArcSegmentOpacity(pos.angle, pos.x, viewportWidth, arcFadeBounds) * alpha;
		if (labelAlpha < 0.02) {
			return;
		}
		const isActiveProject = index === activeNavIndex;
		// Discrete active/inactive only — never bake traveling glow into glyph cache colors
		// (per-frame color → drawInPlace was the main CPU spike on rapid case→case).
		const targetColors = isActiveProject
			? { index: activeLabelColor, title: theme.text }
			: { index: inactiveLabelColor, title: inactiveLabelColor };
		if (getSiteArcSelectPhase() === "idle") {
			syncArcNavLabelColorTargets(index, targetColors.index, targetColors.title);
		}

		const titleLines = pathTitleLines[index].length > 0 ? pathTitleLines[index] : [""];
		const chapterNum = state.routeNumber
			?? String((state.registryIndex ?? index) + 1).padStart(2, "0");

		const nodeX = pos.x;
		const nodeY = pos.y;

		ctx.font = `500 ${titleFontSize}px ${CASE_STUDY_DISPLAY_FONT}`;
		const titleW = Math.max(1, ...titleLines.map((line) => measureTextWithSpacing(ctx, line, titleSpacing)));
		ctx.font = `500 ${indexFontSize}px ${CASE_STUDY_DISPLAY_FONT}`;
		const indexW = ctx.measureText(chapterNum).width;
		const labelW = Math.max(indexW, titleW);
		const labelBlockH = indexFontSize + stackGap + titleLineH * titleLines.length;
		hitRegions.push({
			type: "arcProject",
			stateId: state.id,
			projectId: state.id,
			targetPath: state.route,
			angle: pos.angle,
			x: nodeX + labelGap + labelW / 2,
			y: nodeY + titleLineH * Math.max(0, titleLines.length - 1) * 0.5,
			r: Math.max(labelBlockH / 2 + 6, labelW / 2 + 8),
			anchorX: nodeX,
			anchorY: nodeY,
			anchorDiameter: markerOuterR * 2,
		});

		// Dim mask on all labels; hover smoothly lifts it.
		const maskMul = getArcLabelMaskMul(index);
		ctx.save();
		ctx.globalAlpha = labelAlpha * maskMul;
		ctx.translate(nodeX, nodeY);
		ctx.textAlign = "left";

		// Snake caches use discrete active/inactive colors (not per-frame lerps).
		const cacheIndexColor = isActiveProject ? activeLabelColor : inactiveLabelColor;
		const cacheTitleColor = isActiveProject ? theme.text : inactiveLabelColor;
		syncSiteArcNavSnakeLines(state.id, titleLines.length);
		drawSiteArcNavSnakeLabel(
			ctx,
			`${state.id}::num`,
			chapterNum,
			labelGap,
			-stackGap / 2 - indexFontSize,
			{
				fontSize: indexFontSize,
				fontWeight: 500,
				letterSpacing: 0,
				fontFamily: CASE_STUDY_DISPLAY_FONT,
				color: cacheIndexColor,
				uppercase: false,
			},
		);
		titleLines.forEach((line, lineIndex) => {
			drawSiteArcNavSnakeLabel(
				ctx,
				`${state.id}::${lineIndex}`,
				line,
				labelGap,
				stackGap / 2 + lineIndex * titleLineH,
				{
					fontSize: titleFontSize,
					fontWeight: 500,
					letterSpacing: titleLetterSpacingEm,
					fontFamily: CASE_STUDY_DISPLAY_FONT,
					color: cacheTitleColor,
					uppercase: true,
				},
			);
		});

		ctx.restore();
	});

	ctx.restore();

	drawSiteArcDebug(ctx, arcGeo, canvasWidth, canvasHeight);
}

/**
 * Node hit targets only — ring/glow visuals are WebGL (SiteArcMesh).
 */
function pushArcNodeHitRegions(
	navStates,
	labelPositions,
	positionIndices,
	viewportWidth,
	baseAlpha,
	nodeRadius,
	hitRegions,
	arcFadeBounds,
) {
	navStates.forEach((state, index) => {
		const pos = labelPositions[positionIndices[index]];
		if (!pos) {
			return;
		}
		const segmentAlpha = getArcSegmentOpacity(pos.angle, pos.x, viewportWidth, arcFadeBounds) * baseAlpha;
		if (segmentAlpha < 0.001) {
			return;
		}
		hitRegions.push({
			type: "arcProject",
			stateId: state.id,
			projectId: state.id,
			targetPath: state.route,
			angle: pos.angle,
			x: pos.x,
			y: pos.y,
			r: nodeRadius + 8,
			anchorX: pos.x,
			anchorY: pos.y,
			anchorDiameter: nodeRadius * 2,
		});
	});
}

function roundRect(ctx, x, y, w, h, r) {
	const radius = Math.min(r, w / 2, h / 2);
	ctx.beginPath();
	ctx.moveTo(x + radius, y);
	ctx.lineTo(x + w - radius, y);
	ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
	ctx.lineTo(x + w, y + h - radius);
	ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
	ctx.lineTo(x + radius, y + h);
	ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
	ctx.lineTo(x, y + radius);
	ctx.quadraticCurveTo(x, y, x + radius, y);
	ctx.closePath();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {number} height
 * @param {import('./caseStudyCanvasLayout.js').CaseStudyLayout} layout
 * @param {Parameters<typeof drawLeftPanel>[2] & Parameters<typeof drawArcNavigation>[2]} frame
 * @param {CaseStudyHitRegion[]} hitRegions
 */
export function drawCaseStudyFrame(ctx, viewportWidth, viewportHeight, canvasWidth, layout, frame, hitRegions) {
	ctx.clearRect(0, 0, canvasWidth, viewportHeight);
	hitRegions.length = 0;

	drawLeftPanel(ctx, layout, frame);
	drawArcNavigation(ctx, layout, frame, hitRegions, viewportWidth, viewportHeight, canvasWidth);
}
