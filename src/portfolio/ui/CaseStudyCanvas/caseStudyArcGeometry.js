import {
	caseStudyArcConfig,
	caseStudyArcInternals,
	caseStudyArcRuntime,
} from "./caseStudyArcConfig.js";
import { getArcNoFadeAngleBounds } from "./caseStudyArcOpacity.js";

const DEG = Math.PI / 180;

/**
 * @param {number} width
 * @param {number} height
 */
export function getViewportHalfDiagonal(width, height) {
	return Math.hypot(width / 2, height / 2);
}

/**
 * Углы пунктов на дуге: равномерно с itemGapDeg между соседними.
 * @param {number} count
 * @param {number} itemGapDeg
 */
export function getCaseStudyItemAngles(count, itemGapDeg) {
	if (count <= 0) {
		return [];
	}
	if (count === 1) {
		return [0];
	}

	const gapRad = itemGapDeg * DEG;
	const totalSpan = gapRad * (count - 1);
	const start = -totalSpan / 2;

	return Array.from({ length: count }, (_, index) => start + index * gapRad);
}

/**
 * @param {number} viewportWidth
 * @param {number} height
 * @param {number} stateCount
 * @param {boolean} isMobile
 * @param {{ top: number, bottom: number } | null} [verticalBounds]
 */
export function resolveCaseStudyArcGeometry(viewportWidth, height, stateCount, isMobile, verticalBounds = null) {
	const internal = caseStudyArcInternals;
	const navCount = Math.min(Math.max(1, stateCount), internal.maxNavItems);
	const centerX = viewportWidth * internal.centerXRatio;
	const boundsTop = Number.isFinite(verticalBounds?.top) ? verticalBounds.top : 0;
	const boundsBottom = Number.isFinite(verticalBounds?.bottom) ? verticalBounds.bottom : height;
	const boundedHeight = Math.max(120, boundsBottom - boundsTop);
	const centerY = verticalBounds
		? boundsTop + boundedHeight * internal.centerYRatio
		: height * internal.centerYRatio;
	const halfDiagonal = getViewportHalfDiagonal(viewportWidth, boundedHeight);
	const mobileScale = isMobile ? 0.92 : 1;
	let radius = halfDiagonal * internal.radiusDiagonalRatio * mobileScale;
	const rotationDeg = (caseStudyArcConfig.rotationDeg ?? 0) + (caseStudyArcRuntime.introRotationDeg ?? 0);
	const rotationRad = rotationDeg * DEG;

	const arcHalfRad = internal.fadeEndDeg * DEG;
	const margin = arcHalfRad * 0.008;
	const angleStart = rotationRad - arcHalfRad + margin;
	const angleEnd = rotationRad + arcHalfRad - margin;

	const layoutItemCount = Math.max(navCount, internal.maxNavItems);
	// При 5+ пунктах фиксированный gap 14° может выйти за дугу ±fadeEndDeg — сжимаем равномерно.
	const arcSpanDeg = internal.fadeEndDeg * 2 - internal.fadeInsetDeg * 2;
	const itemGapDeg =
		layoutItemCount <= 1
			? 0
			: Math.min(internal.itemGapDeg, arcSpanDeg / (layoutItemCount - 1));
	const baseItemAngles = getCaseStudyItemAngles(layoutItemCount, itemGapDeg).map(
		(angle) => angle + (caseStudyArcConfig.rotationDeg ?? 0) * DEG,
	);
	const itemAngles = getCaseStudyItemAngles(layoutItemCount, itemGapDeg).map((angle) => angle + rotationRad);
	if (verticalBounds && baseItemAngles.length > 0) {
		// Radius belongs to the circle itself and must not change during intro rotation.
		// Bounds are evaluated at the final resting angle; intro only rotates that fixed circle.
		const maxVerticalFactor = Math.max(
			...baseItemAngles.map((angle) => Math.abs(Math.sin(angle))),
			0.001,
		);
		const labelSafetyPx = isMobile ? 20 : 38;
		const boundedRadius = Math.max(80, (boundedHeight / 2 - labelSafetyPx) / maxVerticalFactor);
		radius = Math.min(radius, boundedRadius);
	}

	return {
		centerX,
		centerY,
		radius,
		angleStart,
		angleEnd,
		arcHalfRad,
		rotationRad,
		itemAngles,
		navCount,
		layoutItemCount,
		viewportWidth,
		bleedRight: internal.canvasBleedRight,
	};
}

