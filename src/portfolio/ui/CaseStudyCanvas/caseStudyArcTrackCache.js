/**
 * Cache the static faded track (no node cutouts). Cutouts are punched each frame
 * with destination-out — full visual quality, cheap while the ring spins.
 */

/** @type {HTMLCanvasElement | null} */
let trackCanvas = null;
/** @type {CanvasRenderingContext2D | null} */
let trackCtx = null;
/** @type {string} */
let trackKey = "";
let trackCssW = 0;
let trackCssH = 0;
let trackDpr = 1;

/**
 * @param {string} key
 * @param {number} cssW
 * @param {number} cssH
 * @param {number} dpr
 * @param {(ctx: CanvasRenderingContext2D) => void} paintTrack
 */
function ensureTrackCache(key, cssW, cssH, dpr, paintTrack) {
	const pixelW = Math.max(1, Math.round(cssW * dpr));
	const pixelH = Math.max(1, Math.round(cssH * dpr));
	if (!trackCanvas) {
		trackCanvas = document.createElement("canvas");
		trackCtx = trackCanvas.getContext("2d", { alpha: true });
	}
	if (!trackCtx) {
		return false;
	}

	const sizeChanged = trackCanvas.width !== pixelW || trackCanvas.height !== pixelH;
	if (sizeChanged) {
		trackCanvas.width = pixelW;
		trackCanvas.height = pixelH;
		trackCssW = cssW;
		trackCssH = cssH;
		trackDpr = dpr;
		trackKey = "";
	}

	if (trackKey === key) {
		return true;
	}

	trackCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
	trackCtx.clearRect(0, 0, cssW, cssH);
	paintTrack(trackCtx);
	trackKey = key;
	return true;
}

/**
 * Blit cached track, then punch node cutout holes in destination.
 *
 * @param {CanvasRenderingContext2D} destCtx
 * @param {{
 *   key: string,
 *   cssW: number,
 *   cssH: number,
 *   dpr: number,
 *   paintTrack: (ctx: CanvasRenderingContext2D) => void,
 *   cutoutCenters: Array<{ x: number, y: number }>,
 *   cutoutRadius: number,
 * }} opts
 */
export function drawCachedArcTrackLayer(destCtx, opts) {
	const { key, cssW, cssH, dpr, paintTrack, cutoutCenters, cutoutRadius } = opts;
	if (!ensureTrackCache(key, cssW, cssH, dpr, paintTrack) || !trackCanvas) {
		paintTrack(destCtx);
	} else {
		destCtx.save();
		destCtx.setTransform(1, 0, 0, 1, 0, 0);
		destCtx.drawImage(trackCanvas, 0, 0, trackCanvas.width, trackCanvas.height);
		destCtx.restore();
		destCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
	}

	if (!(cutoutRadius > 0) || cutoutCenters.length === 0) {
		return;
	}

	destCtx.save();
	destCtx.globalCompositeOperation = "destination-out";
	destCtx.fillStyle = "#000";
	for (const point of cutoutCenters) {
		destCtx.beginPath();
		destCtx.arc(point.x, point.y, cutoutRadius, 0, Math.PI * 2);
		destCtx.fill();
	}
	destCtx.restore();
}

export function clearArcTrackCache() {
	trackKey = "";
}
