import { tickArcGlowMotion, isArcGlowAnimating } from "@/portfolio/ui/CaseStudyCanvas/caseStudyArcGlowMotion.js";
import {
	tickArcNavLabelColors,
	isArcNavLabelColorsAnimating,
} from "@/portfolio/ui/CaseStudyCanvas/caseStudyArcNavLabelMotion.js";
import {
	isCaseStudyArcShiftAnimating,
	tickCaseStudyArcShift,
} from "@/portfolio/ui/CaseStudyCanvas/caseStudyArcPositionMotion.js";
import {
	isCaseStudyArcFocusAnimating,
	tickCaseStudyArcFocus,
} from "@/portfolio/ui/CaseStudyCanvas/caseStudyArcFocusMotion.js";
import {
	isCaseStudyArcSelectSequencing,
} from "@/portfolio/ui/CaseStudyCanvas/caseStudyArcSelectSequence.js";
import {
	isArcLabelHoverAnimating,
	tickArcLabelHover,
} from "@/portfolio/ui/CaseStudyCanvas/caseStudyArcLabelHover.js";
import { store } from "@/store.jsx";
import {
	tickStageProgress,
	isStageProgressAnimating,
	getStageProgress,
} from "./stageProgress.js";
import { isCaseStageClickMosaicActive } from "./caseStageClickMosaic.js";
import {
	getCaseStudyStageRailMotionToken,
	isCaseStudyStageRailHeaderLinkAnimating,
	tickCaseStudyStageRailHeaderLink,
} from "@/portfolio/ui/CaseStudyCanvas/caseStudyStageRail.js";
import { cancelSharedAnimationFrame, requestSharedAnimationFrame } from "@/utils/sharedAnimationFrame.js";

/** @type {(() => void) | null} */
let arcPaintCallback = null;

/** @type {(() => void) | null} */
let panelScrollPaintCallback = null;

/**
 * HTML left-panel mosaic only (Canvas2D redraw each stage frame).
 * WebGL mosaic uses shader mixProgress — do not register this there.
 * @type {(() => void) | null}
 */
let panelStagePaintCallback = null;

/**
 * Chrome stage rail only — follows stageProgress / click mosaic.
 * Never touches left from/to text textures.
 * @type {(() => void) | null}
 */
let chromeStagePaintCallback = null;

/** @type {((dt: number) => void) | null} */
let stageProgressCallback = null;

let rafId = 0;
let running = false;
let lastTickTime = 0;
let nextPanelPaintAt = 0;
let nextPanelStagePaintAt = 0;
let nextChromeStagePaintAt = 0;
let nextArcPaintAt = 0;
let panelPaintPending = false;
let panelStagePaintPending = false;
let chromeStagePaintPending = false;
let arcPaintPending = false;
/** Последний scrollProgress, отрисованный на canvas. */
let lastPanelPaintedScroll = 0;
let lastArcPaintedScroll = 0;
/** Последний stageProgress, отрисованный HTML mosaic. */
let lastPaintedStageProgress = 0;
/** Последний motion-token chrome rail. */
let lastChromeStageMotionToken = "";

const SCROLL_PAINT_EPSILON = 0.00001;
/** Arc glow only needs coarse scroll steps — avoids full Canvas2D redraw on every lerp tick. */
const ARC_SCROLL_PAINT_EPSILON = 0.004;
const STAGE_PAINT_EPSILON = 0.00001;
/** SYS / scroll-driven panel content — not mosaic (mosaic is GPU or panelStagePaint). */
const PANEL_FRAME_INTERVAL_MS = 1000 / 20;
/** HTML Canvas2D stage mosaic — throttle (~24 FPS) instead of every rAF. */
const PANEL_STAGE_FRAME_INTERVAL_MS = 1000 / 24;
/** Stage rail chrome — smooth follow of stageProgress. */
const CHROME_STAGE_FRAME_INTERVAL_MS = 1000 / 60;
const ARC_FRAME_INTERVAL_MS = 1000 / 60;

/**
 * @param {(() => void) | null} fn — только дуга (bloom, скролл, анимации).
 */
