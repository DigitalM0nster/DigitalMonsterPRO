// The renderer's pixel ratio describes the final canvas. Scene buffers have
// their own ratio so sharper UI never silently increases 3D or bloom cost.
const sceneRatios = new WeakMap();

export function setScenePixelRatio(renderer, ratio) {
	sceneRatios.set(renderer, ratio);
}

export function getScenePixelRatio(renderer) {
	return sceneRatios.get(renderer) ?? renderer.getPixelRatio();
}

export function resolveOutputPixelRatio(tier, sceneRatio, deviceRatio, width, height) {
	const native = Number.isFinite(deviceRatio) ? deviceRatio : 1;
	// Native phone typography: only the final canvas/overlay grows, never the
	// scene, hex or bloom buffers. Bound large tablet/landscape outputs too.
	if (width > 0 && width <= 1024 && height > 0) {
		return Math.max(sceneRatio, Math.min(3, native, Math.sqrt(4000000 / (width * height))));
	}
	if (tier !== "medium") return sceneRatio;
	// Bound the inexpensive final blit too: at most DPR 2 / one 4K frame.
	const pixelBudget = Math.sqrt(8294400 / Math.max(1, width * height));
	return Math.max(sceneRatio, Math.min(2, native, pixelBudget));
}
