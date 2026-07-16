/**
 * Live panel HUD for case scenes.
 * Content (left text): from/to canvases, may enter models RT during hex.
 * Chrome (project nav / all-projects): separate persistent canvas — shared across
 * cases, never snapshotted into content textures, never hex-baked.
 */
let fromCanvas = null;
let toCanvas = null;
let revision = 0;
/** Persistent shared chrome (prev/next / all projects). Survives case→case remounts. */
let chromeCanvas = null;
let chromeRevision = 0;
/** @type {{ type: string, id: string, targetPath: string, x: number, y: number, w: number, h: number, r: number }[]} */
let hitRegions = [];
/** @type {{ type: string, id: string, targetPath: string, x: number, y: number, w: number, h: number, r: number }[]} */
let chromeHitRegions = [];
/** @type {null | {
 *   columns: number,
 *   rows: number,
 *   liftStrength: number,
 *   randomLift: number,
 *   scatterX: number,
 *   delay: number,
 *   canvasWidth: number,
 *   canvasHeight: number,
 *   rectUv?: { minX: number, minY: number, maxX: number, maxY: number },
 *   contentRectUv?: { minX: number, minY: number, maxX: number, maxY: number },
 *   chromeRectUv?: { minX: number, minY: number, maxX: number, maxY: number },
 *   chromeFollowEnter?: boolean,
 * }} */
let mosaic = null;
/** @type {WeakSet<HTMLCanvasElement> | null} null = treat all as dirty */
let dirtyCanvases = null;
/** After stage commit swap — painter must fill the free buffer with the new neighbour. */
let needsComplementPaint = false;
/** @type {'forward' | 'backward' | null} */
let complementDirection = null;
/** @type {((direction: 'forward' | 'backward') => void) | null} */
let promoteListener = null;
/**
 * Case-entry reveal 0…1. null = off (normal stage mix).
 * @type {number | null}
 */
let enterProgress = null;
/** +1 assemble from below (enter), -1 leave upward (exit). */
let enterTravelSign = 1;

/** @type {Set<() => void>} */
const syncListeners = new Set();

/**
 * @param {{
 *   fromCanvas?: HTMLCanvasElement | null,
 *   toCanvas?: HTMLCanvasElement | null,
 *   hitRegions?: typeof hitRegions,
 *   mosaic?: typeof mosaic,
 *   dirtyCanvases?: HTMLCanvasElement[] | null,
 *   bumpTexture?: boolean,
 *   needsComplementPaint?: boolean,
 * }} state
 */
export function setCasePanelHudState(state = {}) {
	if ("fromCanvas" in state) {
		fromCanvas = state.fromCanvas ?? null;
	}
	if ("toCanvas" in state) {
		toCanvas = state.toCanvas ?? null;
	}
	if ("hitRegions" in state && Array.isArray(state.hitRegions)) {
		hitRegions = state.hitRegions.slice();
	}
	if ("mosaic" in state) {
		mosaic = state.mosaic ?? null;
	}
	if ("dirtyCanvases" in state) {
		if (Array.isArray(state.dirtyCanvases)) {
			dirtyCanvases = new WeakSet(state.dirtyCanvases.filter(Boolean));
		} else {
			dirtyCanvases = null;
		}
	}
	if ("needsComplementPaint" in state) {
		needsComplementPaint = Boolean(state.needsComplementPaint);
	}
	if (state.bumpTexture) {
		revision += 1;
	}
}

/**
 * Publish shared project-nav chrome (never mixed into content from/to).
 * @param {{ canvas?: HTMLCanvasElement | null, hitRegions?: typeof chromeHitRegions, bumpTexture?: boolean }} state
 */
export function setCasePanelHudChromeState(state = {}) {
	if ("canvas" in state) {
		chromeCanvas = state.canvas ?? null;
	}
	if ("hitRegions" in state && Array.isArray(state.hitRegions)) {
		chromeHitRegions = state.hitRegions.slice();
	}
	if (state.bumpTexture) {
		chromeRevision += 1;
	}
	for (const listener of syncListeners) {
		listener();
	}
}

/**
 * Swap from/to immediately on stage commit so mixProgress wrap does not flash the left stage.
 * @param {'forward' | 'backward'} direction
 */
export function promoteCasePanelHudCanvases(direction) {
	if (!fromCanvas || !toCanvas || fromCanvas === toCanvas) {
		return false;
	}
	const tmp = fromCanvas;
	fromCanvas = toCanvas;
	toCanvas = tmp;
	dirtyCanvases = new WeakSet();
	needsComplementPaint = true;
	complementDirection = direction === "backward" ? "backward" : "forward";
	revision += 1;
	promoteListener?.(complementDirection);
	for (const listener of syncListeners) {
		listener();
	}
	return true;
}

