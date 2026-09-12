import test from "node:test";
import assert from "node:assert/strict";
import { advanceMmk1IntroReveal, mmk1IntroSoundReveal } from "./mmk1IntroReveal.js";

test("intro uses the trails' 0.95-second timing and reverses without resetting", () => {
	const appearing = advanceMmk1IntroReveal(0, true, 0.38);
	assert.ok(Math.abs(appearing - 0.4) < 1e-9);
	const leaving = advanceMmk1IntroReveal(appearing, false, 0.19);
	assert.ok(Math.abs(leaving - 0.2) < 1e-9);
	assert.ok(Math.abs(advanceMmk1IntroReveal(leaving, true, 0.19) - appearing) < 1e-9);
	assert.equal(advanceMmk1IntroReveal(0, true, 0.95), 1);
	assert.equal(advanceMmk1IntroReveal(1, false, 0.95), 0);
	assert.equal(advanceMmk1IntroReveal(appearing, true, -1), appearing);
});

test("intro sound follows occupied text, excluding empty atlas margins in both directions", () => {
	const right = 0.8;
	const start = (1 - right) * 0.72;
	const end = (1 - 8 / 560) * 0.72 + 0.28;
	assert.equal(mmk1IntroSoundReveal(0, right), 0);
	assert.equal(mmk1IntroSoundReveal(start, right), 0);
	assert.ok(Math.abs(mmk1IntroSoundReveal((start + end) / 2, right) - 0.5) < 1e-9);
	assert.equal(mmk1IntroSoundReveal(end, right), 1);
	assert.equal(mmk1IntroSoundReveal(1, right), 1);
});
