export const SCREEN_TEXT_FONT_FAMILY = 'ManifoldExtended, "Segoe UI", sans-serif';
const MIN_CANVAS_WIDTH = 240;
const MIN_CANVAS_HEIGHT = 64;

const loadedFontKeys = new Set();

function fontLoadKey(fontWeight, fontSize) {
	return `${fontWeight}-${fontSize}`;
}

/** Подгружает шрифты, нужные слоям стека. */
export async function ensureScreenTextFonts(layers = []) {
	if (typeof document === "undefined" || !document.fonts?.load) {
		return;
	}

	const jobs = [];

	for (const layer of layers) {
		const fontWeight = layer.fontWeight ?? 500;
		const fontSize = layer.fontSize ?? 28;
		const key = fontLoadKey(fontWeight, fontSize);

		if (loadedFontKeys.has(key)) {
			continue;
		}

		loadedFontKeys.add(key);
		jobs.push(
			document.fonts.load(`${fontWeight} ${fontSize}px ${SCREEN_TEXT_FONT_FAMILY}`).catch(() => {}),
		);
	}

	if (jobs.length > 0) {
		await Promise.all(jobs);
	}
}

export function measureTextWithSpacing(ctx, text, letterSpacingPx) {
	let width = 0;

	for (let index = 0; index < text.length; index += 1) {
		width += ctx.measureText(text[index]).width;
		if (index < text.length - 1) {
			width += letterSpacingPx;
		}
	}

	return width;
}

export function fillTextWithSpacing(ctx, text, x, y, letterSpacingPx) {
	let cursorX = x;

	for (let index = 0; index < text.length; index += 1) {
		const char = text[index];
		ctx.fillText(char, cursorX, y);
		cursorX += ctx.measureText(char).width + letterSpacingPx;
	}
}

/**
 * Рисует один текстовый слой на отдельном canvas.
 * Каждый слой — своя текстура и свой шейдер.
 */
export function drawScreenTextLayerCanvas(layerCfg) {
	const text = layerCfg.uppercase ? String(layerCfg.text).toUpperCase() : String(layerCfg.text);
	const letterSpacingPx = layerCfg.fontSize * layerCfg.letterSpacing;
	const glow = layerCfg.glow ?? 0;

	const measureCanvas = document.createElement("canvas");
	measureCanvas.width = 1;
	measureCanvas.height = 1;
	const measureCtx = measureCanvas.getContext("2d");

	if (!measureCtx) {
		const fallback = document.createElement("canvas");
		fallback.width = MIN_CANVAS_WIDTH;
		fallback.height = MIN_CANVAS_HEIGHT;
		return { canvas: fallback, aspect: MIN_CANVAS_WIDTH / MIN_CANVAS_HEIGHT };
	}

	measureCtx.font = `${layerCfg.fontWeight} ${layerCfg.fontSize}px ${SCREEN_TEXT_FONT_FAMILY}`;
	const textWidth = measureTextWithSpacing(measureCtx, text, letterSpacingPx);

	const canvasWidth = Math.max(
		MIN_CANVAS_WIDTH,
		Math.ceil(textWidth + layerCfg.paddingLeft + layerCfg.paddingRight + glow * 2),
	);
	const canvasHeight = Math.max(
		MIN_CANVAS_HEIGHT,
		Math.ceil(layerCfg.fontSize + layerCfg.paddingTop + layerCfg.paddingBottom + glow),
	);

	const canvas = document.createElement("canvas");
	canvas.width = canvasWidth;
	canvas.height = canvasHeight;

	const ctx = canvas.getContext("2d");
	if (!ctx) {
		return { canvas, aspect: canvasWidth / canvasHeight };
	}

	ctx.clearRect(0, 0, canvas.width, canvas.height);
	ctx.textBaseline = "top";
	ctx.font = `${layerCfg.fontWeight} ${layerCfg.fontSize}px ${SCREEN_TEXT_FONT_FAMILY}`;
	ctx.fillStyle = layerCfg.color ?? "#ffffff";

	fillTextWithSpacing(ctx, text, layerCfg.paddingLeft, layerCfg.paddingTop, letterSpacingPx);

	return { canvas, aspect: canvasWidth / canvasHeight };
}
