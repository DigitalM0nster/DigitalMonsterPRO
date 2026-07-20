/**
 * Case-arc selection choreography:
 * 1) bright glow travels to the newly selected node (ring held still);
 * 2) then the cyclic ring spins so that node sits at wedge center;
 *    glow sticks to the node while it rides in.
 */
import { wakeCaseStudyAnimationFrame } from "@/portfolio/core/caseStudyAnimationFrame.js";
import {
	freezeCaseStudyArcFocus,
	hasCaseStudyArcFocusState,
	isCaseStudyArcFocusAnimating,
	setCaseStudyArcFocusTarget,
	unfreezeCaseStudyArcFocusTo,
} from "./caseStudyArcFocusMotion.js";
import {
	isArcGlowAnimating,
	isArcGlowReadyForFocusSpin,
	stickArcGlowToAngle,
	syncArcGlowTargetFromScroll,
} from "./caseStudyArcGlowMotion.js";

/** @typedef {'idle' | 'glowTravel' | 'focusSpin'} ArcSelectPhase */

/** @type {ArcSelectPhase} */
let phase = "idle";
/** @type {number | null} */
let trackedActiveIndex = null;
let pendingFocusDeg = 0;
let pendingPeriodDeg = 360;

export function getCaseStudyArcSelectPhase() {
	return phase;
}

export function resetCaseStudyArcSelectSequence() {
	phase = "idle";
	trackedActiveIndex = null;
	pendingFocusDeg = 0;
	pendingPeriodDeg = 360;
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
export function syncCaseStudyArcSelectSequence({
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
		if (!hasCaseStudyArcFocusState()) {
			// Cold start (hub→case): snap; intro handles appear.
			phase = "idle";
			setCaseStudyArcFocusTarget(desiredFocusDeg, period);
			if (activeAngleRad != null) {
				stickArcGlowToAngle(activeAngleRad);
			}
			return;
		}
		// Warm module state (case→case): glow to node, then spin.
		pendingFocusDeg = desiredFocusDeg;
		pendingPeriodDeg = period;
		freezeCaseStudyArcFocus();
		if (activeAngleRad != null) {
			syncArcGlowTargetFromScroll(activeAngleRad);
		}
		phase = "glowTravel";
		wakeCaseStudyAnimationFrame();
		return;
	}

	if (activeIndex !== trackedActiveIndex) {
		trackedActiveIndex = activeIndex;
		pendingFocusDeg = desiredFocusDeg;
		pendingPeriodDeg = period;
		freezeCaseStudyArcFocus();
		if (activeAngleRad != null) {
			syncArcGlowTargetFromScroll(activeAngleRad);
		}
		phase = "glowTravel";
		wakeCaseStudyAnimationFrame();
		return;
	}

	if (phase === "glowTravel") {
		if (activeAngleRad != null) {
			syncArcGlowTargetFromScroll(activeAngleRad);
		}
		// Start ring spin before glow fully settles — kills the end pause.
		if (isArcGlowReadyForFocusSpin()) {
			phase = "focusSpin";
			unfreezeCaseStudyArcFocusTo(pendingFocusDeg, pendingPeriodDeg);
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
		if (!isCaseStudyArcFocusAnimating() && !isArcGlowAnimating()) {
			phase = "idle";
		}
		return;
	}

	// idle — keep focus/glow locked to the open project
	setCaseStudyArcFocusTarget(desiredFocusDeg, period);
	if (activeAngleRad != null) {
		stickArcGlowToAngle(activeAngleRad);
	}
}

export function isCaseStudyArcSelectSequencing() {
	return phase === "glowTravel" || phase === "focusSpin";
}
