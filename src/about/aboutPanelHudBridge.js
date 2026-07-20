/**
 * About left-panel HUD bridge (case-shaped, About-owned).
 * Never shares canvases / enter / mix with casePanelHudBridge.
 */

let fromCanvas = null;
let toCanvas = null;
let revision = 0;
/** @type {{ type: string, id: string, targetPath: string, x: number, y: number, w: number, h: number, r: number }[]} */
let hitRegions = [];
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
 *   chromeFollowEnter?: boolean,
 * }} */
let mosaic = null;
/** @type {WeakSet<HTMLCanvasElement> | null} */
let dirtyCanvases = null;
/**
 * Case-entry-style reveal 0…1.
 * null = idle full show. 0 = hidden. Default 0 — never flash warm glyphs.
 * @type {number | null}
 */
let enterProgress = 0;
/** +1 assemble from below, -1 leave upward. */
let enterTravelSign = 1;
/** Story-driven stage mosaic 0…1 (text → empty). */
let mixProgress = 0;
/** True while locale mosaic owns from/to + mixProgress. */
let localeMixBusy = false;

/** @type {Set<() => void>} */
const syncListeners = new Set();

export function setAboutPanelHudLocaleMixBusy(value) {
	localeMixBusy = Boolean(value);
}

export function isAboutPanelHudLocaleMixBusy() {
	return localeMixBusy;
}

/**
 * @param {{
 *   fromCanvas?: HTMLCanvasElement | null,
 *   toCanvas?: HTMLCanvasElement | null,
 *   hitRegions?: typeof hitRegions,
 *   mosaic?: typeof mosaic,
 *   dirtyCanvases?: HTMLCanvasElement[] | null,
 *   mixProgress?: number,
 *   bumpTexture?: boolean,
 * }} state
 */
export function setAboutPanelHudState(state = {}) {
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
	if ("mixProgress" in state && Number.isFinite(state.mixProgress)) {
		mixProgress = Math.max(0, Math.min(1, Number(state.mixProgress)));
	}
	if (state.bumpTexture) {
		revision += 1;
		for (const listener of syncListeners) {
			listener();
		}
	}
}

/**
 * @param {number} value
 */
export function setAboutPanelHudMixProgress(value) {
	const next = Math.max(0, Math.min(1, Number(value) || 0));
	if (next === mixProgress) {
		return;
	}
	mixProgress = next;
	for (const listener of syncListeners) {
		listener();
	}
}

export function getAboutPanelHudMixProgress() {
	return mixProgress;
}

/**
 * @param {{ keepEnterProgress?: boolean }} [options]
 */
export function clearAboutPanelHudContent(options = {}) {
	if (
		!fromCanvas
		&& !toCanvas
		&& hitRegions.length === 0
		&& !mosaic
		&& enterProgress === 0
		&& mixProgress === 0
	) {
		return;
	}
	fromCanvas = null;
	toCanvas = null;
	hitRegions = [];
	mosaic = null;
	dirtyCanvases = null;
	mixProgress = 0;
	if (!options.keepEnterProgress) {
		enterProgress = 0;
		enterTravelSign = 1;
	}
	revision += 1;
	for (const listener of syncListeners) {
		listener();
	}
}

/**
 * @param {number | null | undefined} value
 */
export function setAboutPanelHudEnterProgress(value) {
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

export function getAboutPanelHudEnterProgress() {
	return enterProgress;
}

/**
 * @param {number} sign
 */
export function setAboutPanelHudEnterTravelSign(sign) {
	const next = sign < 0 ? -1 : 1;
	if (next === enterTravelSign) {
		return;
	}
	enterTravelSign = next;
	for (const listener of syncListeners) {
		listener();
	}
}

export function getAboutPanelHudEnterTravelSign() {
	return enterTravelSign;
}

export function getAboutPanelHudState() {
	return {
		canvas: fromCanvas,
		fromCanvas,
		toCanvas: toCanvas ?? fromCanvas,
		revision,
		hitRegions,
		mosaic,
		dirtyCanvases,
		enterProgress,
		enterTravelSign,
		mixProgress,
	};
}

export function registerAboutPanelHudSyncListener(listener) {
	syncListeners.add(listener);
	return () => syncListeners.delete(listener);
}
