import test from "node:test";
import assert from "node:assert/strict";
import { getLetterSnakeVolume, LETTER_SNAKE_SOUND } from "./letterSnakeSound.js";

test("the sphere's approved letter level is independent of frame rate", () => {
	for (const fps of [30, 60, 120]) {
		const delta = 1 / fps;
		assert.ok(Math.abs(getLetterSnakeVolume(delta, .4, .4 + delta) - .156) < 1e-12);
	}
});

test("forward and reverse snakes share the level and fade at their own endpoint", () => {
	const delta = 1 / 60;
	assert.equal(getLetterSnakeVolume(delta, .4, .4 + delta), getLetterSnakeVolume(delta, .6, .6 - delta));
	assert.ok(Math.abs(getLetterSnakeVolume(delta, .94, .96) - LETTER_SNAKE_SOUND.volume / 2) < 1e-12);
	assert.ok(Math.abs(getLetterSnakeVolume(delta, .06, .04) - LETTER_SNAKE_SOUND.volume / 2) < 1e-12);
	assert.equal(getLetterSnakeVolume(delta, .99, 1), 0);
	assert.equal(getLetterSnakeVolume(delta, .01, 0), 0);
});

test("settled text, lifecycle resets and invalid frames cannot trigger letters", () => {
	for (const [delta, previous, progress] of [[.016, .5, .5], [.016, 0, 1], [.016, 1, 0], [0, .2, .3], [NaN, .2, .3], [.016, .2, NaN]]) {
		assert.equal(getLetterSnakeVolume(delta, previous, progress), 0);
	}
	assert.equal(getLetterSnakeVolume(.016, .2, .3, 0), 0);
});

test("visibility attenuates the voice without changing the painted playhead", () => {
	const full = getLetterSnakeVolume(.016, .4, .416);
	assert.equal(getLetterSnakeVolume(.016, .4, .416, .25), full * .25);
	assert.equal(getLetterSnakeVolume(.016, .4, .4, .25), 0);
});
