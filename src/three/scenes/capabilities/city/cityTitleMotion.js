export const CITY_TITLE_DELAY = 1.5;
export const CITY_TITLE_REVEAL_DURATION = 1.15;

/** Pause through a mix, including a cancelled leave; only dormancy resets the title. */
export function advanceCityTitle(elapsed, delta, { started, current, transitioning }) {
	if (!started || !current || transitioning) return elapsed;
	return Math.min(CITY_TITLE_DELAY + CITY_TITLE_REVEAL_DURATION, elapsed + Math.max(0, delta));
}

export function cityTitleReveal(elapsed) {
	return Math.max(0, Math.min(1, (elapsed - CITY_TITLE_DELAY) / CITY_TITLE_REVEAL_DURATION));
}
