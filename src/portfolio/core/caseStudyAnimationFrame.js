import { tickArcGlowMotion, isArcGlowAnimating } from "@/portfolio/ui/CaseStudyCanvas/caseStudyArcGlowMotion.js";
import {
	tickInnerBloomPulse,
	isInnerBloomPulseActive,
} from "@/portfolio/ui/CaseStudyCanvas/caseStudyArcNodeHighlight.js";
import {
	tickArcNavLabelColors,
	isArcNavLabelColorsAnimating,
} from "@/portfolio/ui/CaseStudyCanvas/caseStudyArcNavLabelMotion.js";
import {
	isCaseStudyArcShiftAnimating,
	tickCaseStudyArcShift,
} from "@/portfolio/ui/CaseStudyCanvas/caseStudyArcPositionMotion.js";
import { store } from "@/store.jsx";
import {
	tickStageProgress,
	isStageProgressAnimating,
	getStageProgress,
} from "./stageProgress.js";

/** @type {(() => void) | null} */
let arcPaintCallback = null;

/** @type {(() => void) | null} */
let panelScrollPaintCallback = null;

/** @type {(() => void) | null} */
let stageProgressCallback = null;

let rafId = 0;
let running = false;
let lastTime = 0;
/** Последний scrollProgress, отрисованный на canvas. */
let lastPaintedScroll = 0;
/** Последний stageProgress, отрисованный на левой панели. */
let lastPaintedStageProgress = 0;

const SCROLL_PAINT_EPSILON = 0.00001;
const STAGE_PAINT_EPSILON = 0.00001;

/**
 * @param {(() => void) | null} fn — только дуга (bloom, скролл, анимации).
 */
export function registerCaseStudyArcPaint(fn) {
	arcPaintCallback = fn;
	if (fn && typeof window !== "undefined") {
		lastPaintedScroll = store.scroll;
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
}

/**
 * @param {(() => void) | null} fn
 */
export function registerCaseStudyStageProgress(fn) {
	stageProgressCallback = fn;
}

export function stopCaseStudyAnimationFrame() {
	running = false;
	if (rafId) {
		cancelAnimationFrame(rafId);
		rafId = 0;
	}
}

function hasScrollChangedSincePaint() {
	return Math.abs(store.scroll - lastPaintedScroll) > SCROLL_PAINT_EPSILON;
}

function hasStageProgressChangedSincePaint() {
	return Math.abs(getStageProgress() - lastPaintedStageProgress) > STAGE_PAINT_EPSILON;
}

function shouldContinueAnimationFrame() {
	return (
		hasScrollChangedSincePaint() ||
		isStageProgressAnimating() ||
		isArcGlowAnimating() ||
		isInnerBloomPulseActive() ||
		isArcNavLabelColorsAnimating() ||
		isCaseStudyArcShiftAnimating()
	);
}

function startAnimationLoop() {
	if (typeof window === "undefined" || !arcPaintCallback) {
		return;
	}

	if (running) {
		return;
	}

	running = true;
	lastTime = performance.now();
	rafId = requestAnimationFrame(frame);
}

function frame(now) {
	if (!running) {
		return;
	}

	const dt = Math.min(0.05, (now - lastTime) / 1000);
	lastTime = now;

	if (tickStageProgress(dt)) {
		stageProgressCallback?.(dt);
	}

	const glowMoving = tickArcGlowMotion(dt);
	const bloomPulsing = tickInnerBloomPulse(dt);
	const labelsAnimating = tickArcNavLabelColors(dt);
	const arcPositionMoving = tickCaseStudyArcShift(dt);
	const scrollChanged = hasScrollChangedSincePaint();
	const stageProgressChanged = hasStageProgressChangedSincePaint();
	const arcNeedsPaint = glowMoving || bloomPulsing || labelsAnimating || arcPositionMoving || scrollChanged;

	if (arcNeedsPaint) {
		arcPaintCallback?.();
	}

	if (scrollChanged || stageProgressChanged) {
		panelScrollPaintCallback?.();
	}

	if (arcNeedsPaint || scrollChanged || stageProgressChanged) {
		lastPaintedScroll = store.scroll;
		lastPaintedStageProgress = getStageProgress();
	}

	if (shouldContinueAnimationFrame()) {
		rafId = requestAnimationFrame(frame);
	} else {
		running = false;
		rafId = 0;
	}
}

/** Скролл кейса изменился — один paint в общем rAF (без React). */
export function requestCaseStudyScrollRepaint() {
	startAnimationLoop();
}

/** Запускает общий rAF, если ещё не крутится. */
export function wakeCaseStudyAnimationFrame() {
	if (!shouldContinueAnimationFrame()) {
		return;
	}

	startAnimationLoop();
}
