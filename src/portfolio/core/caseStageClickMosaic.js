/**
 * Click stage jumps: one mosaic at a time + logo_reveal scrub.
 *
 * If stage mix is mid-flight on click: smoothly (but quickly) finish it to the nearer
 * of 0 or 1, then start the click mosaic. No frame baking.
 *
 * Mid-mosaic clicks only update desiredIndex (no queue / no restart).
 * Final arc node (= last state) settles as penultimate @ stageProgress=1.
 */
import {
	promoteCasePanelHudCanvases,
	setCasePanelHudEnterTravelSign,
} from "./casePanelHudBridge.js";
import { wakeCaseStudyAnimationFrame } from "./caseStudyAnimationFrame.js";
import { CASE_PANEL_HUD_REVEAL_MS } from "./casePanelHudReveal.js";
import {
	forceStageProgress,
	getStageProgress,
	setStageProgressState,
	syncStageProgressTarget,
	tickStageProgress,
} from "./stageProgress.js";
import { store } from "@/store.jsx";
import {
	preloadCaseStudyTextTransitionSound,
	resetCaseStudyTextTransitionSound,
	updateCaseStudyTextTransitionSound,
} from "@/sounds/caseStudyTextTransitionSound.js";

/** Settled visual stage index (scrollable — never terminal lastIndex). */
let displayedIndex = null;
/** Latest click target (may be lastIndex for terminal content). */
let desiredIndex = null;
/** @type {null | {
 *   fromIndex: number,
 *   toIndex: number,
 *   progress: number,
 *   direction: 'forward' | 'backward',
 *   settling: boolean,
 *   terminal: boolean,
 * }} */
let session = null;
/** @type {null | { endpoint: 0 | 1, thenFrom: number, thenTo: number }} */
let preSettle = null;
/** @type {null | ((mosaicToIndex: number) => void)} */
let applyStateAtIndex = null;
let statesLength = 0;

let rafId = 0;
let lastFrameTs = 0;
/** @type {Set<() => void>} */
const prepareListeners = new Set();

/** Same pace as click mosaic: full 0↔1 takes CASE_PANEL_HUD_REVEAL_MS. */
const PRE_SETTLE_FULL_MS = CASE_PANEL_HUD_REVEAL_MS;

function clamp01(value) {
	return Math.max(0, Math.min(1, value));
}

function stopRaf() {
	if (rafId) {
		cancelAnimationFrame(rafId);
		rafId = 0;
	}
}

function notifyPrepare() {
	for (const listener of prepareListeners) {
		listener();
	}
}

function directionBetween(fromIndex, toIndex) {
	return toIndex >= fromIndex ? "forward" : "backward";
}

function lastIndexOfCase() {
	return Math.max(0, statesLength - 1);
}

function penultimateIndex() {
	return Math.max(0, lastIndexOfCase() - 1);
}

function isTerminalIndex(index) {
	const last = lastIndexOfCase();
	return last > 0 && index === last;
}

function settleIndexFor(mosaicIndex) {
	return isTerminalIndex(mosaicIndex) ? penultimateIndex() : mosaicIndex;
}

function readLiveStageProgress() {
	const fromModule = getStageProgress();
	if (Number.isFinite(fromModule)) {
		return fromModule;
	}
	return Number(store.portfolioExperience?.stageProgress) || 0;
}

function publishStageProgressToStore() {
	const progress = getStageProgress();
	store.portfolioExperience.stageProgress = progress;
	store.portfolioExperience.stageProgressTarget = progress;
}

function finishIdle() {
	session = null;
	preSettle = null;
	desiredIndex = null;
	setCasePanelHudEnterTravelSign(1);
	resetCaseStudyTextTransitionSound();
	wakeCaseStudyAnimationFrame();
}

function isAlreadyShowingTerminal() {
	const penultimate = penultimateIndex();
	const progress = readLiveStageProgress();
	return displayedIndex === penultimate && progress >= 0.99;
}

function onScreenMosaicFromIndex(fallbackIndex) {
	if (isAlreadyShowingTerminal()) {
		return lastIndexOfCase();
	}
	return fallbackIndex;
}

function nearerStageEndpoint(progress) {
	return progress >= 0.5 ? 1 : 0;
}

/**
 * Smoothly finish current stage mix to 0 or 1, then run `onDone`.
 * @param {0 | 1} endpoint
 * @param {() => void} onDone
 */