export function registerCaseStudyArcPaint(fn) {
	arcPaintCallback = fn;
	if (fn && typeof window !== "undefined") {
		lastArcPaintedScroll = store.scroll;
	} else if (
		!fn
		&& !panelScrollPaintCallback
		&& !panelStagePaintCallback
		&& !chromeStagePaintCallback
		&& !stageProgressCallback
	) {
		stopCaseStudyAnimationFrame();
	}
}

/** @deprecated Используй registerCaseStudyArcPaint */
export function registerCaseStudyPaint(fn) {
	registerCaseStudyArcPaint(fn);
}

/**
 * @param {(() => void) | null} fn — левая панель при изменении scroll (SYS-полоска).
 */
export function registerCaseStudyPanelScrollPaint(fn) {
	panelScrollPaintCallback = fn;
	if (fn && typeof window !== "undefined") {
		lastPanelPaintedScroll = store.scroll;
	} else if (
		!fn
		&& !arcPaintCallback
		&& !panelStagePaintCallback
		&& !chromeStagePaintCallback
		&& !stageProgressCallback
	) {
		stopCaseStudyAnimationFrame();
	}
}

/**
 * @param {(() => void) | null} fn — HTML mosaic mix по stageProgress (не для WebGL HUD).
 */
export function registerCaseStudyPanelStagePaint(fn) {
	panelStagePaintCallback = fn;
	if (fn && typeof window !== "undefined") {
		lastPaintedStageProgress = getStageProgress();
	} else if (
		!fn
		&& !arcPaintCallback
		&& !panelScrollPaintCallback
		&& !chromeStagePaintCallback
		&& !stageProgressCallback
	) {
		stopCaseStudyAnimationFrame();
	}
}

/**
 * @param {((dt: number) => void) | null} fn
 */
export function registerCaseStudyStageProgress(fn) {
	stageProgressCallback = fn;
	if (
		!fn
		&& !arcPaintCallback
		&& !panelScrollPaintCallback
		&& !panelStagePaintCallback
		&& !chromeStagePaintCallback
	) {
		stopCaseStudyAnimationFrame();
	}
}

/**
 * Chrome stage-rail paint driven by stageProgress (WebGL left HUD path).
 * @param {(() => void) | null} fn
 */
export function registerCaseStudyChromeStagePaint(fn) {
	chromeStagePaintCallback = fn;
	if (fn && typeof window !== "undefined") {
		lastChromeStageMotionToken = getCaseStudyStageRailMotionToken();
	} else if (
		!fn
		&& !arcPaintCallback
		&& !panelScrollPaintCallback
		&& !panelStagePaintCallback
		&& !stageProgressCallback
	) {
		stopCaseStudyAnimationFrame();
	}
}

export function stopCaseStudyAnimationFrame() {
	running = false;
	panelPaintPending = false;
	panelStagePaintPending = false;
	chromeStagePaintPending = false;
	arcPaintPending = false;
	nextPanelPaintAt = 0;
	nextPanelStagePaintAt = 0;
	nextChromeStagePaintAt = 0;
	nextArcPaintAt = 0;
	if (rafId) {
		cancelSharedAnimationFrame(rafId);
		rafId = 0;
	}
}

function hasPanelScrollChangedSincePaint() {
	return Math.abs(store.scroll - lastPanelPaintedScroll) > SCROLL_PAINT_EPSILON;
}

function hasArcScrollChangedSincePaint() {
	return Math.abs(store.scroll - lastArcPaintedScroll) > ARC_SCROLL_PAINT_EPSILON;
}

function hasStageProgressChangedSincePaint() {
	return Math.abs(getStageProgress() - lastPaintedStageProgress) > STAGE_PAINT_EPSILON;
}

function hasChromeStageMotionChangedSincePaint() {
	return getCaseStudyStageRailMotionToken() !== lastChromeStageMotionToken;
}

function isCasePageActive() {
	return Boolean(store.openedCase);
}

