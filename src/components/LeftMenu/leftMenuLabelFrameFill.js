/** Заливка на светлом HDR (главная) — не чистый белый, низкая alpha. */
const LIGHT_FILL = { r: 160, g: 195, b: 220, a: 0.06 };
/** Заливка на тёмном HDR (портфолио и внутренние страницы). */
const DARK_FILL = { r: 6, g: 10, b: 18, a: 0.95 };

/** Яркость HDR-фона: главная ≈1, портфолио ≈0.02–0.3 */
const BRIGHTNESS_MIN = 0.025;
const BRIGHTNESS_MAX = 0.95;

function clamp01(value) {
	return Math.min(1, Math.max(0, value));
}

function mixChannel(from, to, t) {
	return Math.round(from + (to - from) * t);
}

/**
 * Левый цвет заливки рамки — светлый на светлом фоне, тёмный на тёмном.
 *
 * Линейный mix rgb и alpha одновременно даёт «белую вспышку» посередине перехода:
 * rgb уже светлый, а alpha ещё заметная. Поэтому alpha падает быстрее, rgb — медленнее.
 *
 * @param {number} brightness
 */
export function getLeftMenuLabelFrameFillColor(brightness = 1) {
	const t = clamp01((brightness - BRIGHTNESS_MIN) / (BRIGHTNESS_MAX - BRIGHTNESS_MIN));

	// Сначала убираем плотность заливки, потом осветляем оттенок
	const alphaT = 1 - (1 - t) ** 2;
	const rgbT = t ** 3;

	return {
		r: mixChannel(DARK_FILL.r, LIGHT_FILL.r, rgbT),
		g: mixChannel(DARK_FILL.g, LIGHT_FILL.g, rgbT),
		b: mixChannel(DARK_FILL.b, LIGHT_FILL.b, rgbT),
		a: DARK_FILL.a + (LIGHT_FILL.a - DARK_FILL.a) * alphaT,
	};
}

/** @deprecated используй getLeftMenuLabelFrameFillColor */
export function getLeftMenuLabelFrameFill(brightness = 1) {
	const { r, g, b, a } = getLeftMenuLabelFrameFillColor(brightness);
	return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
}
