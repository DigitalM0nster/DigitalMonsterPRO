import { useLayoutEffect } from "react";
import { subscribeKey } from "valtio/utils";
import { store } from "@/store.jsx";
import { getSceneCarousel, syncCarouselFromPage } from "@/three/render/transition/carouselPage.js";
import {
	startAboutExperienceRuntime,
	stopAboutExperienceRuntime,
} from "./aboutExperienceRuntime.js";

function isAboutPath(path) {
	const normalized = String(path ?? "/").replace(/\/+$/, "") || "/";
	return normalized === "/about";
}

/**
 * Syncs About wheel/story ownership to `sceneCarouselCurrentId`.
 * Commit writes that id immediately; valtio subscribe runs in the same turn,
 * so Portfolio→About does not wait for AboutPage / displayPathname exit.
 *
 * Also heals deep-link / loader Start on `/about`: carousel can still be `home`
 * until an explicit sync — without that, HUD prepare never runs.
 */
export default function AboutExperienceHost() {
	useLayoutEffect(() => {
		const syncFromCarouselId = (id) => {
			if (id === "about") {
				startAboutExperienceRuntime();
			} else {
				stopAboutExperienceRuntime();
			}
		};

		// Deep-link / refresh on /about: align carousel once before first runtime start.
		// Do not re-heal on later id changes (would fight about→neighbor leave).
		if (isAboutPath(window.location.pathname)) {
			syncCarouselFromPage("/about", { force: true });
			const car = getSceneCarousel();
			store.sceneCarouselCurrentId = car.currentId === "about" ? "about" : car.currentId;
		}

		syncFromCarouselId(getSceneCarousel().currentId);
		// notifyInSync: commit already starts runtime in carouselPage; keep Host as
		// backup for deep-link / Start without waiting a microtask when possible.
		return subscribeKey(store, "sceneCarouselCurrentId", syncFromCarouselId, true);
	}, []);

	return null;
}
