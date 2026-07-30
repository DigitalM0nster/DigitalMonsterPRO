/**
 * Локальный прогресс внутри активного этапа (state): target от скролла, progress догоняет.
 * Аналог progressTarget / progress и sceneProgressTarget / sceneProgress в SceneCarousel.
 *
 * Ease is symmetric: the same exp chase both ways, and commits wrap with ±1 so
 * (progress − target) continuity is preserved — no soft-land snap to 0/1 that
 * kills velocity on one side only.
 */

import { promoteCasePanelHudCanvases } from "./casePanelHudBridge.js";
import { isCaseStageClickMosaicActive } from "./caseStageClickMosaic.js";

/** Скорость догоняния stageProgress → stageProgressTarget (exp decay, 1/с). */
export const STAGE_PROGRESS_SMOOTH = 4;
export const STAGE_PROGRESS_TARGET_MIN = -0.5;
export const STAGE_PROGRESS_TARGET_MAX = 1.5;
const STAGE_PROGRESS_COMMIT_EPS = 1e-4;
/**
 * After a backward wrap, scroll sync can still report target < 0 (overshoot from
 * the previous stage). Clamping only that case keeps the ease continuous without
 * slowing forward overshoot (target > 1).
 */
const STAGE_PROGRESS_BACKWARD_HOLD_RELEASE = 0.02;

let stageProgress = 0;
let stageProgressTarget = 0;
let stageScrollIntent = null;
let stageCommitCallback = null;
let preservedBoundaryOvershoot = null;
/** @type {boolean} */
let holdBackwardOvershoot = false;

/**
 * @param {import('./types.js').PortfolioState[]} states
 * @param {number} stateIndex
 * @param {number} scrollProgress — глобальный 0…1
 */
export function computeStageProgressTarget(
	states,
	stateIndex,
	scrollProgress,
	scrollTargetProgress = scrollProgress,
) {
	const state = states[stateIndex];
	if (!state) {
		return 0;
	}

	const nextState = states[stateIndex + 1];
	const isLast = !nextState;
	const isPenultimate = Boolean(nextState) && !states[stateIndex + 2];
	const stateStart = state.scrollAnchor ?? 0;

	// Последний индекс не скроллится отдельно: его контент — это progress=1 на предпоследнем.
	if (isLast) {
		return 0;
	}

	// The outer stages pass their overflow to SceneCarousel. Preserve the same
	// virtual target locally so the handoff has no dead zone at 0 or 1.
	if (stateIndex === 0 && scrollTargetProgress < 0) {
		return Math.max(STAGE_PROGRESS_TARGET_MIN, scrollTargetProgress);
	}
	if (isPenultimate && scrollTargetProgress > 1) {
		return Math.min(STAGE_PROGRESS_TARGET_MAX, scrollTargetProgress);
	}

	const stateEnd = nextState.scrollAnchor ?? 1;
	const range = Math.max(stateEnd - stateStart, 0.001);

	return Math.max(
		STAGE_PROGRESS_TARGET_MIN,
		Math.min(STAGE_PROGRESS_TARGET_MAX, (scrollProgress - stateStart) / range),
	);
}

/**
 * @param {number} target
 */
export function syncStageProgressTarget(target, options = {}) {
	let next = Math.max(STAGE_PROGRESS_TARGET_MIN, Math.min(STAGE_PROGRESS_TARGET_MAX, target));

	// Keep backward ease continuous: don't re-open target < 0 until progress
	// has eased back near 0. Forward (target > 1) stays unrestricted.
	if (holdBackwardOvershoot) {
		if (stageProgress <= STAGE_PROGRESS_BACKWARD_HOLD_RELEASE) {
			holdBackwardOvershoot = false;
		} else if (next < 0) {
			next = 0;
		}
	}

	if (next > stageProgressTarget + STAGE_PROGRESS_COMMIT_EPS) {
		stageScrollIntent = "forward";
		holdBackwardOvershoot = false;
	} else if (next < stageProgressTarget - STAGE_PROGRESS_COMMIT_EPS) {
		stageScrollIntent = "backward";
	}
	stageProgressTarget = next;
	preservedBoundaryOvershoot = options.preserveBoundaryOvershoot
		? next < 0
			? "backward"
			: next > 1
				? "forward"
				: null
		: null;
}

export function registerStageCommitCallback(callback) {
	stageCommitCallback = callback;
}

export function getStageProgress() {
	return stageProgress;
}

export function getStageProgressTarget() {
	return stageProgressTarget;
}

export function getStageScrollIntent() {
	return stageScrollIntent;
}

