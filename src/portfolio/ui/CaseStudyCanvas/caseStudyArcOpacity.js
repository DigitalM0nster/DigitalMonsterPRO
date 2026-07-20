import { caseStudyArcInternals } from "./caseStudyArcConfig.js";

const DEG = Math.PI / 180;
const ARC_SEGMENTS = 120;
const MIN_RANGE_RAD = 1e-5;

/** Горизонтальный fade слева — только вне зоны кружков. */
const FADE_START_RATIO = 0.8;
const FADE_END_RATIO = 1;

/**
 * @param {number[]} nodeAngles — углы пунктов на дуге
 * @param {number} cutoutHalfRad
 */
export function getArcNoFadeAngleBounds(nodeAngles, cutoutHalfRad) {
	if (!nodeAngles?.length) {
		return null;
	}

	const min = Math.min(...nodeAngles) - cutoutHalfRad;
	const max = Math.max(...nodeAngles) + cutoutHalfRad;
	return { min, max };
}

/**
 * Fade bounds for the visible wedge. Always reserves end tails so the track,
 * nodes and labels darken toward angleStart / angleEnd — even when many cyclic
 * nodes would otherwise expand the solid zone across the whole arc.
 *
 * @param {number} angleStart
 * @param {number} angleEnd
 * @param {number[]} nodeAngles
 * @param {number} cutoutHalfRad
 * @returns {{ angleStart: number, angleEnd: number, noFadeMin: number, noFadeMax: number }}
 */
export function resolveArcFadeBounds(angleStart, angleEnd, nodeAngles, cutoutHalfRad) {
	const cfg = caseStudyArcInternals;
	const mid = (angleStart + angleEnd) * 0.5;
	const halfSpan = Math.max(MIN_RANGE_RAD, (angleEnd - angleStart) * 0.5);
	// Keep a visible fade band on both ends (fraction of wedge + fadeTail hint).
	const reserve = Math.max(0.08, Math.min(0.65, cfg.fadeTailReserve ?? 0.4));
	const minTailRad = Math.max(
		cfg.fadeInsetDeg * DEG,
		Math.min(Math.max(8, cfg.fadeTailDeg * 0.35) * DEG, halfSpan * reserve),
	);

	const nodeBounds = getArcNoFadeAngleBounds(nodeAngles, cutoutHalfRad);
	let noFadeMin = nodeBounds?.min ?? (mid - halfSpan * 0.3);
	let noFadeMax = nodeBounds?.max ?? (mid + halfSpan * 0.3);

	noFadeMin = Math.max(noFadeMin, angleStart + minTailRad);
	noFadeMax = Math.min(noFadeMax, angleEnd - minTailRad);

	if (noFadeMin >= noFadeMax - MIN_RANGE_RAD) {
		const solid = Math.max(MIN_RANGE_RAD, halfSpan - minTailRad);
		noFadeMin = mid - solid;
		noFadeMax = mid + solid;
	}

	return {
		angleStart,
		angleEnd,
		noFadeMin,
		noFadeMax,
	};
}

/**
 * Затухание по оставшемуся хвосту дуги — всегда доходит до 0 на конце дуги.
 * @param {number} dist — расстояние от границы зоны кружков, рад
 * @param {number} availableTail — весь хвост до angleStart/angleEnd, рад
 * @param {number} power
 * @param {number} easeWeight — 0..1, доля eased-кривой (fadeTailDeg / 45)
 */
function getAngularFadeAlongTail(dist, availableTail, power, easeWeight) {
	if (availableTail <= MIN_RANGE_RAD) {
		return 0;
	}

	const t = Math.max(0, Math.min(1, dist / availableTail));
	const linear = 1 - t;
	const eased = 1 - t ** power;
	const weight = Math.max(0, Math.min(1, easeWeight));

	return linear * (1 - weight) + eased * weight;
}

/**
 * Угловая opacity: 1 внутри зоны кружков, плавное затухание на хвостах.
 */
function getAngularOpacity(angle, fadeBounds, cfg) {
	const { angleStart, angleEnd, noFadeMin, noFadeMax } = fadeBounds;
	const insetRad = cfg.fadeInsetDeg * DEG;
	const zoneMin = noFadeMin - insetRad;
	const zoneMax = noFadeMax + insetRad;
	const power = Math.max(0.5, cfg.fadePower);
	const easeWeight = Math.min(1, Math.max(0, cfg.fadeTailDeg) / 45);

	let distOutside = 0;
	if (angle < zoneMin) {
		distOutside = zoneMin - angle;
	} else if (angle > zoneMax) {
		distOutside = angle - zoneMax;
	}

	if (distOutside <= 0) {
		return 1;
	}

	const availableTail = angle < zoneMin ? zoneMin - angleStart : angleEnd - zoneMax;
	return getAngularFadeAlongTail(distOutside, availableTail, power, easeWeight);
}

