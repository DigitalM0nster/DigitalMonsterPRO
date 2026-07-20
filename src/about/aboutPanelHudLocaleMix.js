/**
 * About left HUD locale switch — adapter over shared panelHudLocaleMixController.
 * Same mosaic wipe as stage scroll (old locale = from, new locale = to, mix 0→1).
 */
import { getCaseChromeMosaicEnterMs } from "@/portfolio/ui/CaseStudyCanvas/caseChromeMosaicConfig.js";
import { createPanelHudLocaleMixController } from "@/shared/panelHud/panelHudLocaleMixController.js";
import { shouldAnimateSiteLocaleForRingScene } from "@/utils/siteLocaleSwitch.js";
import { normalizeSiteLocale } from "@/utils/siteLocale.js";
import { store } from "@/store.jsx";
import {
	getAboutPanelHudState,
	isAboutPanelHudLocaleMixBusy,
	setAboutPanelHudLocaleMixBusy,
	setAboutPanelHudMixProgress,
	setAboutPanelHudState,
} from "@/about/aboutPanelHudBridge.js";
import {
	ensureAboutPanelHudCanvases,
	getAboutPanelHudSessionBuffers,
	publishAboutPanelHudPair,
	resolveAboutPanelHudStoryPair,
} from "@/about/aboutPanelHudStory.js";
import { reuploadAboutPanelHudWarmPool } from "@/about/warmAboutPanelHudUnderCurtain.js";

/** @type {HTMLCanvasElement | null} */
let snapshotCanvas = null;
/** Locale currently shown on the left HUD (after last completed wipe). */
let displayedLocale = normalizeSiteLocale(store.siteLocale);

/** Per-play opts from `playAboutPanelHudLocaleMix`. */
let playOpts = {};

function cloneCanvas(source) {
	if (!source?.width || !source?.height) {
		return null;
	}
	const canvas = snapshotCanvas?.width === source.width && snapshotCanvas?.height === source.height
		? snapshotCanvas
		: document.createElement("canvas");
	canvas.width = source.width;
	canvas.height = source.height;
	const ctx = canvas.getContext("2d");
	ctx?.setTransform(1, 0, 0, 1, 0, 0);
	ctx?.clearRect(0, 0, canvas.width, canvas.height);
	ctx?.drawImage(source, 0, 0);
	snapshotCanvas = canvas;
	return canvas;
}

function layerCanvas(buffers, layerId) {
	if (layerId === "text1") return buffers.text1Canvas;
	if (layerId === "text2") return buffers.text2Canvas;
	if (layerId === "text3") return buffers.text3Canvas;
	return buffers.emptyCanvas;
}

function readStory() {
	if (typeof playOpts.getStoryProgress === "function") {
		return Number(playOpts.getStoryProgress()) || 0;
	}
	return Number(playOpts.storyProgress) || 0;
}

/**
 * @param {{
 *   isCancelled: () => boolean,
 *   animateValue: (opts: {
 *     from: number,
 *     to: number,
 *     durationMs: number,
 *     onTick: (value: number) => void,
 *   }) => Promise<void>,
 * }} helpers
 */
async function settleAboutStory(helpers) {
	let story = readStory();
	const pair = resolveAboutPanelHudStoryPair(story);
	if (pair.mix <= 0.02 || pair.mix >= 0.98) {
		const pinned = pair.mix >= 0.5
			? Math.min(3, Math.ceil(story - 1e-6))
			: Math.floor(story + 1e-6);
		if (Math.abs(story - pinned) > 1e-6) {
			playOpts.settleStory?.(pinned);
			setAboutPanelHudMixProgress(resolveAboutPanelHudStoryPair(pinned).mix);
		}
		return;
	}

	const endpoint = pair.mix >= 0.5
		? Math.min(3, Math.ceil(story - 1e-6))
		: Math.floor(story + 1e-6);
	const start = story;
	const distance = Math.abs(endpoint - start);
	if (distance <= 0.001) {
		playOpts.settleStory?.(endpoint);
		setAboutPanelHudMixProgress(resolveAboutPanelHudStoryPair(endpoint).mix);
		return;
	}

	await helpers.animateValue({
		from: start,
		to: endpoint,
		durationMs: Math.max(1, getCaseChromeMosaicEnterMs() * distance),
		onTick: (next) => {
			playOpts.settleStory?.(next);
			setAboutPanelHudMixProgress(resolveAboutPanelHudStoryPair(next).mix);
		},
	});

	if (!helpers.isCancelled()) {
		playOpts.settleStory?.(endpoint);
		setAboutPanelHudMixProgress(resolveAboutPanelHudStoryPair(endpoint).mix);
	}
}

