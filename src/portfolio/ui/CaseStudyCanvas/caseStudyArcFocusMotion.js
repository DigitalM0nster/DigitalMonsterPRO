/**
 * Spins the cyclic project ring so the active project sits at the wedge center.
 * Focus is continuous degrees on the ring period; targets take the shortest path.
 * Can be frozen while glow travels to the newly selected node.
 */
import { wakeCaseStudyAnimationFrame } from "@/portfolio/core/caseStudyAnimationFrame.js";
import { caseStudyArcRuntime } from "./caseStudyArcConfig.js";
import { shortestDegDelta } from "./caseStudyArcCycle.js";

const FOCUS_SMOOTH_SEC = 1.2;
const FOCUS_EPSILON_DEG = 0.04;

let currentFocusDeg = null;
let targetFocusDeg = 0;
let ringPeriodDeg = 360;
let frozen = false;

/**
 * @param {number} nextTargetDeg — absolute ring angle (index * gap)
 * @param {number} [periodDeg]
 */
export function setCaseStudyArcFocusTarget(nextTargetDeg, periodDeg = ringPeriodDeg) {
	const period = Number.isFinite(periodDeg) && periodDeg > 0 ? periodDeg : 360;
	ringPeriodDeg = period;
	const rawTarget = Number.isFinite(nextTargetDeg) ? nextTargetDeg : 0;

	if (frozen) {
		return;
	}

	if (currentFocusDeg === null) {
		currentFocusDeg = rawTarget;
		targetFocusDeg = rawTarget;
		caseStudyArcRuntime.focusRotationDeg = rawTarget;
		return;
	}

	const delta = shortestDegDelta(targetFocusDeg, rawTarget, period);
	if (Math.abs(delta) <= FOCUS_EPSILON_DEG) {
		return;
	}

	const from = currentFocusDeg;
	targetFocusDeg = from + shortestDegDelta(from, rawTarget, period);
	wakeCaseStudyAnimationFrame();
}

/** Hold the ring still (glow-travel phase). */
export function freezeCaseStudyArcFocus() {
	if (currentFocusDeg === null) {
		currentFocusDeg = targetFocusDeg;
	}
	frozen = true;
	targetFocusDeg = currentFocusDeg;
	caseStudyArcRuntime.focusRotationDeg = currentFocusDeg;
}

/**
 * Release hold and spin to the pending focus target.
 * @param {number} nextTargetDeg
 * @param {number} [periodDeg]
 */
export function unfreezeCaseStudyArcFocusTo(nextTargetDeg, periodDeg = ringPeriodDeg) {
	frozen = false;
	setCaseStudyArcFocusTarget(nextTargetDeg, periodDeg);
}

export function isCaseStudyArcFocusFrozen() {
	return frozen;
}

/** False until the first focus target was applied (cold start). */
export function hasCaseStudyArcFocusState() {
	return currentFocusDeg !== null;
}

export function isCaseStudyArcFocusAnimating() {
	if (frozen) {
		return false;
	}
	return currentFocusDeg !== null && Math.abs(targetFocusDeg - currentFocusDeg) > FOCUS_EPSILON_DEG;
}

/**
 * @param {number} delta
 */
export function tickCaseStudyArcFocus(delta) {
	if (frozen || !isCaseStudyArcFocusAnimating()) {
		caseStudyArcRuntime.focusRotationDeg = currentFocusDeg ?? targetFocusDeg;
		return false;
	}

	const blend = 1 - Math.exp((-delta * 5) / FOCUS_SMOOTH_SEC);
	currentFocusDeg += (targetFocusDeg - currentFocusDeg) * blend;
	if (Math.abs(targetFocusDeg - currentFocusDeg) <= FOCUS_EPSILON_DEG) {
		currentFocusDeg = targetFocusDeg;
	}
	caseStudyArcRuntime.focusRotationDeg = currentFocusDeg;
	return true;
}

export function resetCaseStudyArcFocusMotion() {
	currentFocusDeg = null;
	targetFocusDeg = 0;
	ringPeriodDeg = 360;
	frozen = false;
	caseStudyArcRuntime.focusRotationDeg = 0;
}