/**
 * @param {number} angle
 * @param {number} x
 * @param {number} viewportWidth
 * @param {{ angleStart: number, angleEnd: number, noFadeMin: number, noFadeMax: number } | null} fadeBounds
 */
export function getArcSegmentOpacity(angle, x, viewportWidth, fadeBounds = null) {
	let angular = 1;

	if (fadeBounds) {
		angular = getAngularOpacity(angle, fadeBounds, caseStudyArcInternals);
	} else {
		const cfg = caseStudyArcInternals;
		const abs = Math.abs(angle);
		const fadeEndRad = Math.max(0.05, cfg.fadeEndDeg * DEG);

		if (abs >= fadeEndRad) {
			angular = 0;
		} else {
			angular = 1 - abs / fadeEndRad;
		}
	}

	// Горизонтальный fade — только без node-based fade (legacy).
	// На хвостах дуги X ниже порога, из-за этого был скачок на границе кружков.
	if (fadeBounds) {
		return angular;
	}

	let horizontal = 1;
	const fadeStartX = viewportWidth * FADE_START_RATIO;
	const fadeEndX = viewportWidth * FADE_END_RATIO;
	if (x <= fadeStartX) {
		horizontal = 0;
	} else if (x < fadeEndX) {
		horizontal = (x - fadeStartX) / (fadeEndX - fadeStartX);
	}

	return angular * horizontal;
}

/**
 * Угловая половина выреза: хорда дуги 2R·sin(Δ/2) касается кружка радиуса r.
 *
 * @param {number} nodeRadius
 * @param {number} arcRadius
 * @param {number} [trackWidth]
 */
export function getArcLineCutoutHalfRad(nodeRadius, arcRadius, trackWidth = 1) {
	if (arcRadius <= 0 || nodeRadius <= 0) {
		return 0;
	}

	const clearance = nodeRadius + trackWidth * 0.5;
	const ratio = Math.min(1, clearance / (2 * arcRadius));
	return 2 * Math.asin(ratio);
}

/**
 * Интервалы дуги между вырезами под кружки — линия рисуется только здесь.
 *
 * @param {number} angleStart
 * @param {number} angleEnd
 * @param {number[] | undefined} cutoutAngles
 * @param {number} cutoutHalfRad
 * @returns {[number, number][]}
 */
export function getArcDrawableRanges(angleStart, angleEnd, cutoutAngles, cutoutHalfRad) {
	if (!cutoutAngles?.length || cutoutHalfRad <= 0) {
		return [[angleStart, angleEnd]];
	}

	const sorted = [...cutoutAngles].sort((a, b) => a - b);
	const ranges = [];
	let cursor = angleStart;

	for (const angle of sorted) {
		const gapStart = angle - cutoutHalfRad;
		const gapEnd = angle + cutoutHalfRad;

		if (gapStart > cursor) {
			ranges.push([cursor, Math.min(gapStart, angleEnd)]);
		}

		cursor = Math.max(cursor, gapEnd);
		if (cursor >= angleEnd) {
			break;
		}
	}

	if (cursor < angleEnd) {
		ranges.push([cursor, angleEnd]);
	}

	return ranges.filter(([start, end]) => end - start > MIN_RANGE_RAD);
}

function getDrawableArcLength(ranges, radius) {
	let length = 0;
	for (const [start, end] of ranges) {
		length += radius * Math.abs(end - start);
	}
	return length;
}

/**
 * Доля пройденной длины дуги (0…1) до угла свечения — для линии-следа.
 *
 * @param {number} angleStart
 * @param {number} angleEnd
 * @param {number} targetAngle
 * @param {number[] | undefined} cutoutAngles
 * @param {number} cutoutHalfRad
 * @param {number} radius
 */
export function getDrawableArcProgressToAngle(
	angleStart,
	angleEnd,
	targetAngle,
	cutoutAngles,
	cutoutHalfRad,
	radius,
) {
	const target = Math.max(angleStart, Math.min(angleEnd, targetAngle));
	const drawableRanges = getArcDrawableRanges(angleStart, angleEnd, cutoutAngles, cutoutHalfRad);
	const totalLen = getDrawableArcLength(drawableRanges, radius);
	if (totalLen <= 0) {
		return 0;
	}

	let accumulated = 0;

	for (const [rangeStart, rangeEnd] of drawableRanges) {
		if (target <= rangeStart + MIN_RANGE_RAD) {
			break;
		}

		if (target >= rangeEnd - MIN_RANGE_RAD) {
			accumulated += radius * Math.abs(rangeEnd - rangeStart);
			continue;
		}

		accumulated += radius * Math.abs(target - rangeStart);
		break;
	}

	return Math.max(0, Math.min(1, accumulated / totalLen));
}

