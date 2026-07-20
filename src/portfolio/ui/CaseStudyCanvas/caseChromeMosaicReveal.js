/**
 * DOM mosaic for case «all projects» chrome.
 * Enter matches left WebGL CaseStudyPanelHudMesh.mosaicReveal (same delay / settle /
 * lift / scatter). Exit keeps upward leave for leave-site.
 */
import { prepareCaseStudyCanvasContext } from "./caseStudyCanvasSurface.js";
import {
	getCaseChromeMosaicEnterConfig,
	getCaseChromeMosaicPhaseConfig,
} from "./caseChromeMosaicConfig.js";

function clamp01(value) {
	return Math.max(0, Math.min(1, value));
}

function easeInOut(t) {
	return t * t * (3 - 2 * t);
}

function noise(seed) {
	return (Math.sin(seed * 12.9898) * 43758.5453) % 1;
}

/**
 * Same settle curve as WebGL smoothstep(0.82, 1.0, p).
 * @param {number} p
 */
function settleMix(p) {
	if (p <= 0.82) {
		return 0;
	}
	if (p >= 1) {
		return 1;
	}
	const t = (p - 0.82) / 0.18;
	return t * t * (3 - 2 * t);
}

/**
 * Match CaseStudyPanelHudMesh tileMotion localProgress.
 * @param {number} p
 * @param {number} delay
 */
function localTileProgress(p, delay) {
	const maxDelay = clamp01(delay);
	let delayed = clamp01((p - maxDelay) / Math.max(0.0001, 1 - maxDelay));
	const settle = settleMix(p);
	delayed = delayed + (1 - delayed) * settle;
	let local = clamp01(p * 0.15 + delayed * 0.85);
	local = local + (1 - local) * settle;
	return local;
}

/**
 * @param {HTMLCanvasElement | null} source
 * @param {number} pixelW
 * @param {number} pixelH
 * @returns {HTMLCanvasElement}
 */
export function ensureCaseChromeMosaicSource(source, pixelW, pixelH) {
	const next = source instanceof HTMLCanvasElement ? source : document.createElement("canvas");
	const w = Math.max(1, Math.round(pixelW));
	const h = Math.max(1, Math.round(pixelH));
	if (next.width !== w || next.height !== h) {
		next.width = w;
		next.height = h;
	}
	return next;
}

/**
 * @param {HTMLCanvasElement} source
 * @param {HTMLCanvasElement} visible
 */
export function freezeCaseChromeMosaicSource(source, visible) {
	if (!source || !visible || !visible.width || !visible.height) {
		return;
	}
	if (source.width !== visible.width || source.height !== visible.height) {
		source.width = visible.width;
		source.height = visible.height;
	}
	const ctx = source.getContext("2d");
	if (!ctx) {
		return;
	}
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.clearRect(0, 0, source.width, source.height);
	ctx.drawImage(visible, 0, 0);
}

/**
 * Size visible + source buffers to the same viewport × dpr.
 * @param {HTMLCanvasElement} destCanvas
 * @param {HTMLCanvasElement | null} sourceCanvas
 * @param {number} viewportW
 * @param {number} viewportH
 * @param {number} dpr
 * @returns {HTMLCanvasElement} source
 */
export function prepareCaseChromeMosaicSurfaces(destCanvas, sourceCanvas, viewportW, viewportH, dpr) {
	prepareCaseStudyCanvasContext(destCanvas, viewportW, viewportH, dpr);
	const source = ensureCaseChromeMosaicSource(
		sourceCanvas,
		destCanvas.width,
		destCanvas.height,
	);
	prepareCaseStudyCanvasContext(source, viewportW, viewportH, dpr);
	return source;
}

/**
 * One-frame mosaic compose onto the visible chrome canvas.
 * progress 0 = hidden, 1 = fully assembled.
 * travelSign +1: enter (same as left WebGL band); -1: exit upward.
 *
 * @param {{
 *   destCanvas: HTMLCanvasElement,
 *   sourceCanvas: HTMLCanvasElement,
 *   boundsCss: { x: number, y: number, width: number, height: number },
 *   progress: number,
 *   travelSign?: number,
 *   dpr?: number,
 * }} args
 */
export function composeCaseChromeMosaicReveal(args) {
	const {
		destCanvas,
		sourceCanvas,
		boundsCss,
		progress,
		travelSign = 1,
		dpr = 1,
	} = args;

	if (!destCanvas || !sourceCanvas || !boundsCss) {
		return;
	}
	if (!destCanvas.width || !destCanvas.height || !sourceCanvas.width || !sourceCanvas.height) {
		return;
	}

	const ctx = destCanvas.getContext("2d");
	if (!ctx) {
		return;
	}

	const pr = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
	const sx = Math.max(0, Math.floor(boundsCss.x * pr));
	const sy = Math.max(0, Math.floor(boundsCss.y * pr));
	const sw = Math.min(
		destCanvas.width - sx,
		Math.max(1, Math.ceil(boundsCss.width * pr)),
	);
	const sh = Math.min(
		destCanvas.height - sy,
		Math.max(1, Math.ceil(boundsCss.height * pr)),
	);

	ctx.save();
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.globalAlpha = 1;
	ctx.clearRect(0, 0, destCanvas.width, destCanvas.height);

	const p = clamp01(progress);
	if (p <= 0.001 || sw <= 0 || sh <= 0) {
		ctx.restore();
		return;
	}

	const isExit = travelSign < 0;
	const cfg = isExit ? getCaseChromeMosaicPhaseConfig("exit") : getCaseChromeMosaicEnterConfig();
	const columns = cfg.columns;
	const rows = cfg.rows;
	const maxDelay = cfg.delay;
	const tileW = Math.ceil(sw / columns);
	const tileH = Math.ceil(sh / rows);

	ctx.imageSmoothingEnabled = false;

	for (let row = 0; row < rows; row += 1) {
		for (let column = 0; column < columns; column += 1) {
			const tileX = column * tileW;
			const tileY = row * tileH;
			const width = Math.min(tileW, sw - tileX);
			const height = Math.min(tileH, sh - tileY);
			if (width <= 0 || height <= 0) {
				continue;
			}

			const seed = row * columns + column;
			const randomA = Math.abs(noise(seed * 7.13 + 3.7));
			const randomB = noise(seed * 11.91 + 9.2);
			const randomC = Math.abs(noise(seed * 19.37 + 5.4));
			const delay = randomA * maxDelay;
			const localProgress = isExit
				? easeInOut(clamp01((p - delay) / Math.max(0.0001, 1 - delay)))
				: localTileProgress(p, delay);
			const remaining = 1 - localProgress;

			// Match WebGL: travel = (rectH + tileH) * lift + randomLift(px).
			const travelY = (sh + tileH) * cfg.liftStrength + randomC * cfg.randomLift;
			const scatterX = randomB * cfg.scatterX;
			// Enter: from below (+Y in canvas). Exit: upward (−Y).
			const offsetY = (isExit ? -1 : 1) * travelY * remaining;
			const offsetX = scatterX * remaining;

			ctx.globalAlpha = isExit
				? (cfg.fadeAlpha === false ? 1 : localProgress)
				: localProgress;
			ctx.drawImage(
				sourceCanvas,
				sx + tileX,
				sy + tileY,
				width,
				height,
				sx + tileX + offsetX,
				sy + tileY + offsetY,
				width,
				height,
			);
		}
	}

	ctx.restore();
}
