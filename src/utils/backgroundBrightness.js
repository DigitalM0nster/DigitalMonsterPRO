import { case1PostProcessConfig } from "../three/scenes/portfolio/case1/case1PostProcessConfig.js";

/**
 * Целевая яркость HDR-фона по маршруту (синхронно с BackgroundPipeline).
 * @param {string} page
 */
export function getBackgroundBrightnessTarget(page) {
	// На главной фон — DigitalWhaleScene; HDR liquid почти выключен.
	return page === "/" ? 0.75 : (case1PostProcessConfig.background.brightness ?? 0.01);
}

/** Fallback, если в dev-конфиге нет поля. */
export const CAROUSEL_BACKGROUND_BRIGHTNESS = 0.025;
export const CAROUSEL_BACKGROUND_LIQUID_SCALE = 1;

/** Liquid-фон карусели — из case1PostProcessConfig (панель B). */
export function getCarouselBackgroundTargets() {
	const bg = case1PostProcessConfig.background;

	return {
		brightness: bg.brightness ?? CAROUSEL_BACKGROUND_BRIGHTNESS,
		scale: bg.liquidScale ?? CAROUSEL_BACKGROUND_LIQUID_SCALE,
		distortionColor: bg.distortionColor ?? "#1b476f",
	};
}

export function getInitialBackgroundBrightness() {
	if (typeof window === "undefined") {
		return 0.012;
	}
	return getBackgroundBrightnessTarget(window.location.pathname);
}