function runPreSettle(endpoint, onDone) {
	stopRaf();
	const start = clamp01(readLiveStageProgress());
	const end = endpoint;
	const distance = Math.abs(end - start);
	if (distance <= 0.001) {
		finishPreSettleAtEndpoint(end, onDone);
		return;
	}

	const durationMs = Math.max(1, PRE_SETTLE_FULL_MS * distance);
	syncStageProgressTarget(end);
	lastFrameTs = performance.now();
	const startedAt = lastFrameTs;

	const tick = (now) => {
		if (!preSettle) {
			return;
		}
		const t = clamp01((now - startedAt) / durationMs);
		const next = start + (end - start) * t;
		forceStageProgress(next);
		publishStageProgressToStore();
		wakeCaseStudyAnimationFrame();

		if (t < 1) {
			rafId = requestAnimationFrame(tick);
			return;
		}

		rafId = 0;
		finishPreSettleAtEndpoint(end, onDone);
	};

	rafId = requestAnimationFrame(tick);
}

function finishPreSettleAtEndpoint(endpoint, onDone) {
	// Clear preSettle first so tickStageProgress can run the boundary commit.
	const finished = preSettle;
	preSettle = null;

	if (endpoint >= 1) {
		forceStageProgress(0.999);
		syncStageProgressTarget(1.05);
		tickStageProgress(1 / 30);
		publishStageProgressToStore();
		const after = getStageProgress();
		// If commit was blocked (penultimate → last), pin visible end state.
		if (after > 0.5) {
			setStageProgressState(1);
		} else {
			setStageProgressState(clamp01(after));
		}
	} else {
		setStageProgressState(0);
	}
	publishStageProgressToStore();
	if (finished) {
		const storeIndex = store.portfolioExperience.activeStateIndex;
		if (Number.isInteger(storeIndex)) {
			displayedIndex = settleIndexFor(storeIndex);
		}
	}
	onDone?.();
}

function beginSegment(fromIndex, toIndex) {
	if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) {
		finishIdle();
		return;
	}

	const mosaicFrom = onScreenMosaicFromIndex(fromIndex);

	if (isTerminalIndex(toIndex) && isAlreadyShowingTerminal()) {
		displayedIndex = penultimateIndex();
		applyStateAtIndex?.(toIndex);
		finishIdle();
		return;
	}

	if (mosaicFrom === toIndex) {
		displayedIndex = settleIndexFor(toIndex);
		applyStateAtIndex?.(toIndex);
		finishIdle();
		notifyPrepare();
		return;
	}

	stopRaf();
	const direction = directionBetween(mosaicFrom, toIndex);
	session = {
		fromIndex: mosaicFrom,
		toIndex,
		progress: 0,
		direction,
		settling: false,
		terminal: isTerminalIndex(toIndex),
	};
	setCasePanelHudEnterTravelSign(direction === "forward" ? 1 : -1);
	void preloadCaseStudyTextTransitionSound();
	notifyPrepare();
	wakeCaseStudyAnimationFrame();

	lastFrameTs = performance.now();
	const startedAt = lastFrameTs;

	const tick = (now) => {
		if (!session || session.settling) {
			return;
		}
		const progress = clamp01((now - startedAt) / CASE_PANEL_HUD_REVEAL_MS);
		const delta = Math.max(0, (now - lastFrameTs) / 1000);
		lastFrameTs = now;
		session.progress = progress;
		updateCaseStudyTextTransitionSound(delta, progress);
		wakeCaseStudyAnimationFrame();

		if (progress < 1) {
			rafId = requestAnimationFrame(tick);
			return;
		}

		rafId = 0;
		completeSegment();
	};

	rafId = requestAnimationFrame(tick);
}

function completeSegment() {
	if (!session) {
		return;
	}

	const arrivedIndex = session.toIndex;
	const direction = session.direction;
	const terminal = session.terminal;
	session.settling = true;
	session.progress = 1;
	displayedIndex = settleIndexFor(arrivedIndex);

	applyStateAtIndex?.(arrivedIndex);

	if (terminal) {
		session = null;
		setCasePanelHudEnterTravelSign(1);
		wakeCaseStudyAnimationFrame();
	} else {
		promoteCasePanelHudCanvases(direction);
		session = null;
		setCasePanelHudEnterTravelSign(1);
		wakeCaseStudyAnimationFrame();
	}

	const want = desiredIndex;
	const settledMosaic = terminal ? lastIndexOfCase() : arrivedIndex;
	if (Number.isInteger(want) && want !== settledMosaic && want !== displayedIndex) {
		if (isTerminalIndex(want) && isAlreadyShowingTerminal()) {
			finishIdle();
			return;
		}
		resetCaseStudyTextTransitionSound();
		queueBeginFromCurrent(want);
		return;
	}

	finishIdle();
}

