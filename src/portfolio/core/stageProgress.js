/**
 * Локальный прогресс внутри активного этапа (state): target от скролла, progress догоняет.
 * Аналог progressTarget / progress и sceneProgressTarget / sceneProgress в SceneCarousel.
 */

/** Скорость догоняния stageProgress → stageProgressTarget (exp decay, 1/с). */
export const STAGE_PROGRESS_SMOOTH = 4;
export const STAGE_PROGRESS_TARGET_MIN = -0.5;
export const STAGE_PROGRESS_TARGET_MAX = 1.5;
const STAGE_PROGRESS_COMMIT_EPS = 1e-4;

let stageProgress = 0;
let stageProgressTarget = 0;
let stageScrollIntent = null;
let stageCommitCallback = null;

/**
 * @param {import('./types.js').PortfolioState[]} states
 * @param {number} stateIndex
 * @param {number} scrollProgress — глобальный 0…1
 */
export function computeStageProgressTarget(states, stateIndex, scrollProgress) {
	const state = states[stateIndex];
	if (!state) {
		return 0;
	}

	const nextState = states[stateIndex + 1];
	const isLast = !nextState;
	const isPenultimate = Boolean(nextState) && !states[stateIndex + 2];
	const stateStart = state.scrollAnchor ?? 0;

	// Последний индекс — только через goToState / nav. Скролл финалит на предпоследнем.
	if (isLast) {
		return scrollProgress >= stateStart ? 1 : 0;
	}

	const stateEnd = nextState.scrollAnchor ?? 1;
	const range = Math.max(stateEnd - stateStart, 0.001);
	// На предпоследнем нет commit-overshoot: 0→1 и есть финал (контент последнего).
	const maxTarget = isPenultimate ? 1 : STAGE_PROGRESS_TARGET_MAX;

	return Math.max(
		STAGE_PROGRESS_TARGET_MIN,
		Math.min(maxTarget, (scrollProgress - stateStart) / range),
	);
}

/**
 * @param {number} target
 */
export function syncStageProgressTarget(target) {
	const next = Math.max(STAGE_PROGRESS_TARGET_MIN, Math.min(STAGE_PROGRESS_TARGET_MAX, target));
	if (next > stageProgressTarget + STAGE_PROGRESS_COMMIT_EPS) {
		stageScrollIntent = "forward";
	} else if (next < stageProgressTarget - STAGE_PROGRESS_COMMIT_EPS) {
		stageScrollIntent = "backward";
	}
	stageProgressTarget = next;
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
}

export function setStageProgressState(value) {
	const next = Math.max(0, Math.min(1, value));
	stageProgress = next;
	stageProgressTarget = next;
	stageScrollIntent = null;
}

/**
 * @param {number} dt — секунды
 * @returns {boolean} нужна ли перерисовка
 */
export function tickStageProgress(dt) {
	const beforeProgress = stageProgress;
	const beforeTarget = stageProgressTarget;
	const factor = 1 - Math.exp(-STAGE_PROGRESS_SMOOTH * dt);
	const next = stageProgress + (stageProgressTarget - stageProgress) * factor;
	stageProgress = Math.abs(next - stageProgressTarget) <= STAGE_PROGRESS_COMMIT_EPS
		? stageProgressTarget
		: next;

	// Commit только при пересечении порога 1 (или overshoot target), не каждый кадр на pinned 1/1.
	const crossedCommitForward =
		beforeProgress < 1 - STAGE_PROGRESS_COMMIT_EPS &&
		stageProgress >= 1 - STAGE_PROGRESS_COMMIT_EPS;
	// Уже на 1, но target ещё >1 (догоняем overshoot) — один commit, не спам после clamp.
	const overshootNeedsCommit =
		stageProgressTarget > 1 + STAGE_PROGRESS_COMMIT_EPS &&
		stageProgress >= 1 - STAGE_PROGRESS_COMMIT_EPS &&
		beforeTarget > 1 + STAGE_PROGRESS_COMMIT_EPS;

	if (crossedCommitForward || overshootNeedsCommit) {
		const committed = stageCommitCallback?.("forward") === true;
		if (committed) {
			stageProgress = 0;
			stageProgressTarget = Math.max(0, stageProgressTarget - 1);
			return true;
		}
		stageProgress = 1;
		stageProgressTarget = Math.min(1, stageProgressTarget);
		stageScrollIntent = null;
	} else if (stageProgress > 1) {
		stageProgress = 1;
		stageProgressTarget = Math.min(1, stageProgressTarget);
	}

	if (
		stageScrollIntent === "backward" &&
		stageProgress <= 0 + STAGE_PROGRESS_COMMIT_EPS &&
		stageProgressTarget < 0
	) {
		const committed = stageCommitCallback?.("backward") === true;
		if (committed) {
			stageProgress = 1;
			stageProgressTarget = Math.min(1, Math.max(0, stageProgressTarget + 1));
			return true;
		}
		stageProgress = 0;
		stageProgressTarget = 0;
		stageScrollIntent = null;
	}

	return true;
}

/** Есть ли расхождение progress и target — нужен ли ещё rAF. */
export function isStageProgressAnimating() {
	return Math.abs(stageProgress - stageProgressTarget) > 0.0001;
}
