import CanvasGlitchText from "@/shared/glitchText/canvasGlitchText.js";
import { CASE_STUDY_RIGHT_SOUND_PAN } from "@/sounds/soundDesign.js";
import { caseStudyArcConfig } from "./caseStudyArcConfig.js";

const layers = new Map();
let repaint = null;
let repaintRaf = 0;
/** New layers start hidden until playCaseStudyArcNavSnakeAppear. */
let pendingAppear = false;

function scheduleRepaint() {
	if (!repaint || repaintRaf) {
		return;
	}

	repaintRaf = requestAnimationFrame(() => {
		repaintRaf = 0;
		repaint?.();
	});
}

function runDesiredSwitch(layer) {
	if (layer.disposed || layer.switching || layer.glitch.options.text === layer.desiredText) {
		return;
	}

	layer.switching = true;
	layer.glitch.switchLocaleWithSnake(layer.desiredText, {
		uppercase: true,
		playSound: false,
	}).catch(() => {
		layer.glitch.setText(layer.desiredText, true);
	}).finally(() => {
		layer.switching = false;
		if (!layer.disposed && layer.glitch.options.text !== layer.desiredText) {
			runDesiredSwitch(layer);
		}
	});
}

function getLayer(id, text, style) {
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
			drawProfile: "caseStudyNav",
			replacementGlowStrength: caseStudyArcConfig.snakeGlowStrength,
			replacementShadowBlur: caseStudyArcConfig.snakeGlowBlur,
			replacementHaloAlpha: caseStudyArcConfig.snakeGlowAlpha,
			passedLetterHighlightAlpha: caseStudyArcConfig.snakePassedLetterAlpha,
			initialHidden: pendingAppear,
			onRedraw: scheduleRepaint,
		});
		layer = { glitch, desiredText: text, switching: false, disposed: false };
		layers.set(id, layer);
		return layer;
	}

	layer.desiredText = text;
	runDesiredSwitch(layer);
	return layer;
}

export function drawCaseStudyArcNavSnakeLabel(ctx, id, text, x, y, style) {
	const layer = getLayer(id, text, style);
	layer.glitch.drawCachedAt(ctx, x, y, {
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
}

export function syncCaseStudyArcNavSnakeLines(stateId, lineCount) {
	const prefix = `${stateId}::`;
	for (const [id, layer] of layers) {
		if (!id.startsWith(prefix)) {
			continue;
		}
		const lineIndex = Number(id.slice(prefix.length));
		if (Number.isFinite(lineIndex) && lineIndex < lineCount) {
			continue;
		}
		layer.disposed = true;
		layer.glitch.dispose();
		layers.delete(id);
	}
}

function getStateLayers(stateId) {
	const prefix = `${stateId}::`;
	return [...layers.entries()]
		.filter(([id, layer]) => !layer.disposed && (id === stateId || id.startsWith(prefix)))
		.map(([, layer]) => layer);
}

export function playCaseStudyArcNavSnakeHover(id) {
	const slowMotion = 1 / Math.max(0.1, caseStudyArcConfig.snakeHoverSpeed ?? 1);
	getStateLayers(id).forEach((layer, index) => {
		if (!layer.switching) {
			layer.glitch.runHover({
				soundPan: CASE_STUDY_RIGHT_SOUND_PAN,
				playSound: index === 0,
				slowMotion,
			});
		}
	});
}

export function clearCaseStudyArcNavSnakeHover(id) {
	getStateLayers(id).forEach((layer) => layer.glitch.clearHoverPassed());
}

/** Hide all arc titles for a later snake appear (no flash of full text). */
export function armCaseStudyArcNavSnakeAppear() {
	pendingAppear = true;
	for (const layer of layers.values()) {
		if (!layer.disposed) {
			layer.glitch.prepareAppear();
		}
	}
	scheduleRepaint();
}

/**
 * Snake-in all arc chapter titles.
 * @param {number} [timeBudgetMs]
 * @returns {Promise<void>}
 */
export function playCaseStudyArcNavSnakeAppear(timeBudgetMs) {
	pendingAppear = false;
	let maxMs = 0;
	for (const layer of layers.values()) {
		if (layer.disposed) {
			continue;
		}
		const durationMs = Number(layer.glitch.playAppear(timeBudgetMs)) || 0;
		maxMs = Math.max(maxMs, durationMs);
	}
	scheduleRepaint();
	if (maxMs <= 0) {
		return Promise.resolve();
	}
	return new Promise((resolve) => {
		window.setTimeout(resolve, maxMs);
	});
}

/**
 * Snake-out all arc chapter titles (leave case / hex start).
 * @param {number} [timeBudgetMs]
 * @returns {Promise<void>}
 */
export function playCaseStudyArcNavSnakeDisappear(timeBudgetMs) {
	pendingAppear = false;
	let maxMs = 0;
	for (const layer of layers.values()) {
		if (layer.disposed) {
			continue;
		}
		const durationMs = Number(layer.glitch.playDisappear(timeBudgetMs)) || 0;
		maxMs = Math.max(maxMs, durationMs);
	}
	scheduleRepaint();
	if (maxMs <= 0) {
		return Promise.resolve();
	}
	return new Promise((resolve) => {
		window.setTimeout(resolve, maxMs);
	});
}

/** Cancel disappear / show titles again (interrupted hex reverse). */
export function restoreCaseStudyArcNavSnakeVisible() {
	pendingAppear = false;
	for (const layer of layers.values()) {
		if (!layer.disposed) {
			layer.glitch.restoreVisible();
		}
	}
	scheduleRepaint();
}

export function previewCaseStudyArcNavSnakeGlow() {
	const layer = [...layers.values()].find((candidate) => !candidate.disposed && !candidate.switching);
	if (!layer) {
		return;
	}
	layer.glitch.engine.abort();
	layer.glitch.runHover({
		soundPan: CASE_STUDY_RIGHT_SOUND_PAN,
		slowMotion: 1 / Math.max(0.1, caseStudyArcConfig.snakeHoverSpeed ?? 1),
	});
}

export function registerCaseStudyArcNavSnakeRepaint(callback) {
	repaint = callback;
	return () => {
		if (repaint === callback) {
			repaint = null;
		}
	};
}

export function disposeCaseStudyArcNavSnake() {
	if (repaintRaf) {
		cancelAnimationFrame(repaintRaf);
		repaintRaf = 0;
	}
	pendingAppear = false;
	for (const layer of layers.values()) {
		layer.disposed = true;
		layer.glitch.dispose();
	}
	layers.clear();
}
