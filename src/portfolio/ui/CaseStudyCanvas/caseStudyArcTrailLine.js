import { siteMainRgba } from "@/constants/siteMainColor.js";
import { getArcLineStrokeStyle } from "./caseStudyArcConfig.js";
import {
	caseStudyArcTrailLineConfig,
	getTrailNodeBloomAlpha,
} from "./caseStudyArcTrailLineConfig.js";import { getDrawableArcProgressToAngle, strokeArcProgressFaded } from "./caseStudyArcOpacity.js";

/**
 * Линия-след: от начала дуги до текущей позиции свечения (с теми же вырезами под кружки).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} radius
 * @param {number} angleStart
 * @param {number} angleEnd
 * @param {number} viewportWidth
 * @param {number} canvasHeight
 * @param {number | null} glowAngleRad
 * @param {string} colorHex
 * @param {number} lineWidth
 * @param {number} baseAlpha
 * @param {number[] | undefined} cutoutAngles
 * @param {number} cutoutHalfRad
 * @param {{ angleStart: number, angleEnd: number, noFadeMin: number, noFadeMax: number } | null} fadeBounds
 * @param {typeof caseStudyArcTrailLineConfig} [trailCfg]
 */
export function strokeArcTrailToGlow(
	ctx,
	cx,
	cy,
	radius,
	angleStart,
	angleEnd,
	viewportWidth,
	canvasHeight,
	glowAngleRad,
	colorHex,
	lineWidth,
	baseAlpha,
	cutoutAngles,
	cutoutHalfRad,
	fadeBounds,
	trailCfg = caseStudyArcTrailLineConfig,
) {
	if (glowAngleRad == null || trailCfg.opacity < 0.002) {
		return;
	}

	const progress = getDrawableArcProgressToAngle(
		angleStart,
		angleEnd,
		glowAngleRad,
		cutoutAngles,
		cutoutHalfRad,
		radius,
	);
	if (progress <= 0.001) {
		return;
	}

	const strokeStyle = getArcLineStrokeStyle(colorHex, trailCfg.opacity);
	const glowAlpha = getTrailNodeBloomAlpha(trailCfg);
	ctx.save();
	ctx.shadowColor = siteMainRgba(glowAlpha);
	ctx.shadowBlur = trailCfg.glowBlur;
	strokeArcProgressFaded(
		ctx,
		cx,
		cy,
		radius,
		angleStart,
		angleEnd,
		viewportWidth,
		canvasHeight,
		progress,
		strokeStyle,
		lineWidth,
		baseAlpha,
		cutoutAngles,
		cutoutHalfRad,
		fadeBounds,
	);
	ctx.restore();
}
