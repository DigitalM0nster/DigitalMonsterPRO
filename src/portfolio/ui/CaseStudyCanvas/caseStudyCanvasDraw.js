import { CASE_STUDY_CANVAS_THEME } from "./caseStudyCanvasTheme.js";
import { resolveLeftPanelDrawConfig } from "./caseStudyLeftPanelConfig.js";
import { measureLeftPanelFlowHeight, paintLeftPanelFlow } from "./caseStudyLeftPanelFlow.js";
import { caseStudyDensePanelOverrides } from "@/portfolio/core/caseStudyReferencePanelPreset.js";
import { CASE_STUDY_DISPLAY_FONT, measureTextWithSpacing } from "./caseStudyCanvasText.js";
import { drawCaseStudyArcDebug, getCaseStudyArcStepPositionsFromAngles, getCaseStudyItemAngles, resolveCaseStudyArcGeometry } from "./caseStudyArcGeometry.js";
import {
	caseStudyArcConfig,
	caseStudyArcInternals,
	caseStudyArcRuntime,
	getActiveBloomGlowColors,
	getArcLineStrokeStyle,
	lerpHexColor,
	resolveNodeMarkerRadii,
	getTrackStrokeStyle,
} from "./caseStudyArcConfig.js";
import { drawArcInnerCoreGlow, drawArcOuterRingStrokeBloom } from "./caseStudyArcBloom.js";
import { getNodeArcGlowHighlight, strokeArcActiveNodeGlow } from "./caseStudyArcActiveGlow.js";
import { getArcGlowCenterAngleRad, isArcGlowManualOverride, syncArcGlowTargetFromScroll } from "./caseStudyArcGlowMotion.js";
import { resolveArcGlowAngleFromScroll } from "./caseStudyArcScrollGlow.js";
import { getInnerBloomPulseBlur, setArcGlowPulseGate } from "./caseStudyArcNodeHighlight.js";
import { strokeArcFaded, getArcSegmentOpacity, getArcLineCutoutHalfRad, getArcNoFadeAngleBounds } from "./caseStudyArcOpacity.js";
import { caseStudyArcActiveLineConfig } from "./caseStudyArcActiveLineConfig.js";
import { strokeArcTrailToGlow } from "./caseStudyArcTrailLine.js";
import { caseStudyArcTrailLineConfig, ARC_TRAIL_ACTIVE_HIGHLIGHT_THRESHOLD, resolveArcNodeTrailBlend, resolveArcNodeMarkerHighlight } from "./caseStudyArcTrailLineConfig.js";
import { resolveArcNavLabelTargetColors } from "./caseStudyArcNavLabelColors.js";
import { getArcNavLabelDisplayColors, setArcNavLabelSlotCount, syncArcNavLabelColorTargets } from "./caseStudyArcNavLabelMotion.js";
import { drawCaseStudyArcNavSnakeLabel, syncCaseStudyArcNavSnakeLines } from "./caseStudyArcNavSnake.js";
import { getCaseStudyArcShift, setCaseStudyArcShiftTarget } from "./caseStudyArcPositionMotion.js";

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

	// Footer рисуется внутри paintLeftPanelFlow при anchorFooterBlock или zoneHeight > 0
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('./caseStudyCanvasLayout.js').CaseStudyLayout} layout
 * @param {{
 *   states: import('@/portfolio/core/types.js').PortfolioState[],
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
	const introOpacity = Math.max(0, Math.min(1, caseStudyArcRuntime.introOpacity ?? 1));
	const alpha = (data.contentAlpha ?? 1) * introOpacity;
	if (alpha <= 0.01) {
		return;
	}

	const arcGeo = resolveCaseStudyArcGeometry(
		viewportWidth,
		canvasHeight,
		data.states.length,
		layout.isMobile,
		layout.arc?.viewportTop != null && layout.arc?.viewportBottom != null ? { top: layout.arc.viewportTop, bottom: layout.arc.viewportBottom } : null,
	);
	let { centerX } = arcGeo;
	const { centerY, radius, angleStart, angleEnd, itemAngles, navCount, layoutItemCount } = arcGeo;
	const internal = caseStudyArcInternals;
	const navStates = data.states.slice(0, navCount);
	const useEvenNavSpacing = Boolean(data.arcNavigationEvenSpacing);
	const evenItemGapDeg = navStates.length <= 1 ? 0 : Math.min(internal.itemGapDeg, (internal.fadeEndDeg * 2 - internal.fadeInsetDeg * 2) / (navStates.length - 1));
	const navItemAngles = useEvenNavSpacing ? getCaseStudyItemAngles(navStates.length, evenItemGapDeg).map((angle) => angle + arcGeo.rotationRad) : itemAngles;
	const positionIndices = useEvenNavSpacing
		? Array.from({ length: navStates.length }, (_, i) => i)
		: navStates.length >= internal.maxNavItems
			? Array.from({ length: navStates.length }, (_, i) => i)
			: navStates.length === 1
				? [Math.floor((layoutItemCount - 1) / 2)]
				: Array.from({ length: navStates.length }, (_, i) => Math.round((i * (layoutItemCount - 1)) / (navStates.length - 1)));

	const titleFontSize = layout.isMobile ? 8 : 9;
	const indexFontSize = layout.isMobile ? 9 : 10;
	const titleSpacing = titleFontSize * 0.16;
	const labelGap = layout.isMobile ? 10 : internal.labelGapRight;
	const stackGap = internal.labelStackGap;
	const titleLineH = titleFontSize * 1.15;
	ctx.font = `500 ${titleFontSize}px ${CASE_STUDY_DISPLAY_FONT}`;
	const labelLineMaxWidth = layout.isMobile ? 72 : 110;
	const pathTitleLines = navStates.map((state) => wrapArcLabelWords(ctx, state.pathTitle ?? state.title, labelLineMaxWidth, titleSpacing));
	const maxRenderedLineWidth = Math.max(1, ...pathTitleLines.flat().map((line) => measureTextWithSpacing(ctx, line, titleSpacing)));
	const initialPositions = getCaseStudyArcStepPositionsFromAngles(navItemAngles, centerX, centerY, radius);
	const rightmostNodeX = Math.max(0, ...positionIndices.map((slotIndex) => initialPositions[slotIndex]?.x ?? 0));
	const viewportRightInset = layout.isMobile ? 8 : 20;
	const labelOverflow = Math.max(0, rightmostNodeX + labelGap + maxRenderedLineWidth - (viewportWidth - viewportRightInset));
	setCaseStudyArcShiftTarget(labelOverflow);
	centerX -= getCaseStudyArcShift();
	arcGeo.centerX = centerX;
	const labelPositions = getCaseStudyArcStepPositionsFromAngles(navItemAngles, centerX, centerY, radius);

	const trackStyle = getTrackStrokeStyle(caseStudyArcConfig, internal);
	const { outer: markerOuterR } = resolveNodeMarkerRadii(internal, layout.isMobile);
	const lineCutoutAngles = positionIndices.map((slotIndex) => labelPositions[slotIndex]?.angle).filter((angle) => angle != null);
	const lineCutoutHalfRad = getArcLineCutoutHalfRad(markerOuterR, radius, internal.trackWidth);
	const noFadeBounds = getArcNoFadeAngleBounds(lineCutoutAngles, lineCutoutHalfRad);
	const arcFadeBounds = noFadeBounds
		? {
				angleStart,
				angleEnd,
				noFadeMin: noFadeBounds.min,
				noFadeMax: noFadeBounds.max,
			}
		: null;

	const activeNavIndex = navStates.findIndex((state) => state.id === data.activeStateId);
	const activeSlotIndex = activeNavIndex >= 0 ? positionIndices[activeNavIndex] : -1;
	const activeAngle = activeSlotIndex >= 0 ? labelPositions[activeSlotIndex]?.angle : null;

	const navAnglesByIndex = navStates.map((_, index) => labelPositions[positionIndices[index]]?.angle ?? null);
	const navAnchors = navStates.map((state, index) => state.scrollAnchor ?? index / Math.max(navStates.length - 1, 1));

	if (!isArcGlowManualOverride()) {
		const scrollGlowAngle = resolveArcGlowAngleFromScroll(
			data.scrollProgress,
			navAnglesByIndex.filter((angle) => angle != null),
			navAnchors,
		);
		if (scrollGlowAngle != null) {
			syncArcGlowTargetFromScroll(scrollGlowAngle);
		} else if (activeAngle != null) {
			syncArcGlowTargetFromScroll(activeAngle);
		}
	}

	const glowCenterAngleRad = getArcGlowCenterAngleRad();

	const arcGlowStrength = 1;

	ctx.save();
	ctx.globalAlpha = alpha;

	strokeArcFaded(
		ctx,
		centerX,
		centerY,
		radius,
		angleStart,
		angleEnd,
		viewportWidth,
		canvasHeight,
		trackStyle,
		internal.trackWidth,
		alpha,
		lineCutoutAngles,
		lineCutoutHalfRad,
		arcFadeBounds,
	);

	if (glowCenterAngleRad != null) {
		strokeArcTrailToGlow(
			ctx,
			centerX,
			centerY,
			radius,
			angleStart,
			angleEnd,
			viewportWidth,
			canvasHeight,
			glowCenterAngleRad,
			caseStudyArcConfig.activeColor,
			internal.trackWidth,
			alpha,
			lineCutoutAngles,
			lineCutoutHalfRad,
			arcFadeBounds,
			caseStudyArcTrailLineConfig,
		);
	}

	if (glowCenterAngleRad != null && arcGlowStrength > 0.01) {
		strokeArcActiveNodeGlow(
			ctx,
			centerX,
			centerY,
			radius,
			angleStart,
			angleEnd,
			viewportWidth,
			alpha,
			internal.trackWidth,
			lineCutoutAngles,
			lineCutoutHalfRad,
			arcFadeBounds,
			glowCenterAngleRad,
			arcGlowStrength,
			caseStudyArcConfig,
			internal,
			caseStudyArcActiveLineConfig,
		);
	}

	// 4) Кружки на пунктах дуги
	setArcGlowPulseGate(0);
	drawArcNodeMarkers(
		ctx,
		navStates,
		labelPositions,
		positionIndices,
		data,
		viewportWidth,
		alpha,
		internal,
		theme,
		layout.isMobile,
		hitRegions,
		arcFadeBounds,
		glowCenterAngleRad,
		arcGlowStrength,
		caseStudyArcTrailLineConfig,
		activeNavIndex,
		navAnglesByIndex,
	);

	// Подписи — без shadowBlur

	const activeLabelColor = caseStudyArcConfig.activeColor;
	const trailLabelColor = getArcLineStrokeStyle(activeLabelColor, caseStudyArcTrailLineConfig.opacity);
	const inactiveLabelColor = theme.textDim;
	const cfg = caseStudyArcConfig;

	setArcNavLabelSlotCount(navStates.length);

	navStates.forEach((state, index) => {
		const pos = labelPositions[positionIndices[index]];
		if (!pos) {
			return;
		}
		const glowHighlight = glowCenterAngleRad != null ? getNodeArcGlowHighlight(pos.angle, glowCenterAngleRad, cfg, arcGlowStrength) : 0;
		const trailBlend = resolveArcNodeTrailBlend(index, activeNavIndex, glowCenterAngleRad, navAnglesByIndex);

		const targetColors = resolveArcNavLabelTargetColors({
			index,
			activeNavIndex,
			trailBlend,
			glowHighlight,
			activeLabelColor,
			trailLabelColor,
			inactiveLabelColor,
			activeTitleColor: theme.text,
		});
		syncArcNavLabelColorTargets(index, targetColors.index, targetColors.title);

		const { index: indexLabelColor, title: titleLabelColor } = getArcNavLabelDisplayColors(index);
		const titleLines = pathTitleLines[index].length > 0 ? pathTitleLines[index] : [""];
		const chapterNum = String(index + 1).padStart(2, "0");

		const nodeX = pos.x;
		const nodeY = pos.y;

		ctx.font = `500 ${titleFontSize}px ${CASE_STUDY_DISPLAY_FONT}`;
		const titleW = Math.max(1, ...titleLines.map((line) => measureTextWithSpacing(ctx, line, titleSpacing)));

		ctx.font = `500 ${indexFontSize}px ${CASE_STUDY_DISPLAY_FONT}`;
		const indexW = ctx.measureText(chapterNum).width;
		const labelW = Math.max(indexW, titleW);
		const labelBlockH = indexFontSize + stackGap + titleLineH * titleLines.length;

		hitRegions.push({
			type: "state",
			stateId: state.id,
			x: nodeX + labelGap + labelW / 2,
			y: nodeY + titleLineH * Math.max(0, titleLines.length - 1) * 0.5,
			r: Math.max(labelBlockH / 2 + 6, labelW / 2 + 8),
			anchorX: nodeX,
			anchorY: nodeY,
			anchorDiameter: markerOuterR * 2,
		});

		ctx.save();
		ctx.translate(nodeX, nodeY);
		ctx.textAlign = "left";

		ctx.font = `500 ${indexFontSize}px ${CASE_STUDY_DISPLAY_FONT}`;
		ctx.textBaseline = "bottom";
		ctx.fillStyle = indexLabelColor;
		ctx.fillText(chapterNum, labelGap, -stackGap / 2);

		ctx.font = `500 ${titleFontSize}px ${CASE_STUDY_DISPLAY_FONT}`;
		ctx.textBaseline = "top";
		ctx.fillStyle = titleLabelColor;
		syncCaseStudyArcNavSnakeLines(state.id, titleLines.length);
		titleLines.forEach((line, lineIndex) => {
			drawCaseStudyArcNavSnakeLabel(ctx, `${state.id}::${lineIndex}`, line, labelGap, stackGap / 2 + lineIndex * titleLineH, {
				fontSize: titleFontSize,
				fontWeight: 500,
				letterSpacing: 0.16,
				fontFamily: CASE_STUDY_DISPLAY_FONT,
				color: titleLabelColor,
			});
		});

		ctx.restore();
	});

	ctx.restore();

	drawCaseStudyArcDebug(ctx, arcGeo, canvasWidth, canvasHeight);
}

/**
 * Кружок на линии дуги у каждого пункта навигации.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('@/portfolio/core/types.js').PortfolioState[]} navStates
 * @param {ReturnType<typeof getCaseStudyArcStepPositionsFromAngles>} labelPositions
 * @param {number[]} positionIndices
 * @param {{ activeStateId: string, activeStateIndex: number }} data
 * @param {number} viewportWidth
 * @param {number} baseAlpha
 * @param {typeof caseStudyArcInternals} internal
 * @param {typeof CASE_STUDY_CANVAS_THEME} theme
 * @param {boolean} isMobile
 * @param {CaseStudyHitRegion[]} hitRegions
 * @param {number | null} glowCenterAngleRad
 * @param {number} arcGlowStrength
 * @param {typeof caseStudyArcTrailLineConfig} trailCfg
 * @param {number} activeNavIndex
 * @param {(number | null | undefined)[]} navAnglesByIndex
 */
function drawArcNodeMarkers(
	ctx,
	navStates,
	labelPositions,
	positionIndices,
	data,
	viewportWidth,
	baseAlpha,
	internal,
	theme,
	isMobile,
	hitRegions,
	arcFadeBounds,
	glowCenterAngleRad,
	arcGlowStrength,
	trailCfg,
	activeNavIndex,
	navAnglesByIndex,
) {
	const cfg = caseStudyArcConfig;
	const { outer: nodeRadius, mid: midRadius, inner: innerRadius } = resolveNodeMarkerRadii(internal, isMobile);
	const baseLineW = internal.trackWidth;
	const midFill = getTrackStrokeStyle(cfg, internal, cfg.nodeMidOpacity);
	let maxGlowHighlight = 0;

	navStates.forEach((state, index) => {
		const pos = labelPositions[positionIndices[index]];
		if (!pos) {
			return;
		}

		const segmentAlpha = getArcSegmentOpacity(pos.angle, pos.x, viewportWidth, arcFadeBounds) * baseAlpha;

		const glowHighlight = glowCenterAngleRad != null ? getNodeArcGlowHighlight(pos.angle, glowCenterAngleRad, cfg, arcGlowStrength) : 0;
		const trailBlend = resolveArcNodeTrailBlend(index, activeNavIndex, glowCenterAngleRad, navAnglesByIndex);

		const highlight = resolveArcNodeMarkerHighlight(index, activeNavIndex, glowHighlight, trailBlend);

		maxGlowHighlight = Math.max(maxGlowHighlight, highlight);
		const { x, y } = pos;

		hitRegions.push({
			type: "state",
			stateId: state.id,
			x,
			y,
			r: nodeRadius + 8,
			anchorX: x,
			anchorY: y,
			anchorDiameter: nodeRadius * 2,
		});

		if (segmentAlpha < 0.001) {
			return;
		}

		let outerColorHex;
		let outerOpacity;
		let innerOpacity;
		let lineW;
		let outerBloomBlur;
		let outerBloomStrength;
		let innerBloomBlur;
		let innerBloomStrength;
		let outerStrokeColor;
		let innerFillColor;
		let outerBloomGlow;

		const isTrailNode = trailBlend >= 0.999;
		const isActiveNode = highlight > ARC_TRAIL_ACTIVE_HIGHLIGHT_THRESHOLD;
		const isHoveredNode = state.id === data.hoveredArcStateId;

		const trailOuterOpacity = trailCfg.opacity;
		const trailStroke = getArcLineStrokeStyle(cfg.activeColor, trailOuterOpacity);
		const activeOuterColorHex = lerpHexColor(internal.trackColor, cfg.activeColor, highlight);
		const activeOuterOpacity = cfg.trackOpacity + highlight * (cfg.activeOpacity - cfg.trackOpacity);
		const activeInnerColorHex = lerpHexColor(internal.trackColor, cfg.activeColor, highlight);
		const activeInnerOpacity = cfg.trackOpacity + highlight * (cfg.activeOpacity - cfg.trackOpacity);

		const mix = (a, b) => a + (b - a) * trailBlend;

		if (isTrailNode) {
			outerColorHex = cfg.activeColor;
			outerOpacity = trailOuterOpacity;
			innerOpacity = trailOuterOpacity;
			lineW = baseLineW;
			outerBloomBlur = 0;
			outerBloomStrength = 0;
			innerBloomBlur = 0;
			innerBloomStrength = 0;
			outerStrokeColor = trailStroke;
			innerFillColor = trailStroke;
			outerBloomGlow = getActiveBloomGlowColors(cfg, 0);
		} else if (trailBlend > 0.001 && index <= activeNavIndex) {
			outerColorHex = lerpHexColor(activeOuterColorHex, cfg.activeColor, trailBlend);
			outerOpacity = mix(activeOuterOpacity, trailOuterOpacity);
			innerOpacity = mix(activeInnerOpacity, trailOuterOpacity);
			lineW = mix(baseLineW + highlight * (cfg.activeLineWidth - baseLineW), baseLineW);
			const activeOuterBloom = highlight > 0.02 ? cfg.activeOuterBloomBlur * (0.85 + highlight * 0.4) : 0;
			const activeOuterBloomStr = highlight > 0.02 ? cfg.activeOuterBloomStrength * (0.9 + highlight * 0.5) : 0;
			outerBloomBlur = mix(activeOuterBloom, 0);
			outerBloomStrength = mix(activeOuterBloomStr, 0);
			innerBloomBlur = mix(highlight > 0.02 ? getInnerBloomPulseBlur(highlight, cfg.activeInnerBloomBlur) : 0, 0);
			innerBloomStrength = mix(highlight > 0.02 ? cfg.activeInnerBloomStrength : 0, 0);
			outerStrokeColor = getArcLineStrokeStyle(outerColorHex, outerOpacity);
			innerFillColor = getArcLineStrokeStyle(lerpHexColor(activeInnerColorHex, cfg.activeColor, trailBlend), innerOpacity);
			outerBloomGlow = getActiveBloomGlowColors(cfg, outerBloomStrength);
		} else {
			outerColorHex = activeOuterColorHex;
			outerOpacity = activeOuterOpacity;
			outerStrokeColor = getArcLineStrokeStyle(outerColorHex, outerOpacity);
			innerOpacity = activeInnerOpacity;
			innerFillColor = getArcLineStrokeStyle(activeInnerColorHex, innerOpacity);
			lineW = baseLineW + highlight * (cfg.activeLineWidth - baseLineW);
			outerBloomBlur = highlight > 0.02 ? cfg.activeOuterBloomBlur * (0.85 + highlight * 0.4) : 0;
			outerBloomStrength = highlight > 0.02 ? cfg.activeOuterBloomStrength * (0.9 + highlight * 0.5) : 0;
			outerBloomGlow = getActiveBloomGlowColors(cfg, outerBloomStrength);
			innerBloomBlur = highlight > 0.02 ? getInnerBloomPulseBlur(highlight, cfg.activeInnerBloomBlur) : 0;
			innerBloomStrength = highlight > 0.02 ? cfg.activeInnerBloomStrength : 0;
		}

		ctx.save();
		ctx.globalAlpha *= segmentAlpha;

		if (!isTrailNode && innerBloomStrength > 0.01) {
			drawArcInnerCoreGlow(ctx, x, y, innerRadius, cfg.activeColor, innerBloomBlur, innerBloomStrength, highlight);
		}

		if (!isTrailNode && outerBloomStrength > 0.01) {
			drawArcOuterRingStrokeBloom(ctx, x, y, nodeRadius, lineW, outerStrokeColor, outerBloomGlow, outerBloomBlur, outerBloomStrength);
		}

		// 1) Внешний кружок — обводка той же толщины, что дуга
		ctx.save();
		ctx.lineCap = "butt";
		ctx.beginPath();
		ctx.arc(x, y, nodeRadius, 0, Math.PI * 2);
		ctx.strokeStyle = outerStrokeColor;
		ctx.lineWidth = lineW;
		ctx.stroke();
		ctx.restore();

		// 2) Средний — прозрачная заливка
		if (midRadius > innerRadius && cfg.nodeMidOpacity > 0.01) {
			ctx.beginPath();
			ctx.arc(x, y, midRadius, 0, Math.PI * 2);
			ctx.fillStyle = midFill;
			ctx.fill();
		}

		// 3) Центральная точка — белое ядро на активном, trail / дуга в покое
		if (innerRadius > 0 && innerOpacity > 0.01) {
			const coreFill = isActiveNode && !isTrailNode ? getArcLineStrokeStyle("#ffffff", innerOpacity) : innerFillColor;

			ctx.beginPath();
			ctx.arc(x, y, innerRadius, 0, Math.PI * 2);
			ctx.fillStyle = coreFill;
			ctx.fill();
		}

		ctx.restore();

		if (isHoveredNode) {
			ctx.save();
			ctx.globalAlpha *= segmentAlpha * 0.32;
			ctx.beginPath();
			ctx.arc(x, y, nodeRadius, 0, Math.PI * 2);
			ctx.strokeStyle = cfg.activeColor;
			ctx.lineWidth = lineW + 0.7;
			ctx.stroke();

			if (innerRadius > 0) {
				ctx.beginPath();
				ctx.arc(x, y, innerRadius, 0, Math.PI * 2);
				ctx.fillStyle = "#ffffff";
				ctx.fill();
			}
			ctx.restore();
		}
	});

	setArcGlowPulseGate(maxGlowHighlight);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {number} r
 */
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
