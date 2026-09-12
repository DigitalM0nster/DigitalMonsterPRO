/** File delivery is only part of startup; most of the bar belongs to preparation. */
export function resolveLoadingTarget({ loaded = 0, total = 0, preparation = 0, ready = false } = {}) {
	if (ready) return 100;
	const fraction = Number.isFinite(total) && total > 0 && Number.isFinite(loaded)
		? Math.max(0, Math.min(1, loaded / total)) : 0;
	const prepared = Number.isFinite(preparation) ? Math.max(0, Math.min(1, preparation)) : 0;
	return 10 + 20 * fraction + 69 * prepared;
}