export function registerCasePanelHudPromoteListener(listener) {
	promoteListener = listener;
	return () => {
		if (promoteListener === listener) {
			promoteListener = null;
		}
	};
}

export function registerCasePanelHudSyncListener(listener) {
	syncListeners.add(listener);
	return () => syncListeners.delete(listener);
}

/**
 * @returns {false | { direction: 'forward' | 'backward' }}
 */
export function consumeCasePanelHudComplementPaint() {
	if (!needsComplementPaint) {
		return false;
	}
	needsComplementPaint = false;
	const direction = complementDirection ?? "forward";
	complementDirection = null;
	return { direction };
}

/** @deprecated use setCasePanelHudState */
export function setCasePanelHudCanvas(canvas, nextHitRegions = []) {
	setCasePanelHudState({
		fromCanvas: canvas,
		toCanvas: canvas,
		hitRegions: nextHitRegions,
		bumpTexture: true,
	});
}

/** Clear left-content buffers only — keep shared chrome across case→case.
 * @param {{ keepEnterProgress?: boolean }} [options]
 */
export function clearCasePanelHudContent(options = {}) {
	if (
		!fromCanvas
		&& !toCanvas
		&& hitRegions.length === 0
		&& !mosaic
		&& !needsComplementPaint
		&& enterProgress == null
	) {
		return;
	}
	fromCanvas = null;
	toCanvas = null;
	hitRegions = [];
	mosaic = null;
	dirtyCanvases = null;
	needsComplementPaint = false;
	complementDirection = null;
	if (!options.keepEnterProgress) {
		enterProgress = null;
		enterTravelSign = 1;
	}
	revision += 1;
	for (const listener of syncListeners) {
		listener();
	}
}

export function clearCasePanelHudChrome() {
	if (!chromeCanvas && chromeHitRegions.length === 0) {
		return;
	}
	chromeCanvas = null;
	chromeHitRegions = [];
	chromeRevision += 1;
	for (const listener of syncListeners) {
		listener();
	}
}

/** @param {{ keepEnterProgress?: boolean }} [options] */
export function clearCasePanelHudCanvas(options = {}) {
	clearCasePanelHudContent(options);
	clearCasePanelHudChrome();
}

/**
 * @param {number | null | undefined} value
 */
export function setCasePanelHudEnterProgress(value) {
	const next = value == null || Number.isNaN(value)
		? null
		: Math.max(0, Math.min(1, Number(value)));
	if (next === enterProgress) {
		return;
	}
	enterProgress = next;
	for (const listener of syncListeners) {
		listener();
	}
}

export function getCasePanelHudEnterProgress() {
	return enterProgress;
}

/**
 * @param {number} sign +1 enter (from below), -1 exit (leave upward)
 */
export function setCasePanelHudEnterTravelSign(sign) {
	const next = sign < 0 ? -1 : 1;
	if (next === enterTravelSign) {
		return;
	}
	enterTravelSign = next;
	for (const listener of syncListeners) {
		listener();
	}
}

export function getCasePanelHudEnterTravelSign() {
	return enterTravelSign;
}

export function getCasePanelHudState() {
	return {
		canvas: fromCanvas,
		fromCanvas,
		toCanvas: toCanvas ?? fromCanvas,
		revision,
		hitRegions,
		mosaic,
		dirtyCanvases,
		needsComplementPaint,
		enterProgress,
		enterTravelSign,
		chromeCanvas,
		chromeRevision,
		chromeHitRegions,
	};
}

export function getCasePanelHudChromeState() {
	return {
		canvas: chromeCanvas,
		revision: chromeRevision,
		hitRegions: chromeHitRegions,
	};
}

/** Ensure a reusable chrome canvas at viewport CSS size × dpr. */
export function ensureCasePanelHudChromeCanvas(cssW, cssH, dpr) {
	const width = Math.max(1, Math.round(cssW * dpr));
	const height = Math.max(1, Math.round(cssH * dpr));
	if (typeof document === "undefined") {
		return null;
	}
	if (!chromeCanvas) {
		chromeCanvas = document.createElement("canvas");
	}
	if (chromeCanvas.width !== width || chromeCanvas.height !== height) {
		chromeCanvas.width = width;
		chromeCanvas.height = height;
		chromeRevision += 1;
	}
	return chromeCanvas;
}