/**
 * @param {number[]} itemAngles
 * @param {number} centerX
 * @param {number} centerY
 * @param {number} radius
 */
export function getCaseStudyArcStepPositionsFromAngles(itemAngles, centerX, centerY, radius) {
	return itemAngles.map((angle) => ({
		x: centerX + Math.cos(angle) * radius,
		y: centerY + Math.sin(angle) * radius,
		angle,
	}));
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {ReturnType<typeof resolveCaseStudyArcGeometry>} geo
 * @param {number} canvasWidth
 * @param {number} canvasHeight
 */
export function drawCaseStudyArcDebug(ctx, geo, canvasWidth, canvasHeight) {
	if (!caseStudyArcInternals.showDebug) {
		return;
	}

	const internal = caseStudyArcInternals;
	const vw = geo.viewportWidth;
	const fadeEndRad = internal.fadeEndDeg * DEG;

	ctx.save();
	ctx.setLineDash([6, 6]);
	ctx.strokeStyle = "rgba(255, 80, 80, 0.35)";
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.arc(geo.centerX, geo.centerY, geo.radius, 0, Math.PI * 2);
	ctx.stroke();
	ctx.setLineDash([]);

	ctx.strokeStyle = "rgba(180, 180, 255, 0.5)";
	ctx.lineWidth = 1.5;
	ctx.beginPath();
	ctx.arc(geo.centerX, geo.centerY, geo.radius, geo.angleStart, geo.angleEnd, false);
	ctx.stroke();

	const noFade = getArcNoFadeAngleBounds(geo.itemAngles.slice(0, geo.navCount), 0);
	if (noFade) {
		const insetRad = internal.fadeInsetDeg * DEG;
		ctx.strokeStyle = "rgba(80, 255, 140, 0.45)";
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.arc(geo.centerX, geo.centerY, geo.radius, noFade.min - insetRad, noFade.max + insetRad, false);
		ctx.stroke();
	}

	ctx.strokeStyle = "rgba(255, 80, 80, 0.45)";
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.arc(geo.centerX, geo.centerY, geo.radius, -fadeEndRad, geo.angleStart, false);
	ctx.stroke();
	ctx.beginPath();
	ctx.arc(geo.centerX, geo.centerY, geo.radius, geo.angleEnd, fadeEndRad, false);
	ctx.stroke();

	for (const angle of geo.itemAngles) {
		const x = geo.centerX + Math.cos(angle) * geo.radius;
		const y = geo.centerY + Math.sin(angle) * geo.radius;
		ctx.fillStyle = "rgba(255, 160, 220, 0.9)";
		ctx.beginPath();
		ctx.arc(x, y, 4, 0, Math.PI * 2);
		ctx.fill();
	}

	ctx.strokeStyle = "rgba(120, 200, 255, 0.45)";
	ctx.beginPath();
	ctx.moveTo(vw, 0);
	ctx.lineTo(vw, canvasHeight);
	ctx.stroke();

	if (canvasWidth > vw) {
		ctx.fillStyle = "rgba(120, 200, 255, 0.06)";
		ctx.fillRect(vw, 0, canvasWidth - vw, canvasHeight);
	}

	ctx.fillStyle = "rgba(255, 80, 80, 0.9)";
	ctx.beginPath();
	ctx.arc(geo.centerX, geo.centerY, 4, 0, Math.PI * 2);
	ctx.fill();

	ctx.restore();
}
