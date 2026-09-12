import test from "node:test";
import assert from "node:assert/strict";
import { SceneTextLocale, canAdvanceSceneText } from "./sceneTextLocale.js";

function tick(motion, locale, count = 1, requested = true, fps = 60) {
	for (let i = 0; i < count; i++) {
		const previous = motion.reveal, language = motion.locale;
		const natural = motion.busy ? previous : Math.max(0, Math.min(1, previous + (requested ? 1 : -1) / fps));
		motion.update(1 / fps, locale, natural, requested);
		if (motion.locale !== language) assert.equal(motion.reveal, 0, "atlas cell switches only while invisible");
		assert.ok(Math.abs(motion.reveal - previous) <= 1 / fps / 0.48 + 1e-8, "no playhead snap");
	}
}

test("locale clicks during natural appearance wait for its endpoint and coalesce", () => {
	const motion = new SceneTextLocale();
	motion.update(0, "ru", 0);
	motion.update(0.02, "en", 0.3);
	assert.equal(motion.locale, 0); assert.equal(motion.busy, false);
	motion.update(0.02, "zh", 0.7);
	assert.equal(motion.locale, 0); assert.equal(motion.reveal, 0.7);
	motion.update(0.02, "zh", 1);
	assert.equal(motion.phase, -1); assert.equal(motion.locale, 0);
	tick(motion, "zh", 140);
	assert.equal(motion.locale, 2); assert.equal(motion.reveal, 1); assert.equal(motion.busy, false);
});

test("a newly opened scene starts directly in the selected locale", () => {
	const motion = new SceneTextLocale();
	motion.update(1 / 60, "en", 0.02);
	assert.equal(motion.locale, 1); assert.equal(motion.busy, false);
	motion.reset();
	motion.update(1 / 60, "zh", 0.02);
	assert.equal(motion.locale, 2); assert.equal(motion.busy, false);
});

test("requests during locale disappearance select only the last language at zero", () => {
	const motion = new SceneTextLocale();
	motion.update(0, "ru", 1);
	tick(motion, "en", 9);
	assert.equal(motion.locale, 0);
	tick(motion, "zh", 25);
	assert.equal(motion.locale, 2);
	assert.equal(motion.phase, 1);
});

test("a new request during appearance waits for full appearance before another hide", () => {
	const motion = new SceneTextLocale();
	motion.update(0, "ru", 1);
	tick(motion, "en", 34);
	assert.equal(motion.locale, 1); assert.equal(motion.phase, 1);
	tick(motion, "zh", 20);
	assert.equal(motion.locale, 1); assert.equal(motion.phase, 1);
	let completed = false;
	for (let i = 0; i < 180; i++) {
		if (motion.locale === 1 && motion.reveal === 1) completed = true;
		tick(motion, "zh");
		if (motion.locale === 2) assert.ok(completed);
	}
	assert.equal(motion.locale, 2); assert.equal(motion.reveal, 1);
});

test("natural disappearance is not interrupted; hidden and dormant text do not animate", () => {
	const motion = new SceneTextLocale();
	motion.update(0, "ru", 1);
	motion.update(0.02, "zh", 0.6, false);
	assert.equal(motion.locale, 0); assert.equal(motion.busy, false);
	motion.update(0.02, "zh", 0, false);
	assert.equal(motion.locale, 2); assert.equal(motion.reveal, 0); assert.equal(motion.busy, false);
	motion.update(0, "en", 1);
	assert.equal(motion.locale, 2); assert.equal(motion.busy, false);
	motion.reset();
	motion.update(0, "en", 0);
	assert.equal(motion.locale, 1);
});

test("cancelled locale selection avoids an unnecessary swap; frame rates reach identical rest", () => {
	for (const fps of [30, 60, 144]) {
		const motion = new SceneTextLocale();
		motion.update(0, "ru", 0.3);
		motion.update(1 / fps, "en", 0.6);
		motion.update(1 / fps, "ru", 1);
		assert.equal(motion.busy, false);
		tick(motion, "en", fps * 3, true, fps);
		assert.equal(motion.locale, 1); assert.equal(motion.reveal, 1); assert.equal(motion.busy, false);
	}
});

test("scroll ownership never freezes an animation, but never runs dormant pages", () => {
	assert.equal(canAdvanceSceneText({ started: true, current: true, transitioning: true }, true), true);
	assert.equal(canAdvanceSceneText({ started: true, current: false, transitioning: true }, true), true);
	assert.equal(canAdvanceSceneText({ started: true, current: false, transitioning: false }, true), false);
	assert.equal(canAdvanceSceneText({ started: true, current: false, transitioning: true }, false), false);
	assert.equal(canAdvanceSceneText({ started: false, current: true, transitioning: false }, true), false);
});
