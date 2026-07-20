/**
 * Shared local-segment spring (canonical feel).
 * Used by SceneCarousel (ring 0…±1) and About (per-stage / route-edge locals).
 *
 * Thresholds stay at ±0.5; callers only vary smooth rates.
 */

/** Rest to 0 when local is in (−0.5, 0.5). */
export const CAROUSEL_PROGRESS_TARGET_RETURN_THRESHOLD = 0.5;
/** Rest → 0 rate (exp decay, 1/s). */
export const CAROUSEL_PROGRESS_TARGET_RETURN_SMOOTH = 1.5;
/** Rest → +1 when local ≥ 0.5. */
export const CAROUSEL_PROGRESS_TARGET_ADVANCE_THRESHOLD = 0.5;
/** Rest → −1 when local ≤ −0.5. */
export const CAROUSEL_PROGRESS_TARGET_RETREAT_THRESHOLD = -0.5;
/** Rest → +1 rate (exp decay, 1/s). */
export const CAROUSEL_PROGRESS_TARGET_ADVANCE_SMOOTH = 1.5;
/** Rest → −1 rate (exp decay, 1/s). */
export const CAROUSEL_PROGRESS_TARGET_RETREAT_SMOOTH = 1.5;
/** Near-0 final boost zone. */
export const CAROUSEL_PROGRESS_TARGET_FINAL_ZONE = 0.02;
/** Near-+1 final boost starts above this. */
export const CAROUSEL_PROGRESS_TARGET_ADVANCE_FINAL_THRESHOLD = 0.92;
/** Near-−1 final boost starts below this. */
export const CAROUSEL_PROGRESS_TARGET_RETREAT_FINAL_THRESHOLD = -0.92;
/** × rest rate in final zones. */
export const CAROUSEL_PROGRESS_TARGET_FINAL_SMOOTH_MUL = 15;
/** progress chase rate (exp decay, 1/s). */
export const CAROUSEL_PROGRESS_SMOOTH = 4;
/** Chase boost when |progress| exceeds this. */
export const CAROUSEL_PROGRESS_CHASE_FINAL_THRESHOLD = 0.96;
export const CAROUSEL_PROGRESS_CHASE_FINAL_SMOOTH_MUL = 2;

export const CAROUSEL_PROGRESS_SEGMENT_END = 1;
export const CAROUSEL_PROGRESS_SEGMENT_BACK_END = -1;

const DEFAULT_REST_EPS = 0.00005;

/**
 * @typedef {{
 *   returnSmooth?: number,
 *   advanceSmooth?: number,
 *   retreatSmooth?: number,
 *   finalZone?: number,
 *   finalMul?: number,
 *   advanceFinalThreshold?: number,
 *   retreatFinalThreshold?: number,
 *   returnThreshold?: number,
 *   advanceThreshold?: number,
 *   retreatThreshold?: number,
 *   restEps?: number,
 * }} SegmentSpringRates
 */

/** @param {SegmentSpringRates} [rates] */
export function createCarouselSegmentSpringRates(rates = {}) {
	return {
		returnSmooth: rates.returnSmooth ?? CAROUSEL_PROGRESS_TARGET_RETURN_SMOOTH,
		advanceSmooth: rates.advanceSmooth ?? CAROUSEL_PROGRESS_TARGET_ADVANCE_SMOOTH,
		retreatSmooth: rates.retreatSmooth ?? CAROUSEL_PROGRESS_TARGET_RETREAT_SMOOTH,
		finalZone: rates.finalZone ?? CAROUSEL_PROGRESS_TARGET_FINAL_ZONE,
		finalMul: rates.finalMul ?? CAROUSEL_PROGRESS_TARGET_FINAL_SMOOTH_MUL,
		advanceFinalThreshold: rates.advanceFinalThreshold ?? CAROUSEL_PROGRESS_TARGET_ADVANCE_FINAL_THRESHOLD,
		retreatFinalThreshold: rates.retreatFinalThreshold ?? CAROUSEL_PROGRESS_TARGET_RETREAT_FINAL_THRESHOLD,
		returnThreshold: rates.returnThreshold ?? CAROUSEL_PROGRESS_TARGET_RETURN_THRESHOLD,
		advanceThreshold: rates.advanceThreshold ?? CAROUSEL_PROGRESS_TARGET_ADVANCE_THRESHOLD,
		retreatThreshold: rates.retreatThreshold ?? CAROUSEL_PROGRESS_TARGET_RETREAT_THRESHOLD,
		restEps: rates.restEps ?? DEFAULT_REST_EPS,
	};
}

