import { canAdvanceSceneText } from "../typography/sceneTextLocale.js";

export const CITY_TITLE_DELAY = 0.15;
export const CITY_TITLE_REVEAL_DURATION = 0.95;

/** Keep an already started reveal moving through a mix; dormancy owns reset. */
export function advanceCityTitle(elapsed, delta, state) {
	const reveal = cityTitleReveal(elapsed);
	if (!canAdvanceSceneText(state, reveal > 0 && reveal < 1)) return elapsed;
	return Math.min(CITY_TITLE_DELAY + CITY_TITLE_REVEAL_DURATION, elapsed + Math.max(0, delta));
}

export function cityTitleReveal(elapsed) {
	if (elapsed >= CITY_TITLE_DELAY + CITY_TITLE_REVEAL_DURATION) return 1;
	return Math.max(0, Math.min(1, (elapsed - CITY_TITLE_DELAY) / CITY_TITLE_REVEAL_DURATION));
}
