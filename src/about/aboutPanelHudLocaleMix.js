/**
 * About left HUD locale switch — adapter over shared panelHudLocaleMixController.
 * Same mosaic wipe as stage scroll (old locale = from, new locale = to, mix 0→1).
 *
 * Does **not** move About story / stage spring on locale change — wipe snapshots
 * whatever HUD band is visible at the current story (including mid-segment).
 *
 * Store locale is chased for the whole session (not only while About owns input):
 * animate wipe only when About is current; otherwise instant buffer/GPU swap.
 */
import { subscribeKey } from "valtio/utils";
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

/** @type {(() => void) | null} */
let storeLocaleUnsub = null;

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
	if (playOpts.storyProgress != null) {
		return Number(playOpts.storyProgress) || 0;
	}
	return Number(store.aboutExperience?.storyProgress) || 0;
}

/**
 * Shared controller always calls `settle` before wipe.
 * About keeps story where it is — no pin to nearest stage stop.
 */
async function settleAboutStory(_helpers) {
	/* no-op */
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
 * Chase `store.siteLocale` for About HUD (animated only while About is current).
 * @param {{
 *   storyProgress?: number,
 *   getStoryProgress?: () => number,
 * }} [opts]
 */
export async function playAboutPanelHudLocaleMix(opts = {}) {
	ensureAboutPanelHudLocaleStoreSync();
	playOpts = opts;
	return aboutLocaleMix.playTowardStore();
}

/** Instant/animated chase from current store locale + story. */
export function syncAboutPanelHudLocaleFromStore() {
	return playAboutPanelHudLocaleMix({});
}

export function cancelAboutPanelHudLocaleMix() {
	aboutLocaleMix.cancel();
}

/** Keep displayed locale in sync after curtain warm / non-animated swaps. */
export function syncAboutPanelHudDisplayedLocale(locale) {
	displayedLocale = normalizeSiteLocale(locale);
}

export function getAboutPanelHudDisplayedLocale() {
	return displayedLocale;
}

/**
 * Session-wide store chase — About runtime may be stopped while on home/hub.
 * Without this, changing language elsewhere leaves About HUD on the old locale.
 */
export function ensureAboutPanelHudLocaleStoreSync() {
	if (storeLocaleUnsub || typeof window === "undefined") {
		return;
	}
	storeLocaleUnsub = subscribeKey(store, "siteLocale", () => {
		void syncAboutPanelHudLocaleFromStore();
	});
}

if (typeof window !== "undefined") {
	ensureAboutPanelHudLocaleStoreSync();
}
