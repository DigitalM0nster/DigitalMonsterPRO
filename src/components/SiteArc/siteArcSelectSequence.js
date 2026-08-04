/**
 * Site-arc selection choreography:
 * 1) bright glow starts travelling to the newly selected node (ring held still);
 * 2) halfway through that trip the cyclic ring starts spinning to centre it;
 *    glow sticks to the node while it rides in.
 */
import { wakeCaseStudyAnimationFrame } from "@/pages/portfolio/core/caseStudyAnimationFrame.js";
import {
	freezeSiteArcFocus,
	hasSiteArcFocusState,
	isSiteArcFocusAnimating,
	setSiteArcFocusTarget,
	unfreezeSiteArcFocusTo,
} from "./siteArcFocusMotion.js";
import {
	getArcGlowDistanceToTargetRad,
	isArcGlowAnimating,
	stickArcGlowToAngle,
	syncArcGlowTargetFromScroll,
} from "./siteArcGlowMotion.js";

const FOCUS_SPIN_START_GLOW_PROGRESS = 0.5;
const MIN_GLOW_TRAVEL_DISTANCE_RAD = 0.0001;

/** @typedef {'idle' | 'glowTravel' | 'focusSpin'} ArcSelectPhase */

/** @type {ArcSelectPhase} */
let phase = "idle";
/** @type {number | null} */
let trackedActiveIndex = null;
let pendingFocusDeg = 0;
let pendingPeriodDeg = 360;
let glowTravelStartDistanceRad = 0;

export function getSiteArcSelectPhase() {
	return phase;
}

export function resetSiteArcSelectSequence() {
	phase = "idle";
	trackedActiveIndex = null;
	pendingFocusDeg = 0;
	pendingPeriodDeg = 360;
	glowTravelStartDistanceRad = 0;
}

/**
 * Call once per arc paint after node angles are known for the current (possibly frozen) focus.
 * @param {{
 *   activeIndex: number,
 *   ringGapDeg: number,
 *   ringPeriodDeg: number,
 *   activeAngleRad: number | null,
 * }} params
 */
export function syncSiteArcSelectSequence({
	activeIndex,
	ringGapDeg,
	ringPeriodDeg,
	activeAngleRad,
}) {
	if (activeIndex < 0) {
		return;
	}

	const desiredFocusDeg = activeIndex * ringGapDeg;
	const period = ringPeriodDeg > 0 ? ringPeriodDeg : 360;

	if (trackedActiveIndex === null) {
		trackedActiveIndex = activeIndex;
		if (!hasSiteArcFocusState()) {
			// Cold start (hub→case): snap; intro handles appear.
			phase = "idle";
			setSiteArcFocusTarget(desiredFocusDeg, period);
			if (activeAngleRad != null) {
				stickArcGlowToAngle(activeAngleRad);
			}
			return;
		}
		// Warm module state (case→case): glow to node, then spin.
		pendingFocusDeg = desiredFocusDeg;
		pendingPeriodDeg = period;
		freezeSiteArcFocus();
		if (activeAngleRad != null) {
			syncArcGlowTargetFromScroll(activeAngleRad);
		}
		glowTravelStartDistanceRad = getArcGlowDistanceToTargetRad();
		phase = "glowTravel";
		wakeCaseStudyAnimationFrame();
		return;
	}

	if (activeIndex !== trackedActiveIndex) {
		trackedActiveIndex = activeIndex;
		pendingFocusDeg = desiredFocusDeg;
		pendingPeriodDeg = period;
		freezeSiteArcFocus();
		if (activeAngleRad != null) {
			syncArcGlowTargetFromScroll(activeAngleRad);
		}
		glowTravelStartDistanceRad = getArcGlowDistanceToTargetRad();
		phase = "glowTravel";
		wakeCaseStudyAnimationFrame();
		return;
	}

	if (phase === "glowTravel") {
		if (activeAngleRad != null) {
			syncArcGlowTargetFromScroll(activeAngleRad);
		}
		const remainingDistanceRad = getArcGlowDistanceToTargetRad();
		const glowTravelProgress = glowTravelStartDistanceRad <= MIN_GLOW_TRAVEL_DISTANCE_RAD
			? 1
			: Math.max(0, Math.min(1, 1 - remainingDistanceRad / glowTravelStartDistanceRad));
		if (glowTravelProgress >= FOCUS_SPIN_START_GLOW_PROGRESS || !isArcGlowAnimating()) {
			phase = "focusSpin";
			unfreezeSiteArcFocusTo(pendingFocusDeg, pendingPeriodDeg);
			wakeCaseStudyAnimationFrame();
		}
		return;
	}

	if (phase === "focusSpin") {
		if (activeAngleRad != null) {
			// Keep lerping the last glow tail onto the moving node, then stick.
			if (isArcGlowAnimating()) {
				syncArcGlowTargetFromScroll(activeAngleRad);
			} else {
				stickArcGlowToAngle(activeAngleRad);
			}
		}
		if (!isSiteArcFocusAnimating() && !isArcGlowAnimating()) {
			phase = "idle";
		}
		return;
	}

	// idle — keep focus/glow locked to the open project
	setSiteArcFocusTarget(desiredFocusDeg, period);
	if (activeAngleRad != null) {
		stickArcGlowToAngle(activeAngleRad);
	}
}

export function isSiteArcSelectSequencing() {
	return phase === "glowTravel" || phase === "focusSpin";
}