function queueBeginFromCurrent(toIndex) {
	const fromIndex = Number.isInteger(displayedIndex)
		? displayedIndex
		: settleIndexFor(store.portfolioExperience.activeStateIndex ?? 0);
	maybePreSettleThenBegin(fromIndex, toIndex);
}

function maybePreSettleThenBegin(fromIndex, toIndex) {
	const progress = clamp01(readLiveStageProgress());
	const midFlight = progress > 0.02 && progress < 0.98;

	if (!midFlight) {
		beginSegment(onScreenMosaicFromIndex(fromIndex), toIndex);
		return;
	}

	const endpoint = nearerStageEndpoint(progress);
	preSettle = { endpoint, thenFrom: fromIndex, thenTo: toIndex };
	runPreSettle(endpoint, () => {
		const liveFrom = Number.isInteger(displayedIndex)
			? displayedIndex
			: settleIndexFor(store.portfolioExperience.activeStateIndex ?? fromIndex);
		const liveTo = Number.isInteger(desiredIndex) ? desiredIndex : toIndex;
		beginSegment(onScreenMosaicFromIndex(liveFrom), liveTo);
	});
}

/** True while click mosaic rAF owns panel mix (not during pre-settle). */
export function isCaseStageClickMosaicSessionActive() {
	return Boolean(session) && !session.settling;
}

/** Blocks scroll sync / competing navigation (pre-settle + mosaic). */
export function isCaseStageClickMosaicActive() {
	return isCaseStageClickMosaicSessionActive() || Boolean(preSettle);
}

export function getCaseStageClickMosaicProgress() {
	if (!session || session.settling) {
		return null;
	}
	return session.progress;
}

export function getCaseStageClickMosaicFromIndex() {
	if (!session || session.settling) {
		return null;
	}
	return session.fromIndex;
}

export function getCaseStageClickMosaicTargetIndex() {
	if (!session || session.settling) {
		return null;
	}
	return session.toIndex;
}

/**
 * @param {number} index
 * @param {number} [count]
 */
export function syncCaseStageClickMosaicDisplayedIndex(index, count) {
	if (Number.isInteger(count)) {
		statesLength = Math.max(0, count);
	}
	if (!Number.isInteger(index)) {
		return;
	}
	if (session || preSettle) {
		return;
	}
	displayedIndex = settleIndexFor(index);
}

/**
 * @param {() => void} listener
 */
export function registerCaseStageClickMosaicPrepare(listener) {
	prepareListeners.add(listener);
	return () => prepareListeners.delete(listener);
}

export function cancelCaseStageClickMosaic() {
	stopRaf();
	session = null;
	preSettle = null;
	desiredIndex = null;
	applyStateAtIndex = null;
	setCasePanelHudEnterTravelSign(1);
	resetCaseStudyTextTransitionSound();
}

/**
 * @param {{
 *   toIndex: number,
 *   fromIndex?: number,
 *   statesCount: number,
 *   applyState: (mosaicToIndex: number) => void,
 * }} options
 */
export function requestCaseStageClickMosaic(options) {
	const toIndex = options.toIndex;
	const applyState = options.applyState;
	if (!Number.isInteger(toIndex) || typeof applyState !== "function") {
		return;
	}

	statesLength = Math.max(0, Math.floor(options.statesCount ?? statesLength));
	applyStateAtIndex = applyState;
	desiredIndex = toIndex;

	// Mosaic in flight: only retarget.
	if (session && !session.settling) {
		return;
	}

	// Pre-settle in flight: only retarget; finish current settle then mosaic to latest desired.
	if (preSettle) {
		preSettle.thenTo = toIndex;
		return;
	}

	let fromIndex = Number.isInteger(displayedIndex)
		? displayedIndex
		: (Number.isInteger(options.fromIndex) ? options.fromIndex : toIndex);
	fromIndex = settleIndexFor(fromIndex);

	if (isTerminalIndex(toIndex) && isAlreadyShowingTerminal()) {
		displayedIndex = penultimateIndex();
		applyState(toIndex);
		finishIdle();
		return;
	}

	maybePreSettleThenBegin(fromIndex, toIndex);
}
