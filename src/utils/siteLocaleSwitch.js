import { store } from "@/store.jsx";
import { getSceneCarousel } from "@/three/render/transition/carouselPage.js";

/**
 * Site locale animation ownership:
 * animate ONLY on the page/case the user is on; every other warm scene
 * must swap copy instantly (no snake / glitch language switch).
 *
 * Global chrome (left menu, page dots, top HUD) is not gated here.
 */

/**
 * @param {string} sceneId ring scene id (home | portfolioHub | about | contacts)
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
	return typeof id === "string" && id.startsWith("case");
}