function strokeArcSegments(
	ctx,
	cx,
	cy,
	radius,
	angleStart,
	angleEnd,
	viewportWidth,
	strokeStyle,
	lineWidth,
	baseAlpha,
	progress = 1,
	cutoutAngles,
	cutoutHalfRad,
	fadeBounds,
) {
	const drawableRanges = getArcDrawableRanges(angleStart, angleEnd, cutoutAngles, cutoutHalfRad);
	const fullSpan = Math.abs(angleEnd - angleStart) || 1;
	const totalLen = getDrawableArcLength(drawableRanges, radius);
	const progressLen = totalLen * Math.max(0, Math.min(1, progress));

	ctx.save();
	ctx.lineCap = "butt";

	let accumulated = 0;

	for (const [rangeStart, rangeEnd] of drawableRanges) {
		const span = rangeEnd - rangeStart;
		const segmentCount = Math.max(
			4,
			Math.round(ARC_SEGMENTS * (Math.abs(span) / fullSpan) * (span < fullSpan * 0.35 ? 1.8 : 1)),
		);
		const step = span / segmentCount;
		const overlap = step * 0.02;

		for (let i = 0; i < segmentCount; i += 1) {
			const a0 = i === 0 ? rangeStart : rangeStart + step * i;
			const a1 = i === segmentCount - 1 ? rangeEnd : rangeStart + step * (i + 1);
			const segLen = radius * Math.abs(a1 - a0);
			const midX0 = cx + radius * Math.cos(a0);
			const midX1 = cx + radius * Math.cos(a1);
			const o0 = getArcSegmentOpacity(a0, midX0, viewportWidth, fadeBounds) * baseAlpha;
			const o1 = getArcSegmentOpacity(a1, midX1, viewportWidth, fadeBounds) * baseAlpha;
			const opacitySpan = Math.abs(o1 - o0);
			const subSteps = opacitySpan > 0.04 ? Math.min(8, Math.ceil(opacitySpan * 24)) : 1;

			for (let sub = 0; sub < subSteps; sub += 1) {
				const t0 = sub / subSteps;
				const t1 = (sub + 1) / subSteps;
				const subA0 = a0 + (a1 - a0) * t0;
				const subA1 = a0 + (a1 - a0) * t1;
				const subLen = radius * Math.abs(subA1 - subA0);
				const subMid = (subA0 + subA1) / 2;
				const subX = cx + radius * Math.cos(subMid);
				const o = getArcSegmentOpacity(subMid, subX, viewportWidth, fadeBounds) * baseAlpha;

				if (o < 0.0005) {
					accumulated += subLen;
					continue;
				}

				if (progress < 1) {
					if (accumulated >= progressLen) {
						ctx.restore();
						return;
					}
					if (accumulated + subLen > progressLen) {
						const partial = subA0 + ((progressLen - accumulated) / subLen) * (subA1 - subA0);
						ctx.save();
						ctx.globalAlpha *= o;
						ctx.beginPath();
						ctx.arc(cx, cy, radius, subA0, partial, false);
						ctx.strokeStyle = strokeStyle;
						ctx.lineWidth = lineWidth;
						ctx.stroke();
						ctx.restore();
						ctx.restore();
						return;
					}
				}

				const isLastSub = sub === subSteps - 1;
				const isLastInRange = i === segmentCount - 1;
				ctx.save();
				ctx.globalAlpha *= o;
				ctx.beginPath();
				ctx.arc(
					cx,
					cy,
					radius,
					subA0,
					isLastSub && isLastInRange ? subA1 : subA1 + overlap / subSteps,
					false,
				);
				ctx.strokeStyle = strokeStyle;
				ctx.lineWidth = lineWidth;
				ctx.stroke();
				ctx.restore();

				accumulated += subLen;
			}
		}
	}

	ctx.restore();
}

export function strokeArcFaded(
	ctx,
	cx,
	cy,
	radius,
	angleStart,
	angleEnd,
	viewportWidth,
	_canvasHeight,
	strokeStyle,
	lineWidth,
	baseAlpha = 1,
	cutoutAngles,
	cutoutHalfRad = 0,
	fadeBounds = null,
) {
	strokeArcSegments(
		ctx,
		cx,
		cy,
		radius,
		angleStart,
		angleEnd,
		viewportWidth,
		strokeStyle,
		lineWidth,
		baseAlpha,
		1,
		cutoutAngles,
		cutoutHalfRad,
		fadeBounds,
	);
}

export function strokeArcProgressFaded(
	ctx,
	cx,
	cy,
	radius,
	angleStart,
	angleEnd,
	viewportWidth,
	_canvasHeight,
	scrollProgress,
	strokeStyle,
	lineWidth,
	baseAlpha = 1,
	cutoutAngles,
	cutoutHalfRad = 0,
	fadeBounds = null,
) {
	strokeArcSegments(
		ctx,
		cx,
		cy,
		radius,
		angleStart,
		angleEnd,
		viewportWidth,
		strokeStyle,
		lineWidth,
		baseAlpha,
		scrollProgress,
		cutoutAngles,
		cutoutHalfRad,
		fadeBounds,
	);
}
