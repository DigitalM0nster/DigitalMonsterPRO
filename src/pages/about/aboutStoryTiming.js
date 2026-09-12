function clamp01(value) {
	return Math.max(0, Math.min(1, Number(value) || 0));
}

/** Text2 rests here with the model open and its front plate still intact. */
export const ABOUT_OPEN_STORY_ANCHOR = 0.5;
const HUD_MIX_SPEED = 4 * 1.75;
const MODEL_OPEN_SPEED = 1.35;

/** 1.75 times the existing first-quarter wipe speed, on every text segment. */
export function stageLocalToHudMix(local) {
	return clamp01(clamp01(local) * HUD_MIX_SPEED);
}

/** Slightly lead the opening motion; preserve all motion after the intact-plate anchor. */
export function aboutStoryToModelProgress(story) {
	const s = Math.max(0, Math.min(4, Number(story) || 0));
	return s < ABOUT_OPEN_STORY_ANCHOR
		? Math.min(ABOUT_OPEN_STORY_ANCHOR, s * MODEL_OPEN_SPEED)
		: s;
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
