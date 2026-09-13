/** Bind prepared locale textures at the site's hidden commit. Story progress keeps its owner. */
import { subscribeKey } from "valtio/utils";
import { store } from "@/app/store.jsx";
import { normalizeSiteLocale } from "@/functions/siteLocale.js";
import { registerSiteLocaleEffect } from "@/functions/siteLocaleTransition.js";
import { getAboutPanelHudSessionBuffers, selectPreparedAboutPanelHudLocale, ensureAboutPanelHudCanvases, publishAboutPanelHudPair, resolveAboutPanelHudStoryPair } from "./aboutPanelHudStory.js";
import { setAboutPanelHudMixProgress, isAboutPanelHudLocaleMixBusy } from "./aboutPanelHudBridge.js";
import { reuploadAboutPanelHudWarmPool } from "./warmAboutPanelHudUnderCurtain.js";

let displayedLocale = normalizeSiteLocale(store.siteLocale);
let storeLocaleUnsub = null;
let playOpts = {};
export { isAboutPanelHudLocaleMixBusy };

async function bindLocale(locale) {
	const key = `${locale}|${window.innerWidth}x${window.innerHeight}`;
	if (getAboutPanelHudSessionBuffers()?.paintKey === key) { displayedLocale = locale; return true; }
	if (!selectPreparedAboutPanelHudLocale(locale)) {
		// A viewport change invalidates the old surface; ordinary locale switches hit the warm cache.
		if (!await ensureAboutPanelHudCanvases({ locale })) return false;
		reuploadAboutPanelHudWarmPool();
	}
	const story = Number(playOpts.getStoryProgress?.() ?? store.aboutExperience?.storyProgress ?? playOpts.storyProgress) || 0;
	const pair = resolveAboutPanelHudStoryPair(story);
	publishAboutPanelHudPair(pair.from, pair.to);
	setAboutPanelHudMixProgress(pair.mix);
	displayedLocale = locale;
	return true;
}

export async function playAboutPanelHudLocaleMix(opts = {}) {
	ensureAboutPanelHudLocaleStoreSync(); playOpts = opts;
	return bindLocale(normalizeSiteLocale(store.siteLocale));
}
export const syncAboutPanelHudLocaleFromStore = () => playAboutPanelHudLocaleMix();
// Route leave cannot cancel a site locale transaction or retarget its committed destination.
export function cancelAboutPanelHudLocaleMix() {}
export function syncAboutPanelHudDisplayedLocale(locale) { displayedLocale = normalizeSiteLocale(locale); }
export function getAboutPanelHudDisplayedLocale() { return displayedLocale; }
export function ensureAboutPanelHudLocaleStoreSync() {
	if (storeLocaleUnsub || typeof window === "undefined") return;
	storeLocaleUnsub = subscribeKey(store, "siteLocale", () => {
		if (store.appStarted) void syncAboutPanelHudLocaleFromStore();
	});
	registerSiteLocaleEffect({ commit: bindLocale });
}
if (typeof window !== "undefined") ensureAboutPanelHudLocaleStoreSync();
