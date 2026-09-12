import { canAdvanceSceneText } from "../typography/sceneTextLocale.js";

export const CITY_TITLE_DELAY = 1.5;
export const CITY_TITLE_REVEAL_DURATION = 1.15;

/** Keep an already started reveal moving through a mix; dormancy owns reset. */
export function advanceCityTitle(elapsed, delta, state) {
	const reveal = cityTitleReveal(elapsed);
	if (!canAdvanceSceneText(state, reveal > 0 && reveal < 1)) return elapsed;
	return Math.min(CITY_TITLE_DELAY + CITY_TITLE_REVEAL_DURATION, elapsed + Math.max(0, delta));
}

export function cityTitleReveal(elapsed) {
	return Math.max(0, Math.min(1, (elapsed - CITY_TITLE_DELAY) / CITY_TITLE_REVEAL_DURATION));
}