function shouldContinueAnimationFrame() {
	if (!isCasePageActive()) {
		return false;
	}

	const hasCasePainters = Boolean(
		arcPaintCallback
		|| panelScrollPaintCallback
		|| panelStagePaintCallback
		|| chromeStagePaintCallback
		|| stageProgressCallback,
	);
	const arcMotion =
		isArcGlowAnimating()
		|| isArcNavLabelColorsAnimating()
		|| isCaseStudyArcShiftAnimating()
		|| isCaseStudyArcFocusAnimating()
		|| isCaseStudyArcSelectSequencing()
		|| isArcLabelHoverAnimating();
	const chromeRailMotion =
		Boolean(chromeStagePaintCallback)
		&& (
			isStageProgressAnimating()
			|| isCaseStageClickMosaicActive()
			|| isCaseStudyStageRailHeaderLinkAnimating()
		);

	if (!hasCasePainters && !arcMotion) {
		return false;
	}

	return (
		panelPaintPending ||
		panelStagePaintPending ||
		chromeStagePaintPending ||
		arcPaintPending ||
		(Boolean(panelScrollPaintCallback) && hasPanelScrollChangedSincePaint()) ||
		(Boolean(arcPaintCallback) && hasArcScrollChangedSincePaint()) ||
		(Boolean(panelStagePaintCallback) && hasStageProgressChangedSincePaint()) ||
		(Boolean(chromeStagePaintCallback) && hasChromeStageMotionChangedSincePaint()) ||
		(Boolean(stageProgressCallback) && isStageProgressAnimating()) ||
		chromeRailMotion ||
		arcMotion
	);
}

function startAnimationLoop() {
	if (typeof window === "undefined" || !isCasePageActive()) {
		return;
	}
	if (
		!arcPaintCallback
		&& !panelScrollPaintCallback
		&& !panelStagePaintCallback
		&& !chromeStagePaintCallback
		&& !stageProgressCallback
		&& !isArcGlowAnimating()
		&& !isCaseStudyArcFocusAnimating()
		&& !isCaseStudyArcSelectSequencing()
		&& !isCaseStageClickMosaicActive()
	) {
		return;
	}

	if (running) {
		return;
	}

	running = true;
	lastTickTime = performance.now();
	nextPanelPaintAt = 0;
	nextPanelStagePaintAt = 0;
	nextChromeStagePaintAt = 0;
	nextArcPaintAt = 0;
	rafId = requestSharedAnimationFrame(frame);
}

function resolveNextPaintDeadline(now, previousDeadline, interval) {
	if (previousDeadline <= 0) {
		return now + interval;
	}
	const next = previousDeadline + interval;
	return next <= now ? now + interval : next;
}

