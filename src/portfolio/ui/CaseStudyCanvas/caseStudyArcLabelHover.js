/**
 * Arc label dim mask: texts stay darkened; hover smoothly lifts the mask.
 */
import { wakeCaseStudyAnimationFrame } from "@/portfolio/core/caseStudyAnimationFrame.js";

const MAX_SLOTS = 16;
const REVEAL_SMOOTH_SEC = 0.28;
const REVEAL_EPS = 0.01;

/** Dim multiplier when not hovered (1 = full brightness). */
export const ARC_LABEL_MASK_DIM = 0.38;

/** @type {number[]} */
const reveal = Array.from({ length: MAX_SLOTS }, () => 0);
/** @type {number[]} */
const revealTarget = Array.from({ length: MAX_SLOTS }, () => 0);
let slotCount = 0;
/** @type {string | null} */
let hoveredStateId = null;
/** @type {string[]} */
let slotStateIds = [];

/**
 * @param {string[]} stateIds — nav slot ids in draw order
 */
export function setArcLabelHoverSlots(stateIds) {
	slotCount = Math.min(MAX_SLOTS, stateIds.length);
	slotStateIds = stateIds.slice(0, slotCount);
	for (let i = 0; i < slotCount; i += 1) {
		revealTarget[i] = slotStateIds[i] && slotStateIds[i] === hoveredStateId ? 1 : 0;
	}
}

/**
 * @param {string | null | undefined} stateId
 */
export function setArcLabelHoverTarget(stateId) {
	const next = stateId ?? null;
	if (next === hoveredStateId) {
		return;
	}
	hoveredStateId = next;
	for (let i = 0; i < slotCount; i += 1) {
		revealTarget[i] = slotStateIds[i] && slotStateIds[i] === hoveredStateId ? 1 : 0;
	}
	wakeCaseStudyAnimationFrame();
}

/**
 * @param {number} index
 */
export function getArcLabelHoverReveal(index) {
	if (index < 0 || index >= slotCount) {
		return 0;
	}
	return reveal[index] ?? 0;
}

/**
 * @param {number} index
 */
export function getArcLabelMaskMul(index) {
	const t = getArcLabelHoverReveal(index);
	return ARC_LABEL_MASK_DIM + (1 - ARC_LABEL_MASK_DIM) * t;
}

export function isArcLabelHoverAnimating() {
	for (let i = 0; i < slotCount; i += 1) {
		if (Math.abs(revealTarget[i] - reveal[i]) > REVEAL_EPS) {
			return true;
		}
	}
	return false;
}

/**
 * @param {number} dt
 */
export function tickArcLabelHover(dt) {
	if (!isArcLabelHoverAnimating()) {
		return false;
	}
	const blend = 1 - Math.exp((-dt * 5) / REVEAL_SMOOTH_SEC);
	let moved = false;
	for (let i = 0; i < slotCount; i += 1) {
		const next = reveal[i] + (revealTarget[i] - reveal[i]) * blend;
		if (Math.abs(revealTarget[i] - next) <= REVEAL_EPS) {
			if (reveal[i] !== revealTarget[i]) {
				reveal[i] = revealTarget[i];
				moved = true;
			}
		} else {
			reveal[i] = next;
			moved = true;
		}
	}
	return moved;
}

export function resetArcLabelHover() {
	hoveredStateId = null;
	slotCount = 0;
	slotStateIds = [];
	for (let i = 0; i < MAX_SLOTS; i += 1) {
		reveal[i] = 0;
		revealTarget[i] = 0;
	}
}
