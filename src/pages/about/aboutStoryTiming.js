function clamp01(value) {
	return Math.max(0, Math.min(1, Number(value) || 0));
}

/** Text2 rests here with the model open and its front plate still intact. */
export const ABOUT_OPEN_STORY_ANCHOR = 0.5;
export const ABOUT_STORY_STOPS = [0, ABOUT_OPEN_STORY_ANCHOR, 1, 2, 3, 4];

/** Critically damped exponential chase: continuous velocity on gesture/reversal.
 * Twice the old rate compensates for the eased start instead of slowing the step.
 * The existing runtime remains the only progress owner; motion stores velocity only.
 */
export function chaseAboutStoryValue(current, target, delta, smooth, motion) {
	const omega = smooth * 2;
	const offset = current - target;
	const impulse = motion.velocity + omega * offset;
	const decay = Math.exp(-omega * delta);
	const next = target + (offset + impulse * delta) * decay;
	motion.velocity = (motion.velocity - omega * impulse * delta) * decay;
	const bounded = Math.max(0, Math.min(4, next));
	if (bounded !== next) motion.velocity = 0;
	return bounded;
}

/** A gesture selects one authored pose; the runtime spring animates toward it. */
export function getAboutStoryStepTarget(story, direction) {
	return direction > 0
		? ABOUT_STORY_STOPS.find(stop => stop > story + 1e-4) ?? 4
		: ABOUT_STORY_STOPS.findLast(stop => stop < story - 1e-4) ?? 0;
}

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

/** Five equal input steps over six authored poses, including the text2 hold. */
export function getAboutStorySegment(story) {
	const span = story >= 0 && story < 1 ? ABOUT_OPEN_STORY_ANCHOR : 1;
	const start = Math.floor(story / span + 1e-12) * span;
	return { start, span, local: (story - start) / span };
}