function frame(now) {
	if (!running) {
		return;
	}

	if (!isCasePageActive()) {
		running = false;
		rafId = 0;
		panelPaintPending = false;
		panelStagePaintPending = false;
		chromeStagePaintPending = false;
		arcPaintPending = false;
		return;
	}

	const dt = Math.min(0.05, (now - lastTickTime) / 1000);
	lastTickTime = now;

	const stageAnimating = isStageProgressAnimating();
	if (stageAnimating && tickStageProgress(dt)) {
		stageProgressCallback?.(dt);
	}

	const headerLinkMoving = tickCaseStudyStageRailHeaderLink(dt);

	const glowMoving = tickArcGlowMotion(dt);
	const labelsAnimating = tickArcNavLabelColors(dt);
	const arcPositionMoving = tickCaseStudyArcShift(dt);
	const arcFocusMoving = tickCaseStudyArcFocus(dt);
	const labelHoverMoving = tickArcLabelHover(dt);
	const panelScrollChanged = hasPanelScrollChangedSincePaint();
	const arcScrollChanged = hasArcScrollChangedSincePaint();
	const stageProgressChanged = hasStageProgressChangedSincePaint();
	const chromeStageChanged = hasChromeStageMotionChangedSincePaint();
	arcPaintPending ||= (
		glowMoving
		|| labelsAnimating
		|| arcPositionMoving
		|| arcFocusMoving
		|| labelHoverMoving
		|| isCaseStudyArcSelectSequencing()
		|| arcScrollChanged
	);
	// Scroll/SYS only when a panel scroll painter is registered (HTML left panel).
	panelPaintPending ||= panelScrollChanged && Boolean(panelScrollPaintCallback);
	panelStagePaintPending ||= Boolean(panelStagePaintCallback) && stageProgressChanged;
	chromeStagePaintPending ||= Boolean(chromeStagePaintCallback)
		&& (chromeStageChanged || headerLinkMoving);
	// Header-link draw/erase must paint every rAF — don't wait on the chrome deadline.
	if (headerLinkMoving && chromeStagePaintCallback) {
		chromeStagePaintPending = true;
		nextChromeStagePaintAt = 0;
	}

	if (arcPaintPending && (nextArcPaintAt <= 0 || now >= nextArcPaintAt)) {
		arcPaintCallback?.();
		arcPaintPending = false;
		lastArcPaintedScroll = store.scroll;
		// Cap at ARC_FRAME_INTERVAL_MS even during glow/spin — uncapped rAF was the CPU spike.
		nextArcPaintAt = resolveNextPaintDeadline(now, nextArcPaintAt, ARC_FRAME_INTERVAL_MS);
	}

	if (panelPaintPending && (nextPanelPaintAt <= 0 || now >= nextPanelPaintAt)) {
		panelScrollPaintCallback?.();
		panelPaintPending = false;
		lastPanelPaintedScroll = store.scroll;
		nextPanelPaintAt = resolveNextPaintDeadline(now, nextPanelPaintAt, PANEL_FRAME_INTERVAL_MS);
	}

	if (panelStagePaintPending && (nextPanelStagePaintAt <= 0 || now >= nextPanelStagePaintAt)) {
		panelStagePaintCallback?.();
		panelStagePaintPending = false;
		lastPaintedStageProgress = getStageProgress();
		nextPanelStagePaintAt = resolveNextPaintDeadline(
			now,
			nextPanelStagePaintAt,
			PANEL_STAGE_FRAME_INTERVAL_MS,
		);
	}

	if (chromeStagePaintPending && (nextChromeStagePaintAt <= 0 || now >= nextChromeStagePaintAt)) {
		chromeStagePaintCallback?.();
		chromeStagePaintPending = false;
		lastChromeStageMotionToken = getCaseStudyStageRailMotionToken();
		nextChromeStagePaintAt = resolveNextPaintDeadline(
			now,
			nextChromeStagePaintAt,
			CHROME_STAGE_FRAME_INTERVAL_MS,
		);
	}

	if (shouldContinueAnimationFrame()) {
		rafId = requestSharedAnimationFrame(frame);
	} else {
		running = false;
		rafId = 0;
	}
}

/** Скролл кейса изменился — один paint в общем rAF (без React). */
export function requestCaseStudyScrollRepaint() {
	startAnimationLoop();
}

/** Явно пометить дугу грязной (hover / state), минуя coarse scroll epsilon. */
export function markCaseStudyArcDirty() {
	arcPaintPending = true;
	lastArcPaintedScroll = Number.NaN;
	nextArcPaintAt = 0;
	startAnimationLoop();
}

/**
 * Sync DomNav labels immediately (orbit enter/exit).
 * Bypasses the case rAF gate — HUD exit sets openedCase=false and stops the loop,
 * but WebGL still reads introRotationDeg every frame; labels must follow.
 */
export function flushCaseStudyArcPaint() {
	if (!arcPaintCallback) {
		return;
	}
	arcPaintCallback();
	arcPaintPending = false;
	lastArcPaintedScroll = store.scroll;
}

/** Явно перерисовать chrome stage-rail (dev tune / layout). */
export function markCaseStudyChromeStageDirty() {
	chromeStagePaintPending = true;
	lastChromeStageMotionToken = "";
	nextChromeStagePaintAt = 0;
	startAnimationLoop();
}

/** Запускает общий rAF, если ещё не крутится. */
export function wakeCaseStudyAnimationFrame() {
	if (!shouldContinueAnimationFrame()) {
		return;
	}

	startAnimationLoop();
}
