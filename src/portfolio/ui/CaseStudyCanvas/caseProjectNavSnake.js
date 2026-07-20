import CanvasGlitchText from "@/shared/glitchText/canvasGlitchText.js";
import { CASE_STUDY_LEFT_SOUND_PAN } from "@/sounds/soundDesign.js";
import { store } from "@/store.jsx";
import { shouldAnimateSiteLocaleForCaseChrome } from "@/utils/siteLocaleSwitch.js";
import {
	clearCaseAllProjectsLineSnake,
	disposeCaseAllProjectsLineSnake,
	abortCaseAllProjectsLineSnake,
	playCaseAllProjectsLineSnake,
	registerCaseAllProjectsLineSnakeRepaint,
} from "./caseAllProjectsLineSnake.js";
import { caseStudyArcConfig } from "./caseStudyArcConfig.js";
import { resolveCaseStudyPanelHudPixelRatio } from "./caseStudyCanvasSurface.js";

/** @type {Map<string, { glitch: CanvasGlitchText, desiredText: string, switching: boolean, disposed: boolean }>} */
const layers = new Map();
/** @type {Map<string, number>} */
const switchTimers = new Map();
let repaint = null;
let repaintRaf = 0;

function scheduleRepaint() {
	if (!repaint || repaintRaf) {
		return;
	}

	repaintRaf = requestAnimationFrame(() => {
		repaintRaf = 0;
		repaint?.();
	});
}

/**
 * @param {string} id
 */
function clearSwitchTimer(id) {
	const timer = switchTimers.get(id);
	if (timer) {
		window.clearTimeout(timer);
		switchTimers.delete(id);
	}
}

/**
 * Instant copy swap when case chrome is not the current page.
 * @param {{ glitch: CanvasGlitchText, desiredText: string, switching: boolean, disposed: boolean }} layer
 * @param {'previous' | 'next'} id
 */
function applyDesiredTextInstant(layer, id) {
	clearSwitchTimer(id);
	layer.switching = false;
	layer.glitch.clearHoverPassed();
	layer.glitch.setText(layer.desiredText, true);
	scheduleRepaint();
}

/**
 * Case→case / locale: old name disappears with snake, then new name appears with snake.
 * @param {{ glitch: CanvasGlitchText, desiredText: string, switching: boolean, disposed: boolean }} layer
 * @param {'previous' | 'next'} id
 */
function runDesiredSwitch(layer, id) {
	if (layer.disposed || layer.switching || layer.glitch.options.text === layer.desiredText) {
		return;
	}

	if (!shouldAnimateSiteLocaleForCaseChrome()) {
		applyDesiredTextInstant(layer, id);
		return;
	}

	layer.switching = true;
	clearSwitchTimer(id);
	layer.glitch.clearHoverPassed();

	const disappearMs = Math.max(0, Number(layer.glitch.playDisappear()) || 0);

	const afterDisappear = () => {
		if (layer.disposed) {
			layer.switching = false;
			switchTimers.delete(id);
			return;
		}
		const nextText = layer.desiredText;
		// Hidden swap — setText() would paint a full-text frame before playAppear.
		layer.glitch.setTextForAppear(nextText, true);
		scheduleRepaint();
		const appearMs = Math.max(0, Number(layer.glitch.playAppear()) || 0);

		const afterAppear = () => {
			layer.switching = false;
			switchTimers.delete(id);
			if (!layer.disposed && layer.glitch.options.text !== layer.desiredText) {
				runDesiredSwitch(layer, id);
			}
		};

		if (appearMs <= 0) {
			afterAppear();
			return;
		}
		switchTimers.set(id, window.setTimeout(afterAppear, appearMs));
	};

	if (disappearMs <= 0) {
		afterDisappear();
		return;
	}
	switchTimers.set(id, window.setTimeout(afterDisappear, disappearMs));
}

/**
 * @param {'previous' | 'next'} id
 * @param {string} text
 * @param {{ fontSize: number, fontWeight: number | string, letterSpacing: number, fontFamily: string, color: string }} style
 */
function getLayer(id, text, style) {
	const pixelRatio = resolveCaseStudyPanelHudPixelRatio(store.graphicsTier);
	let layer = layers.get(id);
	if (!layer) {
		const glitch = new CanvasGlitchText({
			text,
			uppercase: true,
			fontSize: style.fontSize,
			fontWeight: style.fontWeight,
			letterSpacing: style.letterSpacing,
			fontFamily: style.fontFamily,
			color: style.color,
			pixelRatio,
			// Tight padding — less soft empty glow fringe when composited.
			paddingLeft: 6,
			paddingTop: 4,
			paddingRight: 6,
			paddingBottom: 4,
			drawProfile: "caseStudyNav",
			replacementGlowStrength: caseStudyArcConfig.snakeGlowStrength,
			replacementShadowBlur: caseStudyArcConfig.snakeGlowBlur,
			replacementHaloAlpha: caseStudyArcConfig.snakeGlowAlpha,
			passedLetterHighlightAlpha: caseStudyArcConfig.snakePassedLetterAlpha,
			onRedraw: scheduleRepaint,
		});
		layer = { glitch, desiredText: text, switching: false, disposed: false };
		layers.set(id, layer);
		return layer;
	}

	layer.glitch.setPixelRatio(pixelRatio);
	layer.desiredText = text;
	runDesiredSwitch(layer, id);
	return layer;
}

