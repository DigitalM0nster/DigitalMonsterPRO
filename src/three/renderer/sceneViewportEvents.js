// Heavy UI painters follow the renderer's committed viewport, not every
// intermediate Safari address-bar resize. Initial painting stays caller-owned.
const EVENT = "digitalmonster:scene-viewport-resize";

export function publishSceneViewportResize(width, height) {
	window.dispatchEvent(new CustomEvent(EVENT, { detail: { width, height } }));
}

export function subscribeSceneViewportResize(callback) {
	const listener = event => callback(event.detail);
	window.addEventListener(EVENT, listener);
	return () => window.removeEventListener(EVENT, listener);
}
