/** @typedef {(config: object, viewportWidth: number, viewportHeight: number) => { leftPx: number, topPx: number }} HeroTextLayoutProvider */

/** @type {HeroTextLayoutProvider | null} */
let layoutProvider = null;

const listeners = new Set();

/**
 * Регистрирует live-провайдер позиции (из HeroTextMesh после syncLayerPositions).
 * Scroll-hint читает те же offsetX / stack bottom, что и 3D-текст.
 */
export function registerHeroTextLayoutProvider(provider) {
	layoutProvider = provider;
	notifyHeroTextLayoutUpdated();
}

export function unregisterHeroTextLayoutProvider(provider) {
	if (layoutProvider === provider) {
		layoutProvider = null;
	}
}

export function subscribeHeroTextLayoutUpdated(listener) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function notifyHeroTextLayoutUpdated() {
	for (const listener of listeners) {
		listener();
	}
}

/**
 * @param {object} config
 * @param {number} viewportWidth
 * @param {number} viewportHeight
 * @param {HeroTextLayoutProvider} fallback
 */
export function resolveHeroScrollHintPositionWithProvider(
	config,
	viewportWidth,
	viewportHeight,
	fallback,
) {
	if (layoutProvider) {
		return layoutProvider(config, viewportWidth, viewportHeight);
	}
	return fallback(config, viewportWidth, viewportHeight);
}
