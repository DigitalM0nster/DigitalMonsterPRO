import { easing } from "maath";
import { updateCase1GrainBlurRadius } from "@/three/scenes/portfolio/case1/case1GrainBlurScroll.js";
import { case1PostProcessConfig } from "@/three/scenes/portfolio/case1/case1PostProcessConfig.js";

const damped = { current: 0 };

/**
 * Grain blur на финальном blit моделей.
 * Scroll: store.scroll (кейсы) или progress карусели — что больше.
 */
export function updateSiteGrainBlurRadius(delta, frame = {}) {
	const config = case1PostProcessConfig.grainBlur;

	if (!config?.enabled) {
		easing.damp(damped, "current", 0, config?.fadeSmooth ?? 0.65, delta);
		return damped.current;
	}

	const scroll = frame.scroll ?? 0;
	const carouselProgress = frame.carouselProgress ?? 0;
	const effectiveScroll = Math.max(scroll, carouselProgress);

	updateCase1GrainBlurRadius(
		damped,
		effectiveScroll,
		delta,
		config,
		frame.viewportWidth ?? (typeof window !== "undefined" ? window.innerWidth : 1920),
		Boolean(frame.openedCase),
	);

	return damped.current;
}
