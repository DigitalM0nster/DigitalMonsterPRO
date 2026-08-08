import { useLayoutEffect } from "react";
import { subscribeKey } from "valtio/utils";
import { store } from "@/app/store.jsx";
import { getSceneCarousel, syncCarouselFromPage } from "@/three/render/transition/carouselPage.js";
import {
	startCapabilitiesExperienceRuntime,
	stopCapabilitiesExperienceRuntime,
} from "./capabilitiesExperienceRuntime.js";

function isCapabilitiesPath(path) {
	const normalized = String(path ?? "/").replace(/\/+$/, "") || "/";
	return normalized === "/capabilities" || normalized.startsWith("/capabilities/");
}

/** Keeps MMK-1 internal story ownership aligned with the Three carousel route. */
export default function CapabilitiesExperienceHost() {
	useLayoutEffect(() => {
		const syncFromCarouselId = (id) => {
			if (id === "capabilities") startCapabilitiesExperienceRuntime();
			else stopCapabilitiesExperienceRuntime();
		};

		if (isCapabilitiesPath(window.location.pathname)) {
			syncCarouselFromPage("/capabilities", { force: true });
			const carousel = getSceneCarousel();
			store.sceneCarouselCurrentId = carousel.currentId;
		}

		syncFromCarouselId(getSceneCarousel().currentId);
		return subscribeKey(store, "sceneCarouselCurrentId", syncFromCarouselId, true);
	}, []);

	return null;
}