/**
 * Text currently driving layout (alignment). During disappear this is still the old
 * name; after setTextForAppear it becomes the new one — so previous right-align
 * does not jump mid-snake.
 * @param {'previous' | 'next'} id
 * @returns {string | null}
 */
export function getCaseProjectNavSnakeLayoutText(id) {
	const layer = layers.get(id);
	if (!layer || layer.disposed) {
		return null;
	}
	return String(layer.glitch.options.text ?? "");
}

/**
 * Draw previous/next project name with glitch-snake cache.
 * @param {CanvasRenderingContext2D} ctx
 * @param {'previous' | 'next'} id
 * @param {string} text
 * @param {number} x
 * @param {number} y
 * @param {{ fontSize: number, fontWeight: number | string, letterSpacing: number, fontFamily: string, color: string }} style
 */
export function drawCaseProjectNavSnakeLabel(ctx, id, text, x, y, style) {
	const layer = getLayer(id, text, style);
	const prevSmooth = ctx.imageSmoothingEnabled;
	ctx.imageSmoothingEnabled = false;
	layer.glitch.drawCachedAt(ctx, Math.round(x), Math.round(y), {
		fontSize: style.fontSize,
		fontWeight: style.fontWeight,
		letterSpacing: style.letterSpacing,
		fontFamily: style.fontFamily,
		color: style.color,
		replacementGlowStrength: caseStudyArcConfig.snakeGlowStrength,
		replacementShadowBlur: caseStudyArcConfig.snakeGlowBlur,
		replacementHaloAlpha: caseStudyArcConfig.snakeGlowAlpha,
		passedLetterHighlightAlpha: caseStudyArcConfig.snakePassedLetterAlpha,
	});
	ctx.imageSmoothingEnabled = prevSmooth;
}

/**
 * @param {'all' | 'previous' | 'next' | null | undefined} id
 */
export function playCaseProjectNavSnakeHover(id) {
	if (id === "all") {
		playCaseAllProjectsLineSnake();
		return;
	}
	if (id !== "previous" && id !== "next") {
		return;
	}
	const layer = layers.get(id);
	if (!layer || layer.disposed || layer.switching) {
		return;
	}
	layer.glitch.runHover({
		soundPan: CASE_STUDY_LEFT_SOUND_PAN,
		playSound: true,
		slowMotion: 1 / Math.max(0.1, caseStudyArcConfig.snakeHoverSpeed ?? 1),
	});
}

/**
 * @param {'all' | 'previous' | 'next' | null | undefined} id
 */
export function clearCaseProjectNavSnakeHover(id) {
	if (id === "all") {
		clearCaseAllProjectsLineSnake();
		return;
	}
	if (id !== "previous" && id !== "next") {
		return;
	}
	const layer = layers.get(id);
	if (!layer || layer.disposed) {
		return;
	}
	layer.glitch.clearHoverPassed();
}

/**
 * Abort in-flight hover snake and restore idle visible label (for leave / click).
 * @param {'all' | 'previous' | 'next' | null | undefined} id
 */
export function abortCaseProjectNavSnakeHover(id) {
	if (id === "all") {
		abortCaseAllProjectsLineSnake();
		return;
	}
	if (id !== "previous" && id !== "next") {
		return;
	}
	const layer = layers.get(id);
	if (!layer || layer.disposed) {
		return;
	}
	layer.glitch.restoreVisible();
}

/**
 * @param {() => void} callback
 */
export function registerCaseProjectNavSnakeRepaint(callback) {
	repaint = callback;
	const unregisterLine = registerCaseAllProjectsLineSnakeRepaint(callback);
	return () => {
		unregisterLine();
		if (repaint === callback) {
			repaint = null;
		}
	};
}

export function disposeCaseProjectNavSnake() {
	if (repaintRaf) {
		cancelAnimationFrame(repaintRaf);
		repaintRaf = 0;
	}
	for (const id of switchTimers.keys()) {
		clearSwitchTimer(id);
	}
	disposeCaseAllProjectsLineSnake();
	for (const layer of layers.values()) {
		layer.disposed = true;
		layer.glitch.dispose();
	}
	layers.clear();
}
