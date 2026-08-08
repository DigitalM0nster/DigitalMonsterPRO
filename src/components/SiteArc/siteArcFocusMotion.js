/**
 * Spins the cyclic project ring so the active project sits at the wedge center.
 * Focus is continuous degrees on the ring period; targets take the shortest path.
 * Can be frozen while glow travels to the newly selected node.
 */
import { wakeCaseStudyAnimationFrame } from "@/pages/portfolio/core/caseStudyAnimationFrame.js";
import { siteArcRuntime } from "./siteArcConfig.js";
import { shortestDegDelta } from "./siteArcCycle.js";

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
export function setSiteArcFocusTarget(nextTargetDeg, periodDeg = ringPeriodDeg) {
	const period = Number.isFinite(periodDeg) && periodDeg > 0 ? periodDeg : 360;
	ringPeriodDeg = period;
	const rawTarget = Number.isFinite(nextTargetDeg) ? nextTargetDeg : 0;

	if (frozen) {
		return;
	}

	if (currentFocusDeg === null) {
		currentFocusDeg = rawTarget;
		targetFocusDeg = rawTarget;
		siteArcRuntime.focusRotationDeg = rawTarget;
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

/**
 * Wheel progress owns the painted ring directly while a route segment is live.
 * Keeping the internal focus value in sync lets the post-commit focus animation
 * continue from the last painted position instead of jumping back to the source.
 * @param {number} nextFocusDeg
 * @param {number} [periodDeg]
 */
export function setSiteArcFocusFromScroll(nextFocusDeg, periodDeg = ringPeriodDeg) {
	if (!Number.isFinite(nextFocusDeg)) {
		return;
	}
	const period = Number.isFinite(periodDeg) && periodDeg > 0 ? periodDeg : 360;
	const changed = currentFocusDeg === null
		|| Math.abs(nextFocusDeg - currentFocusDeg) > FOCUS_EPSILON_DEG;
	ringPeriodDeg = period;
	frozen = false;
	currentFocusDeg = nextFocusDeg;
	targetFocusDeg = nextFocusDeg;
	siteArcRuntime.focusRotationDeg = nextFocusDeg;
	if (changed) {
		wakeCaseStudyAnimationFrame();
	}
}

/** Hold the ring still (glow-travel phase). */
export function freezeSiteArcFocus() {
	if (currentFocusDeg === null) {
		currentFocusDeg = targetFocusDeg;
	}
	frozen = true;
	targetFocusDeg = currentFocusDeg;
	siteArcRuntime.focusRotationDeg = currentFocusDeg;
}

/**
 * Release hold and spin to the pending focus target.
 * @param {number} nextTargetDeg
 * @param {number} [periodDeg]
 */
export function unfreezeSiteArcFocusTo(nextTargetDeg, periodDeg = ringPeriodDeg) {
	frozen = false;
	setSiteArcFocusTarget(nextTargetDeg, periodDeg);
}

export function isSiteArcFocusFrozen() {
	return frozen;
}

/** False until the first focus target was applied (cold start). */
export function hasSiteArcFocusState() {
	return currentFocusDeg !== null;
}

export function isSiteArcFocusAnimating() {
	if (frozen) {
		return false;
	}
	return currentFocusDeg !== null && Math.abs(targetFocusDeg - currentFocusDeg) > FOCUS_EPSILON_DEG;
}

/**
 * @param {number} delta
 */
export function tickSiteArcFocus(delta) {
	if (frozen || !isSiteArcFocusAnimating()) {
		siteArcRuntime.focusRotationDeg = currentFocusDeg ?? targetFocusDeg;
		return false;
	}

	const blend = 1 - Math.exp((-delta * 5) / FOCUS_SMOOTH_SEC);
	currentFocusDeg += (targetFocusDeg - currentFocusDeg) * blend;
	if (Math.abs(targetFocusDeg - currentFocusDeg) <= FOCUS_EPSILON_DEG) {
		currentFocusDeg = targetFocusDeg;
	}
	siteArcRuntime.focusRotationDeg = currentFocusDeg;
	return true;
}

export function resetSiteArcFocusMotion() {
	currentFocusDeg = null;
	targetFocusDeg = 0;
	ringPeriodDeg = 360;
	frozen = false;
	siteArcRuntime.focusRotationDeg = 0;
}
