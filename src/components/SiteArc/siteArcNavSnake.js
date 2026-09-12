import CanvasGlitchText from "@/components/GlitchText/canvasGlitchText.js";
import { measureCanvasGlitchTextSize } from "@/components/GlitchText/drawGlitchText.js";
import { CASE_STUDY_RIGHT_SOUND_PAN, playGlitchTextSound } from "@/sounds/soundDesign.js";
import { store } from "@/app/store.jsx";
import { shouldAnimateSiteLocaleForCaseChrome } from "@/functions/siteLocaleSwitch.js";
import {
	SITE_ARC_DISPLAY_FONT,
	resolveSiteArcCanvasPixelRatio,
	siteArcConfig,
} from "./siteArcConfig.js";

/**
 * Hover + locale snake for right-arc project labels (DomNav canvases).
 * Same CanvasGlitchText + GlitchSnakeEngine as left case nav (drawProfile "caseStudyNav").
 * Locale / title change: disappear snake → setTextForAppear → appear snake.
 */

/** @type {Map<string, { glitch: CanvasGlitchText, desiredText: string, switching: boolean, disposed: boolean }>} */
const layers = new Map();
/** Last bitmap copied to each mounted DOM canvas (slots can be reused for another label). */
const paintedCanvases = new WeakMap();
/** @type {Map<string, number>} */
const switchTimers = new Map();
/** @type {(() => void) | null} */
let repaint = null;
let repaintRaf = 0;

// Draw/measure styles contain primitive values. Compare them without creating
// two serialized strings for every unchanged label on every arc update.
function equalStyleValues(previous, next) {
	if (!previous) return false;
	for (const key in next) {
		if (previous[key] !== next[key]) return false;
	}
	for (const key in previous) {
		if (!(key in next)) return false;
	}
	return true;
}

function invalidateFontMetrics() {
	for (const layer of layers.values()) {
		layer.measureKey = null;
		layer.drawKey = null;
	}
	scheduleRepaint();
}

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
 * Instant copy swap (off-case warm prepare — no disappear/appear snake).
 * @param {{ glitch: CanvasGlitchText, desiredText: string, switching: boolean, disposed: boolean }} layer
 * @param {string} id
 */
function applyDesiredTextInstant(layer, id) {
	clearSwitchTimer(id);
	layer.switching = false;
	layer.glitch.clearHoverPassed();
	layer.glitch.setText(layer.desiredText, layer.glitch.options.uppercase === true);
	scheduleRepaint();
}

/**
 * Locale / title swap: old label disappears with snake, then new appears with snake.
 * @param {{ glitch: CanvasGlitchText, desiredText: string, switching: boolean, disposed: boolean }} layer
 * @param {string} id
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
		layer.glitch.setTextForAppear(nextText, layer.glitch.options.uppercase === true);
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
 * @param {string} id
 * @param {string} text
 * @param {{ fontSize: number, fontWeight?: number | string, letterSpacing?: number, fontFamily?: string, color: string, uppercase?: boolean }} style
 */
function getLayer(id, text, style) {
	const pixelRatio = resolveSiteArcCanvasPixelRatio(store.graphicsTier);
	const fontFamily = style.fontFamily ?? SITE_ARC_DISPLAY_FONT;
	const fontWeight = style.fontWeight ?? 600;
	const letterSpacing = style.letterSpacing ?? 0;
	const uppercase = style.uppercase === true;
	let layer = layers.get(id);
	if (!layer) {
		const glitch = new CanvasGlitchText({
			text,
			uppercase,
			fontSize: style.fontSize,
			fontWeight,
			letterSpacing,
			fontFamily,
			color: style.color,
			pixelRatio,
			// Room for canvas text-shadow glow (DomNav is outside site bloom).
			paddingLeft: 10,
			paddingTop: 6,
			paddingRight: 10,
			paddingBottom: 6,
			// Same as left case nav — canvas glow; "hud" zeros glow (shader bloom only).
			drawProfile: "caseStudyNav",
			replacementGlowStrength: siteArcConfig.snakeGlowStrength,
			replacementShadowBlur: siteArcConfig.snakeGlowBlur,
			replacementHaloAlpha: siteArcConfig.snakeGlowAlpha,
			passedLetterHighlightAlpha: siteArcConfig.snakePassedLetterAlpha,
			onRedraw: () => {
				if (!layer || layer.disposed) return;
				layer.revision += 1;
				// A synchronous paint requested by syncDom is already being presented.
				// Scheduling syncDom here would keep unchanged labels repainting forever.
				if (!layer.painting) scheduleRepaint();
			},
		});
		layer = { glitch, desiredText: text, switching: false, disposed: false, revision: 0, painting: false };
		layers.set(id, layer);
		return layer;
	}

	layer.glitch.setPixelRatio(pixelRatio);
	layer.desiredText = text;
	layer.glitch.options.uppercase = uppercase;
	layer.glitch.options.drawProfile = "caseStudyNav";
	layer.glitch.options.replacementGlowStrength = siteArcConfig.snakeGlowStrength;
	layer.glitch.options.replacementShadowBlur = siteArcConfig.snakeGlowBlur;
	layer.glitch.options.replacementHaloAlpha = siteArcConfig.snakeGlowAlpha;
	layer.glitch.options.passedLetterHighlightAlpha = siteArcConfig.snakePassedLetterAlpha;
	layer.glitch.options.paddingLeft = 10;
	layer.glitch.options.paddingTop = 6;
	layer.glitch.options.paddingRight = 10;
	layer.glitch.options.paddingBottom = 6;
	runDesiredSwitch(layer, id);
	return layer;
}