/**
 * @param {string} desiredLocale
 * @returns {Promise<false | { story: number, skipWipe?: boolean }>}
 */
async function prepareAboutWipe(desiredLocale) {
	const story = readStory();
	const pair = resolveAboutPanelHudStoryPair(story);
	const bridge = getAboutPanelHudState();
	const visible = pair.mix >= 0.5
		? (bridge.toCanvas ?? bridge.fromCanvas)
		: bridge.fromCanvas;
	const fromSnap = cloneCanvas(visible);

	const ok = await ensureAboutPanelHudCanvases({
		force: true,
		locale: desiredLocale,
	});
	if (!ok) {
		return false;
	}

	const buffers = getAboutPanelHudSessionBuffers();
	if (!buffers) {
		return false;
	}

	const nextPair = resolveAboutPanelHudStoryPair(story);
	const toCanvas = layerCanvas(buffers, nextPair.from);

	if (!fromSnap) {
		reuploadAboutPanelHudWarmPool();
		publishAboutPanelHudPair(nextPair.from, nextPair.to, { upload: true });
		setAboutPanelHudMixProgress(nextPair.mix);
		return { story, skipWipe: true };
	}

	setAboutPanelHudState({
		fromCanvas: fromSnap,
		toCanvas,
		hitRegions: [],
		mosaic: buffers.mosaic,
		dirtyCanvases: [fromSnap, toCanvas],
		bumpTexture: true,
	});
	setAboutPanelHudMixProgress(0);
	return { story };
}

const aboutLocaleMix = createPanelHudLocaleMixController({
	getDesiredLocale: () => normalizeSiteLocale(store.siteLocale),
	getDisplayedLocale: () => displayedLocale,
	setDisplayedLocale: (locale) => {
		displayedLocale = normalizeSiteLocale(locale);
	},
	shouldAnimate: () => shouldAnimateSiteLocaleForRingScene("about"),
	getDurationMs: () => getCaseChromeMosaicEnterMs(),
	onBusyChange: (busy) => {
		setAboutPanelHudLocaleMixBusy(busy);
	},
	settle: settleAboutStory,
	prepareWipe: prepareAboutWipe,
	onWipeTick: (t) => {
		setAboutPanelHudMixProgress(t);
	},
	onWipeDone: async (_desiredLocale, prepared) => {
		if (!prepared || prepared.skipWipe) {
			return;
		}
		const story = Number(prepared.story) || readStory();
		const nextPair = resolveAboutPanelHudStoryPair(story);
		reuploadAboutPanelHudWarmPool();
		publishAboutPanelHudPair(nextPair.from, nextPair.to, { upload: true });
		setAboutPanelHudMixProgress(nextPair.mix);
	},
	onInstantSwap: async (desiredLocale) => {
		const storyProgress = readStory();
		const ok = await ensureAboutPanelHudCanvases({ force: true, locale: desiredLocale });
		if (!ok) {
			return false;
		}
		const { from, to, mix } = resolveAboutPanelHudStoryPair(storyProgress);
		reuploadAboutPanelHudWarmPool();
		publishAboutPanelHudPair(from, to, { upload: true });
		setAboutPanelHudMixProgress(mix);
		return true;
	},
});

export { isAboutPanelHudLocaleMixBusy };

/**
 * @param {{
 *   storyProgress?: number,
 *   getStoryProgress?: () => number,
 *   settleStory?: (endpointStory: number) => void,
 * }} opts
 */
export async function playAboutPanelHudLocaleMix(opts = {}) {
	playOpts = opts;
	return aboutLocaleMix.playTowardStore();
}

export function cancelAboutPanelHudLocaleMix() {
	aboutLocaleMix.cancel();
}

/** Keep displayed locale in sync after curtain warm / non-animated swaps. */
export function syncAboutPanelHudDisplayedLocale(locale) {
	displayedLocale = normalizeSiteLocale(locale);
}
