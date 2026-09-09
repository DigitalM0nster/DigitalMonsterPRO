import test from "node:test";
import assert from "node:assert/strict";
import { advanceCityTitle, cityTitleReveal, CITY_TITLE_DELAY, CITY_TITLE_REVEAL_DURATION } from "./cityTitleMotion.js";

const idle = { started: true, current: true, transitioning: false };

test("preloader, hidden scenes and incoming hex do not spend the opening delay", () => {
	for (const state of [{ ...idle, started: false }, { ...idle, current: false }, { ...idle, transitioning: true }]) {
		assert.equal(advanceCityTitle(0, 20, state), 0);
	}
	assert.equal(cityTitleReveal(CITY_TITLE_DELAY), 0);
	assert.equal(cityTitleReveal(advanceCityTitle(0, 1.49, idle)), 0);
	assert.ok(cityTitleReveal(advanceCityTitle(1.49, 0.02, idle)) > 0);
});

test("a partial reveal survives a reversed hex without a flash or restart", () => {
	const elapsed = CITY_TITLE_DELAY + 0.4;
	const paused = advanceCityTitle(elapsed, 4, { ...idle, transitioning: true });
	assert.equal(paused, elapsed);
	assert.equal(advanceCityTitle(paused, 4, { ...idle, current: false }), elapsed);
	assert.ok(cityTitleReveal(advanceCityTitle(paused, 0.1, idle)) > cityTitleReveal(paused));
});

test("delay and reveal are frame-rate independent and settle at an inexpensive rest", () => {
	for (const fps of [30, 60, 144]) {
		let elapsed = 0;
		for (let i = 0; i < fps * 4; i++) elapsed = advanceCityTitle(elapsed, 1 / fps, idle);
		assert.equal(elapsed, CITY_TITLE_DELAY + CITY_TITLE_REVEAL_DURATION);
		assert.equal(cityTitleReveal(elapsed), 1);
		assert.equal(advanceCityTitle(elapsed, 1, idle), elapsed);
	}
});