/**
 * Paint a DomNav <canvas> from the snake layer cache.
 * @param {HTMLCanvasElement | null | undefined} canvas
 * @param {string} id
 * @param {string} text
 * @param {{ fontSize: number, fontWeight?: number | string, letterSpacing?: number, fontFamily?: string, color: string, uppercase?: boolean }} style
 */
export function paintSiteArcNavSnakeDomLabel(canvas, id, text, style) {
	if (!canvas || !text) {
		if (canvas) {
			if (canvas.width !== 1) canvas.width = 1;
			if (canvas.height !== 1) canvas.height = 1;
			canvas.style.width = "0px";
			canvas.style.height = "0px";
			paintedCanvases.delete(canvas);
		}
		return;
	}
	const layer = getLayer(id, text, style);
	layer.glitch.options.color = style.color;
	layer.glitch.options.fontSize = style.fontSize;
	if (style.fontWeight != null) {
		layer.glitch.options.fontWeight = style.fontWeight;
	}
	if (style.letterSpacing != null) {
		layer.glitch.options.letterSpacing = style.letterSpacing;
	}
	const drawStyle = layer.glitch.getDrawStyle();
	const measureStyle = layer.glitch.getMeasureStyle();
	const measureKey = {
		text: layer.glitch.options.text,
		uppercase: layer.glitch.options.uppercase,
		fontSize: drawStyle.fontSize,
		fontWeight: drawStyle.fontWeight,
		fontFamily: drawStyle.fontFamily,
		letterSpacing: drawStyle.letterSpacing,
		glowStrength: measureStyle.replacementGlowStrength,
		pixelRatio: layer.glitch.pixelRatio,
	};
	const measureChanged = !equalStyleValues(layer.measureKey, measureKey);
	layer.painting = true;
	try {
		if (measureChanged) {
			layer.glitch.ensureCanvasSize();
			layer.measured = measureCanvasGlitchTextSize(layer.glitch.ctx, layer.glitch.slots, measureStyle);
			layer.measureKey = measureKey;
		}
		// Pending engine changes must appear in this paint too, just as before.
		if (measureChanged || !equalStyleValues(layer.drawKey, drawStyle) || layer.glitch._pendingDrawLayer != null) {
			layer.glitch.drawInPlace();
			layer.drawKey = drawStyle;
		}
	} finally {
		layer.painting = false;
	}

	const src = layer.glitch.canvas;
	const dpr = Math.max(0.001, layer.glitch.pixelRatio);
	// CanvasGlitchText intentionally keeps a 240px minimum cache for the snake.
	// The DOM arc label must not inherit that empty tail: crop the copied bitmap
	// to the real measured text bounds so its right edge can sit by the node.
	const measured = layer.measured;
	const sourceCssW = Math.max(1, src.width / dpr);
	const cssW = Math.max(1, Math.min(sourceCssW, measured.width));
	const cssH = Math.max(1, src.height / dpr);
	const sourcePixelW = Math.max(1, Math.min(src.width, Math.ceil(cssW * dpr)));
	const lastPaint = paintedCanvases.get(canvas);
	if (lastPaint?.layer === layer && lastPaint.revision === layer.revision
		&& canvas.width === sourcePixelW && canvas.height === src.height) {
		return { width: cssW, height: cssH };
	}
	if (canvas.width !== sourcePixelW) {
		canvas.width = sourcePixelW;
	}
	if (canvas.height !== src.height) {
		canvas.height = src.height;
	}
	canvas.style.width = `${cssW}px`;
	canvas.style.height = `${cssH}px`;
	const ctx = canvas.getContext("2d");
	if (!ctx) {
		return;
	}
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	ctx.imageSmoothingEnabled = false;
	ctx.drawImage(
		src,
		0,
		0,
		sourcePixelW,
		src.height,
		0,
		0,
		sourcePixelW,
		src.height,
	);
	paintedCanvases.set(canvas, { layer, revision: layer.revision });
	return { width: cssW, height: cssH };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} id
 * @param {string} text
 * @param {number} x
 * @param {number} y
 * @param {{ fontSize: number, fontWeight: number | string, letterSpacing: number, fontFamily: string, color: string, uppercase?: boolean }} style
 */
