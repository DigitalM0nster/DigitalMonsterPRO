/** The approved sphere letter voice, shared by GPU and DOM text snakes. */
export const LETTER_SNAKE_SOUND = Object.freeze({
	soundId: "about_particles",
	volume: 2.6 * 3 * .02,
	rate: .96,
	cutoff: 7200,
	q: .4,
	attack: .015,
	tail: .08,
});

/** Follow the painted playhead; resets and settled glyphs are silent. */
export function getLetterSnakeVolume(delta, previous, progress, gain = 1) {
	if (!Number.isFinite(delta) || !Number.isFinite(previous) || !Number.isFinite(progress)
		|| !Number.isFinite(gain) || delta <= 0 || gain <= 0) return 0;
	const difference = progress - previous, speed = difference / Math.max(.001, delta);
	if (Math.abs(difference) > .5 || Math.abs(speed) < .015) return 0;
	const remaining = speed > 0 ? 1 - progress : progress;
	const tail = Math.max(0, Math.min(1, remaining / LETTER_SNAKE_SOUND.tail));
	return LETTER_SNAKE_SOUND.volume * gain * Math.min(1, Math.abs(speed) * 1.2) * tail * tail * (3 - 2 * tail);
}
