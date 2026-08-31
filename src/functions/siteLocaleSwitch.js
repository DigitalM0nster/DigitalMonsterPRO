import { store } from "@/app/store.jsx";
import { getSceneCarousel } from "@/three/render/transition/carouselPage.js";
import { isCapabilitySceneId } from "@/pages/capabilities/data/capabilities.js";

/**
 * Site locale animation ownership:
 * animate ONLY on the page/case the user is on; every other warm scene
 * must swap copy instantly (no snake / glitch language switch).
 *
 * Global chrome (left menu, page dots, top HUD) is not gated here.
 */

/**
 * @param {string} sceneId ring scene id (home | portfolioHub | capabilities:* | about | contacts)
 */
export function shouldAnimateSiteLocaleForRingScene(sceneId) {
	if (store.openedCase) {
		return false;
	}
	return getSceneCarousel()?.currentId === sceneId;
}

/** Case HUD / arc / project-nav chrome — animate only while a case is open. */
export function shouldAnimateSiteLocaleForCaseChrome() {
	if (store.openedCase) {
		return true;
	}
	const id = getSceneCarousel().currentId;
	// Capabilities deliberately reuse the prepared case left-panel HUD. Give
	// that mounted panel the same mosaic locale transition as an open case.
	if (isCapabilitySceneId(id) && store.capabilitiesExperience?.active) {
		return true;
	}
	return typeof id === "string" && id.startsWith("case");
}
