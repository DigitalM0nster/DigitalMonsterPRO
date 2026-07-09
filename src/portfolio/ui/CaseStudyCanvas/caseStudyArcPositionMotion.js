import { wakeCaseStudyAnimationFrame } from "@/portfolio/core/caseStudyAnimationFrame.js";

const POSITION_SMOOTH_SEC = 0.5;
const POSITION_EPSILON = 0.05;

let currentShift = null;
let targetShift = 0;

export function setCaseStudyArcShiftTarget(nextTarget) {
	const next = Math.max(0, Number(nextTarget) || 0);
	if (currentShift === null) {
		currentShift = next;
		targetShift = next;
		return;
	}

	if (Math.abs(next - targetShift) <= POSITION_EPSILON) {
		return;
	}

	targetShift = next;
	wakeCaseStudyAnimationFrame();
}

export function getCaseStudyArcShift() {
	return currentShift ?? targetShift;
}

export function isCaseStudyArcShiftAnimating() {
	return currentShift !== null && Math.abs(targetShift - currentShift) > POSITION_EPSILON;
}

export function tickCaseStudyArcShift(delta) {
	if (!isCaseStudyArcShiftAnimating()) {
		return false;
	}

	const blend = 1 - Math.exp(-delta * 5 / POSITION_SMOOTH_SEC);
	currentShift += (targetShift - currentShift) * blend;
	if (Math.abs(targetShift - currentShift) <= POSITION_EPSILON) {
		currentShift = targetShift;
	}
	return true;
}

export function resetCaseStudyArcShiftMotion() {
	currentShift = null;
	targetShift = 0;
}
