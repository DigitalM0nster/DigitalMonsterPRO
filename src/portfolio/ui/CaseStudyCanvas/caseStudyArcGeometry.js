import {
	caseStudyArcConfig,
	caseStudyArcInternals,
	caseStudyArcRuntime,
} from "./caseStudyArcConfig.js";

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
	// Visible wedge on screen: config (dev) + enter intro. Project nodes are placed on a
	// cyclic ring in draw (focus) — radius stays fixed while the ring spins.
	const windowRotationDeg = (caseStudyArcConfig.rotationDeg ?? 0)
		+ (caseStudyArcRuntime.introRotationDeg ?? 0);
	const windowRotationRad = windowRotationDeg * DEG;

	const arcHalfRad = internal.fadeEndDeg * DEG;
	const margin = arcHalfRad * 0.008;
	const angleStart = windowRotationRad - arcHalfRad + margin;
	const angleEnd = windowRotationRad + arcHalfRad - margin;

	const layoutItemCount = Math.max(navCount, internal.maxNavItems);
	// При 5+ пунктах фиксированный gap 14° может выйти за дугу ±fadeEndDeg — сжимаем равномерно.
	const arcSpanDeg = internal.fadeEndDeg * 2 - internal.fadeInsetDeg * 2;
	const itemGapDeg =
		layoutItemCount <= 1
			? 0
			: Math.min(internal.itemGapDeg, arcSpanDeg / (layoutItemCount - 1));
	const itemAngles = getCaseStudyItemAngles(layoutItemCount, itemGapDeg).map(
		(angle) => angle + windowRotationRad,
	);
	if (verticalBounds && layoutItemCount > 0) {
		// Fit radius at the design pose (rotation 0). Intro / rotationDeg must only spin the
		// circle — never shrink it when nodes swing toward the vertical.
		const fitItemAngles = getCaseStudyItemAngles(layoutItemCount, itemGapDeg);
		const maxVerticalFactor = Math.max(
			...fitItemAngles.map((angle) => Math.abs(Math.sin(angle))),
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
		/** Visible wedge orientation (rad). */
		rotationRad: windowRotationRad,
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
	const cx = geo.centerX;
	const cy = geo.centerY;
	const r = geo.radius;

	ctx.save();

	// Full orbit circle — the path the visible arc rides on.
	ctx.setLineDash([10, 8]);
	ctx.strokeStyle = "rgba(255, 64, 96, 0.85)";
	ctx.lineWidth = 1.5;
	ctx.beginPath();
	ctx.arc(cx, cy, r, 0, Math.PI * 2);
	ctx.stroke();
	ctx.setLineDash([]);

	// Visible arc segment (what the product draws as the track).
	ctx.strokeStyle = "rgba(120, 220, 255, 0.95)";
	ctx.lineWidth = 2.5;
	ctx.beginPath();
	ctx.arc(cx, cy, r, geo.angleStart, geo.angleEnd, false);
	ctx.stroke();

	// Center + radius spokes at start / mid / end of the visible wedge.
	const midAngle = (geo.angleStart + geo.angleEnd) * 0.5;
	ctx.strokeStyle = "rgba(255, 64, 96, 0.55)";
	ctx.lineWidth = 1;
	for (const angle of [geo.angleStart, midAngle, geo.angleEnd]) {
		ctx.beginPath();
		ctx.moveTo(cx, cy);
		ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
		ctx.stroke();
	}

	ctx.fillStyle = "rgba(255, 64, 96, 1)";
	ctx.beginPath();
	ctx.arc(cx, cy, 5, 0, Math.PI * 2);
	ctx.fill();

	// Crosshair at circle center.
	ctx.strokeStyle = "rgba(255, 64, 96, 0.7)";
	ctx.beginPath();
	ctx.moveTo(cx - 14, cy);
	ctx.lineTo(cx + 14, cy);
	ctx.moveTo(cx, cy - 14);
	ctx.lineTo(cx, cy + 14);
	ctx.stroke();

	ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
	ctx.fillStyle = "rgba(255, 180, 190, 0.95)";
	ctx.textAlign = "left";
	ctx.textBaseline = "top";
	const focusDeg = caseStudyArcRuntime.focusRotationDeg ?? 0;
	ctx.fillText(
		`orbit r=${r.toFixed(0)}  center=(${cx.toFixed(0)}, ${cy.toFixed(0)})  rot=${((geo.rotationRad * 180) / Math.PI).toFixed(1)}°  focus=${focusDeg.toFixed(1)}°`,
		8,
		8,
	);

	ctx.strokeStyle = "rgba(120, 200, 255, 0.35)";
	ctx.beginPath();
	ctx.moveTo(vw, 0);
	ctx.lineTo(vw, canvasHeight);
	ctx.stroke();

	if (canvasWidth > vw) {
		ctx.fillStyle = "rgba(120, 200, 255, 0.05)";
		ctx.fillRect(vw, 0, canvasWidth - vw, canvasHeight);
	}

	ctx.restore();
}