/**
 * ×finalMul near ±1 or the last approach to 0 from either side.
 * @param {number} localTarget
 * @param {SegmentSpringRates} [rates]
 */
export function getLocalTargetFinalSmoothMul(localTarget, rates = {}) {
	const cfg = createCarouselSegmentSpringRates(rates);

	if (localTarget > cfg.advanceFinalThreshold && localTarget >= cfg.advanceThreshold) {
		return cfg.finalMul;
	}
	if (localTarget < cfg.retreatFinalThreshold && localTarget <= cfg.retreatThreshold) {
		return cfg.finalMul;
	}
	if (localTarget > 0 && localTarget <= cfg.finalZone) {
		return cfg.finalMul;
	}
	if (localTarget < 0 && localTarget >= -cfg.finalZone) {
		return cfg.finalMul;
	}
	return 1;
}

/**
 * Rest a local segment target:
 * (−0.5, 0.5) → 0; [0.5, 1] → +1; [−1, −0.5] → −1;
 * overshoot (1…1.5] / [−1.5…−1) is held — wheel leftover transfers on commit.
 * @param {number} localTarget
 * @param {number} delta
 * @param {SegmentSpringRates} [rates]
 */
export function applyLocalSegmentTargetRest(localTarget, delta, rates = {}) {
	const cfg = createCarouselSegmentSpringRates(rates);
	let target = localTarget;

	// Hold overshoot past ±1 so continuous scroll can accumulate leftover for the
	// next page (ring post-commit target or About/case interior story target).
	if (target > CAROUSEL_PROGRESS_SEGMENT_END) {
		return target;
	}
	if (target < CAROUSEL_PROGRESS_SEGMENT_BACK_END) {
		return target;
	}

	const finalMul = getLocalTargetFinalSmoothMul(localTarget, cfg);

	if (target > cfg.retreatThreshold && target < cfg.returnThreshold) {
		const t = 1 - Math.exp(-cfg.returnSmooth * finalMul * delta);
		target += (0 - target) * t;
		if (Math.abs(target) < cfg.restEps) {
			target = 0;
		}
		return target;
	}

	if (target >= cfg.advanceThreshold) {
		const t = 1 - Math.exp(-cfg.advanceSmooth * finalMul * delta);
		target += (CAROUSEL_PROGRESS_SEGMENT_END - target) * t;
		if (Math.abs(target - CAROUSEL_PROGRESS_SEGMENT_END) < cfg.restEps) {
			target = CAROUSEL_PROGRESS_SEGMENT_END;
		}
		return target;
	}

	if (target <= cfg.retreatThreshold) {
		const t = 1 - Math.exp(-cfg.retreatSmooth * finalMul * delta);
		target += (CAROUSEL_PROGRESS_SEGMENT_BACK_END - target) * t;
		if (Math.abs(target - CAROUSEL_PROGRESS_SEGMENT_BACK_END) < cfg.restEps) {
			target = CAROUSEL_PROGRESS_SEGMENT_BACK_END;
		}
		return target;
	}

	return target;
}

/**
 * Exp chase current → target (frame-rate independent).
 * @param {number} current
 * @param {number} target
 * @param {number} delta
 * @param {{ smooth: number, chaseMul?: number }} opts
 */
export function chaseSegmentValue(current, target, delta, { smooth, chaseMul = 1 }) {
	const t = 1 - Math.exp(-smooth * chaseMul * delta);
	return current + (target - current) * t;
}

/**
 * @param {number} absProgress
 * @param {{ threshold?: number, mul?: number }} [opts]
 */
export function getAbsChaseSmoothMul(
	absProgress,
	{
		threshold = CAROUSEL_PROGRESS_CHASE_FINAL_THRESHOLD,
		mul = CAROUSEL_PROGRESS_CHASE_FINAL_SMOOTH_MUL,
	} = {},
) {
	return absProgress > threshold ? mul : 1;
}