export function resetStageProgress() {
	stageProgress = 0;
	stageProgressTarget = 0;
	stageScrollIntent = null;
	preservedBoundaryOvershoot = null;
	holdBackwardOvershoot = false;
}

export function setStageProgressState(value) {
	const next = Math.max(0, Math.min(1, value));
	stageProgress = next;
	stageProgressTarget = next;
	stageScrollIntent = null;
	preservedBoundaryOvershoot = null;
	holdBackwardOvershoot = false;
}

/** Direct progress write for controlled settles (click pre-settle). Does not move target. */
export function forceStageProgress(value) {
	stageProgress = Math.max(STAGE_PROGRESS_TARGET_MIN, Math.min(STAGE_PROGRESS_TARGET_MAX, value));
}

/**
 * @param {number} dt — секунды
 * @returns {boolean} нужна ли перерисовка
 */
export function tickStageProgress(dt) {
	// Click pre-settle + mosaic own progress; do not let scroll chase fight them.
	if (isCaseStageClickMosaicActive()) {
		return false;
	}
	const beforeProgress = stageProgress;
	const factor = 1 - Math.exp(-STAGE_PROGRESS_SMOOTH * dt);
	const next = stageProgress + (stageProgressTarget - stageProgress) * factor;
	stageProgress = Math.abs(next - stageProgressTarget) <= STAGE_PROGRESS_COMMIT_EPS
		? stageProgressTarget
		: next;

	if (
		holdBackwardOvershoot
		&& stageProgress <= STAGE_PROGRESS_BACKWARD_HOLD_RELEASE
	) {
		holdBackwardOvershoot = false;
	}

	// Route-boundary overshoot: pin visible progress at 0/1, keep target outside for carousel handoff.
	if (
		preservedBoundaryOvershoot === "forward" &&
		stageProgressTarget > 1 + STAGE_PROGRESS_COMMIT_EPS
	) {
		stageProgress = Math.min(1, stageProgress);
		return true;
	}
	if (
		preservedBoundaryOvershoot === "backward" &&
		stageProgressTarget < -STAGE_PROGRESS_COMMIT_EPS
	) {
		stageProgress = Math.max(0, stageProgress);
		return true;
	}

	// Commit only when progress crosses a boundary (target only attracts).
	// Symmetric wrap: ±1 keeps the chase error continuous both ways.
	const crossedForward =
		(beforeProgress < 1 - STAGE_PROGRESS_COMMIT_EPS && stageProgress >= 1 - STAGE_PROGRESS_COMMIT_EPS)
		|| stageProgress > 1 + STAGE_PROGRESS_COMMIT_EPS;
	const crossedBackward = stageProgress < -STAGE_PROGRESS_COMMIT_EPS;

	if (crossedForward) {
		const committed = stageCommitCallback?.("forward") === true;
		if (committed) {
			holdBackwardOvershoot = false;
			stageProgress -= 1;
			stageProgressTarget -= 1;
			promoteCasePanelHudCanvases("forward");
			return true;
		}
		stageProgress = 1;
		stageProgressTarget = Math.min(1, stageProgressTarget);
		stageScrollIntent = null;
		return true;
	}

	if (crossedBackward) {
		const committed = stageCommitCallback?.("backward") === true;
		if (committed) {
			stageProgress += 1;
			stageProgressTarget += 1;
			// Block scroll sync from re-opening target < 0 until this stage eases near 0.
			holdBackwardOvershoot = true;
			if (stageProgressTarget < 0) {
				stageProgressTarget = 0;
			}
			promoteCasePanelHudCanvases("backward");
			return true;
		}
		stageProgress = 0;
		stageProgressTarget = Math.max(0, stageProgressTarget);
		stageScrollIntent = null;
		return true;
	}

	return Math.abs(stageProgress - beforeProgress) > STAGE_PROGRESS_COMMIT_EPS
		|| Math.abs(stageProgress - stageProgressTarget) > STAGE_PROGRESS_COMMIT_EPS;
}

/** Есть ли расхождение progress и target — нужен ли ещё rAF. */
export function isStageProgressAnimating() {
	if (
		preservedBoundaryOvershoot === "forward"
		&& stageProgressTarget > 1 + STAGE_PROGRESS_COMMIT_EPS
		&& stageProgress >= 1 - STAGE_PROGRESS_COMMIT_EPS
	) {
		// Progress is pinned for carousel handoff — do not keep the case paint loop alive.
		return false;
	}
	if (
		preservedBoundaryOvershoot === "backward"
		&& stageProgressTarget < -STAGE_PROGRESS_COMMIT_EPS
		&& stageProgress <= STAGE_PROGRESS_COMMIT_EPS
	) {
		return false;
	}
	return Math.abs(stageProgress - stageProgressTarget) > 0.0001;
}