export function drawSiteArcNavSnakeLabel(ctx, id, text, x, y, style) {
	const layer = getLayer(id, text, style);
	const prevSmooth = ctx.imageSmoothingEnabled;
	ctx.imageSmoothingEnabled = false;
	layer.glitch.drawCachedAt(ctx, Math.round(x), Math.round(y), {
		fontSize: style.fontSize,
		fontWeight: style.fontWeight,
		letterSpacing: style.letterSpacing,
		fontFamily: style.fontFamily,
		color: style.color,
		replacementGlowStrength: siteArcConfig.snakeGlowStrength,
		replacementShadowBlur: siteArcConfig.snakeGlowBlur,
		replacementHaloAlpha: siteArcConfig.snakeGlowAlpha,
		passedLetterHighlightAlpha: siteArcConfig.snakePassedLetterAlpha,
	});
	ctx.imageSmoothingEnabled = prevSmooth;
}

/**
 * @param {string} stateId
 * @param {number} lineCount
 */
export function syncSiteArcNavSnakeLines(stateId, lineCount) {
	const prefix = `${stateId}::`;
	for (const [id, layer] of layers) {
		if (!id.startsWith(prefix)) {
			continue;
		}
		const suffix = id.slice(prefix.length);
		if (suffix === "num") {
			continue;
		}
		const lineIndex = Number(suffix);
		if (Number.isFinite(lineIndex) && lineIndex < lineCount) {
			continue;
		}
		clearSwitchTimer(id);
		layer.disposed = true;
		layer.glitch.dispose();
		layers.delete(id);
	}
}

/**
 * @param {string} stateId
 */
function getStateLayers(stateId) {
	const prefix = `${stateId}::`;
	return [...layers.entries()]
		.filter(([id, layer]) => !layer.disposed && id.startsWith(prefix))
		.map(([, layer]) => layer);
}

/**
 * @param {string | null | undefined} stateId
 */
export function playSiteArcNavSnakeHover(stateId) {
	if (!stateId) {
		return;
	}
	const slowMotion = 1 / Math.max(0.1, siteArcConfig.snakeHoverSpeed ?? 1);
	const prefix = `${stateId}::`;
	const entries = [...layers.entries()].filter(
		([id, layer]) => !layer.disposed && !layer.switching && id.startsWith(prefix),
	);
	if (entries.length === 0) {
		return;
	}

	// One sound for the whole label. Duration = longest line (usually the title),
	// not the short chapter number — index===0 used to fire on "::num" and cut early.
	let soundDurationMs = 0;
	for (const [id, layer] of entries) {
		const durationMs = Number(layer.glitch.runHover({
			playSound: false,
			slowMotion,
		})) || 0;
		const isNum = id.endsWith("::num");
		if (!isNum) {
			soundDurationMs = Math.max(soundDurationMs, durationMs);
		} else if (soundDurationMs <= 0) {
			soundDurationMs = durationMs;
		}
	}
	if (soundDurationMs > 0) {
		playGlitchTextSound(soundDurationMs, "hover", CASE_STUDY_RIGHT_SOUND_PAN);
	}
}

/**
 * @param {string | null | undefined} stateId
 */
export function clearSiteArcNavSnakeHover(stateId) {
	if (!stateId) {
		return;
	}
	getStateLayers(stateId).forEach((layer) => layer.glitch.clearHoverPassed());
}

/**
 * @param {() => void} callback
 */
export function registerSiteArcNavSnakeRepaint(callback) {
	repaint = callback;
	document.fonts?.addEventListener("loadingdone", invalidateFontMetrics);
	return () => {
		if (repaint === callback) {
			repaint = null;
			document.fonts?.removeEventListener("loadingdone", invalidateFontMetrics);
		}
	};
}

export function hasSiteArcNavSnakeRepaint() {
	return typeof repaint === "function";
}

export function disposeSiteArcNavSnake() {
	if (repaintRaf) {
		cancelAnimationFrame(repaintRaf);
		repaintRaf = 0;
	}
	for (const id of switchTimers.keys()) {
		clearSwitchTimer(id);
	}
	for (const layer of layers.values()) {
		layer.disposed = true;
		layer.glitch.dispose();
	}
	layers.clear();
}

export function disposeSiteArcNavSnakeIfOrphaned() {
	queueMicrotask(() => {
		if (!hasSiteArcNavSnakeRepaint()) {
			disposeSiteArcNavSnake();
		}
	});
}
