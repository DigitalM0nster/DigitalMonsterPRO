import CanvasGlitchText from "@/shared/glitchText/canvasGlitchText.js";
import { CASE_STUDY_RIGHT_SOUND_PAN } from "@/sounds/soundDesign.js";
import { caseStudyArcConfig } from "./caseStudyArcConfig.js";

const layers = new Map();
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
			drawProfile: "hero",
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
	getStateLayers(id).forEach((layer, index) => {
		if (!layer.switching) {
			layer.glitch.runHover({
				soundPan: CASE_STUDY_RIGHT_SOUND_PAN,
				playSound: index === 0,
			});
		}
	});
}

export function clearCaseStudyArcNavSnakeHover(id) {
	getStateLayers(id).forEach((layer) => layer.glitch.clearHoverPassed());
}

export function previewCaseStudyArcNavSnakeGlow() {
	const layer = [...layers.values()].find((candidate) => !candidate.disposed && !candidate.switching);
	if (!layer) {
		return;
	}
	layer.glitch.engine.abort();
	layer.glitch.runHover({ soundPan: CASE_STUDY_RIGHT_SOUND_PAN });
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
	for (const layer of layers.values()) {
		layer.disposed = true;
		layer.glitch.dispose();
	}
	layers.clear();
}
