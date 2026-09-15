/** File delivery is only part of startup; most of the bar belongs to preparation. */
export function resolveLoadingTarget({ loaded = 0, total = 0, preparation = 0, ready = false } = {}) {
	if (ready) return 100;
	const fraction = Number.isFinite(total) && total > 0 && Number.isFinite(loaded)
		? Math.max(0, Math.min(1, loaded / total)) : 0;
	const prepared = Number.isFinite(preparation) ? Math.max(0, Math.min(1, preparation)) : 0;
	return 10 + 20 * fraction + 69 * prepared;
}

/** Estimated display progress; only the actual warm/font gate can finish it. */
export function advanceLoadingProgress(previous, target, dtSec, ready = false) {
	// Readiness is authoritative. Do not spend another second animating an
	// estimate after every resource, decoded buffer and GPU warm draw is done.
	if (ready) return 100;
	const dt = Number.isFinite(dtSec) ? Math.max(0, Math.min(0.25, dtSec)) : 0;
	const ceiling = 99;
	const current = Math.max(0, Math.min(ceiling, previous));
	const gap = Math.max(0, target - current);
	// At least one integer step per 1.34s, including long asset/compile stages.
	// Do not let a stage's discrete target pin the display between completions.
	const rate = Math.min(8, Math.max(0.75, 0.65 + gap * 0.35));
	return Math.min(ceiling, current + rate * dt);
}
