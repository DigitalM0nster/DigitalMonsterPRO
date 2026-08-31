import { useLayoutEffect } from "react";
import { subscribeKey } from "valtio/utils";
import { store } from "@/app/store.jsx";
import { getSceneCarousel } from "@/three/render/transition/carouselPage.js";
import { syncCapabilityRouteState } from "./capabilityRouteState.js";

/** Keeps the route-owned capability identity aligned with the shared HUD/arc bridges. */
export default function CapabilitiesExperienceHost() {
	useLayoutEffect(() => {
		const syncFromCarouselId = (id) => syncCapabilityRouteState(id);
		const currentId = getSceneCarousel().currentId;
		store.sceneCarouselCurrentId = currentId;
		syncFromCarouselId(currentId);
		return subscribeKey(store, "sceneCarouselCurrentId", syncFromCarouselId, true);
	}, []);

	return null;
}
