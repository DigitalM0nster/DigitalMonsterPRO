import { caseStudyArcActiveLineConfig } from "./caseStudyArcActiveLineConfig.js";
import {
	caseStudyArcConfig,
	caseStudyArcInternals,
	getActiveBloomGlowColors,
	getArcLineStrokeStyle,
	lerpHexColor,
} from "./caseStudyArcConfig.js";
import { getArcDrawableRanges, getArcSegmentOpacity } from "./caseStudyArcOpacity.js";

const DEG = Math.PI / 180;

/**
 * @param {number} t
 */
function smoothstep(t) {
	const x = Math.max(0, Math.min(1, t));
	return x * x * (3 - 2 * x);
}

/**
 * @param {number} angle
 * @param {number} activeAngle
 * @param {number} halfSpanRad
 * @param {number} highlight
 */
export function getActiveArcGlowWeight(angle, activeAngle, halfSpanRad, highlight) {
	if (halfSpanRad <= 0 || highlight <= 0) {
		return 0;
	}

	const dist = Math.abs(angle - activeAngle);
	if (dist > halfSpanRad) {
		return 0;
	}

	return smoothstep(1 - dist / halfSpanRad) * highlight;
}

/**
 * Яркость кружка по близости к центру свечения дуги (1 = линия в центре круга).
 *
 * @param {number} nodeAngleRad
 * @param {number} glowCenterAngleRad
 * @param {typeof caseStudyArcConfig} cfg
 * @param {number} arcGlowStrength
 * @param {typeof caseStudyArcActiveLineConfig} [lineCfg]
 */
export function getNodeArcGlowHighlight(nodeAngleRad, glowCenterAngleRad, cfg, arcGlowStrength, lineCfg = caseStudyArcActiveLineConfig) {
	const halfSpanRad = lineCfg.halfSpanDeg * DEG;
	return getActiveArcGlowWeight(nodeAngleRad, glowCenterAngleRad, halfSpanRad, arcGlowStrength);
}

/**
 * Свечение дуги вокруг активного пункта: основной цвет у кружка → белый дуги + bloom.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} radius
 * @param {number} angleStart
 * @param {number} angleEnd
 * @param {number} viewportWidth
 * @param {number} baseAlpha
 * @param {number} lineWidth
 * @param {number[] | undefined} cutoutAngles
 * @param {number} cutoutHalfRad
 * @param {{ angleStart: number, angleEnd: number, noFadeMin: number, noFadeMax: number } | null} fadeBounds
 * @param {number} activeAngle
 * @param {number} highlight
 * @param {typeof caseStudyArcConfig} cfg
 * @param {typeof caseStudyArcInternals} internal
 * @param {typeof caseStudyArcActiveLineConfig} [lineCfg]
 */
export function strokeArcActiveNodeGlow(
	ctx,
	cx,
	cy,
	radius,
	angleStart,
	angleEnd,
	viewportWidth,
	baseAlpha,
	lineWidth,
	cutoutAngles,
	cutoutHalfRad,
	fadeBounds,
	activeAngle,
	highlight,
	cfg,
	internal,
	lineCfg = caseStudyArcActiveLineConfig,
) {
	if (highlight < 0.01) {
		return;
	}

	const halfSpanRad = lineCfg.halfSpanDeg * DEG;
	const glowMin = activeAngle - halfSpanRad;
	const glowMax = activeAngle + halfSpanRad;
	const bloomBlur = lineCfg.bloomBlur * (0.85 + highlight * 0.4);
	const bloomStrength = lineCfg.bloomStrength * highlight;
	const glowColors = getActiveBloomGlowColors(cfg, bloomStrength);
	const drawableRanges = getArcDrawableRanges(angleStart, angleEnd, cutoutAngles, cutoutHalfRad);

	ctx.save();
	ctx.lineCap = "butt";

	for (const [rangeStart, rangeEnd] of drawableRanges) {
		const drawStart = Math.max(rangeStart, glowMin);
		const drawEnd = Math.min(rangeEnd, glowMax);
		if (drawEnd - drawStart <= 1e-5) {
			continue;
		}

		const span = drawEnd - drawStart;
		const segmentCount = Math.max(6, Math.round(36 * (span / (halfSpanRad * 2))));
		const step = span / segmentCount;
		const overlap = step * 0.02;

		for (let i = 0; i < segmentCount; i += 1) {
			const a0 = i === 0 ? drawStart : drawStart + step * i;
			const a1 = i === segmentCount - 1 ? drawEnd : drawStart + step * (i + 1);
			const mid = (a0 + a1) / 2;
			const glowW = getActiveArcGlowWeight(mid, activeAngle, halfSpanRad, highlight);
			if (glowW < 0.004) {
				continue;
			}

			const midX = cx + radius * Math.cos(mid);
			const arcOpacity = getArcSegmentOpacity(mid, midX, viewportWidth, fadeBounds) * baseAlpha;
			const opacity = arcOpacity * glowW;
			if (opacity < 0.002) {
				continue;
			}

			// У кружка — activeColor, к краям зоны — цвет базовой дуги
			const colorHex = lerpHexColor(internal.trackColor, cfg.activeColor, glowW);
			const strokeAlpha =
				cfg.trackOpacity + glowW * Math.max(0, cfg.activeOpacity - cfg.trackOpacity + lineCfg.opacityBoost);
			const strokeColor = getArcLineStrokeStyle(colorHex, Math.min(1, strokeAlpha));

			if (bloomBlur > 0.01 && bloomStrength > 0.01) {
				ctx.save();
				ctx.globalCompositeOperation = "lighter";
				ctx.globalAlpha *= opacity * bloomStrength * 0.45;
				ctx.shadowColor = glowColors.soft;
				ctx.shadowBlur = bloomBlur * 1.75 * glowW;
				ctx.beginPath();
				ctx.arc(cx, cy, radius, a0, a1 + (i === segmentCount - 1 ? 0 : overlap), false);
				ctx.strokeStyle = strokeColor;
				ctx.lineWidth = lineWidth + 2 * glowW;
				ctx.stroke();
				ctx.restore();

				ctx.save();
				ctx.globalCompositeOperation = "lighter";
				ctx.globalAlpha *= opacity * bloomStrength * 0.75;
				ctx.shadowColor = glowColors.core;
				ctx.shadowBlur = bloomBlur * 0.85 * glowW;
				ctx.beginPath();
				ctx.arc(cx, cy, radius, a0, a1 + (i === segmentCount - 1 ? 0 : overlap), false);
				ctx.strokeStyle = strokeColor;
				ctx.lineWidth = lineWidth;
				ctx.stroke();
				ctx.restore();
			}

			ctx.save();
			ctx.globalAlpha *= opacity;
			ctx.beginPath();
			ctx.arc(cx, cy, radius, a0, a1 + (i === segmentCount - 1 ? 0 : overlap), false);
			ctx.strokeStyle = strokeColor;
			ctx.lineWidth = lineWidth;
			ctx.stroke();
			ctx.restore();
		}
	}

	ctx.restore();
}
