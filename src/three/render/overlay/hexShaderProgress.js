import { hexGridOverlayDefaults } from "./hexGridOverlayConfig.js";
import { getSceneCarousel } from "../transition/carouselPage.js";

/**
 * Progress hex-mix: карусель (scroll), dev G-панель — override через hexGridOverlayDefaults._devOverrideProgress.
 */
export function getHexShaderProgress() {
	if (import.meta.env.DEV && hexGridOverlayDefaults._devOverrideProgress === true) {
		return hexGridOverlayDefaults.progress ?? 0;
	}

	return getSceneCarousel().getMixProgress();
}

/** Dev: progress + target для G-панели. */
export function getCarouselProgressState() {
	const carousel = getSceneCarousel();
	return {
		progress: carousel.progress,
		progressTarget: carousel.progressTarget,
		mixProgress: carousel.getMixProgress(),
		sceneProgress: carousel.getSceneProgressSnapshot(),
	};
}
