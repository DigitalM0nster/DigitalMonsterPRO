import { hexGridOverlayDefaults } from "./hexGridOverlayConfig.js";
import { getSceneCarousel } from "@/three/render/transition/carouselPage.js";
import { getCapabilitiesInternalHexState } from "@/three/render/transition/capabilitiesInternalHex.js";

/**
 * Progress hex-mix: карусель (scroll), dev G-панель — override через hexGridOverlayDefaults._devOverrideProgress.
 */
export function getHexShaderProgress() {
	if (import.meta.env.DEV && hexGridOverlayDefaults._devOverrideProgress === true) {
		return hexGridOverlayDefaults.progress ?? 0;
	}

	const carousel = getSceneCarousel();
	const internalCapabilities = getCapabilitiesInternalHexState();
	if (
		internalCapabilities.transitioning
		&& carousel.currentId === "capabilities"
		&& carousel.getMixProgress() <= 0.0001
		&& !carousel.isInteractionLocked()
	) {
		return internalCapabilities.progress;
	}

	return carousel.getMixProgress();
}

/** True while carousel is on the backward leave segment (progress < 0). */
export function getHexRevealFromTop() {
	if (import.meta.env.DEV && hexGridOverlayDefaults._devOverrideProgress === true) {
		return (hexGridOverlayDefaults.progress ?? 0) < 0;
	}

	const carousel = getSceneCarousel();
	const internalCapabilities = getCapabilitiesInternalHexState();
	if (
		internalCapabilities.transitioning
		&& carousel.currentId === "capabilities"
		&& carousel.getMixProgress() <= 0.0001
		&& !carousel.isInteractionLocked()
	) {
		return false;
	}

	return carousel.progress < 0;
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
