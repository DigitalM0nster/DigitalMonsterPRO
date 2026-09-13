function clamp01(value) {
	return Math.max(0, Math.min(1, Number(value) || 0));
}

/** Text2 rests here with the model open and its front plate still intact. */
export const ABOUT_OPEN_STORY_ANCHOR = 0.5;

/** Text and model share the full transition interval, including on reversal. */
export function stageLocalToHudMix(local, span = 1) {
	return clamp01(clamp01(local) / span);
}

/** Scrub the authored pose directly: no early finish/hold before the opening stop. */
export function aboutStoryToModelProgress(story) {
	return Math.max(0, Math.min(4, Number(story) || 0));
}

/** Original front-shell timing: only scrolling past the opening anchor clears it. */
export function aboutStoryToFrontDissolve(story) {
	return clamp01((clamp01(story) - ABOUT_OPEN_STORY_ANCHOR) / (1 - ABOUT_OPEN_STORY_ANCHOR));
}

/** Normalize the extra opening stop onto the same 0…1 spring as all later stages. */
export function getAboutStorySegment(story) {
	const span = story >= 0 && story < 1 ? ABOUT_OPEN_STORY_ANCHOR : 1;
	const start = Math.floor(story / span + 1e-12) * span;
	return { start, span, local: (story - start) / span };
}
