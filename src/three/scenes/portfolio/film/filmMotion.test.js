import test from "node:test";
import assert from "node:assert/strict";
import { FilmMotion, getFilmLayout } from "./filmMotion.js";
import { dispatchLocalSceneScroll, registerLocalSceneScroll } from "../../../render/transition/localSceneScroll.js";

function settle(motion) { for (let i = 0; i < 600; i++) motion.update(1 / 60); }

test("project arrows navigate in both directions", () => {
	const motion = new FilmMotion(5);
	assert.equal(motion.step(1), true);
	settle(motion);
	assert.equal(motion.index, 1);
	assert.equal(motion.busy, false);
	motion.select(4);
	settle(motion);
	assert.equal(motion.step(-1), true);
	settle(motion);
	assert.equal(motion.index, 3);
});

test("immediate reverse selection restores the same project without a visual jump", () => {
	const motion = new FilmMotion(5);
	motion.step(1);
	for (let i = 0; i < 12; i++) motion.update(1 / 60);
	const before = motion.progress;
	motion.step(-1);
	assert.equal(motion.progress, before, "input must not teleport the painted state");
	settle(motion);
	assert.equal(motion.index, 0);
	assert.equal(motion.progress, 0);
});

test("a click during arrow navigation waits for its segment, then reaches the requested project", () => {
	const motion = new FilmMotion(5);
	motion.step(1);
	assert.equal(motion.target, 1);
	assert.equal(motion.select(4), true);
	assert.equal(motion.destination, 1);
	settle(motion);
	assert.equal(motion.index, 4);
});

test("rapid next clicks accumulate and coalesce into the latest destination", () => {
	const motion = new FilmMotion(5);
	motion.step(1);
	for (let i = 0; i < 10; i++) motion.update(1 / 60);
	const progress = motion.progress;
	motion.step(1);
	motion.step(1);
	assert.equal(motion.selectionIndex, 3);
	assert.equal(motion.destination, 1);
	assert.equal(motion.progress, progress);
	const commits = [];let previous = motion.index;
	for (let i = 0; i < 600; i++) {
		motion.update(1 / 60);
		if (motion.index !== previous) { commits.push(motion.index); previous = motion.index; }
	}
	assert.deepEqual(commits, [1, 3], "finish the running mix and jump straight to the latest request");
	assert.equal(motion.busy, false);
	assert.equal(motion.requestedIndex, null);
});

test("direct selections use the last click, including a return to the current source", () => {
	const motion = new FilmMotion(5);
	motion.select(3);
	motion.update(1 / 60);
	const progress = motion.progress;
	for (const index of [4, 2, 0]) assert.equal(motion.select(index), true);
	assert.equal(motion.destination, 3);
	assert.equal(motion.progress, progress);
	settle(motion);
	assert.equal(motion.index, 0);
	assert.equal(motion.busy, false);
});

test("mixed arrows and direct clicks count from the latest requested project and wrap", () => {
	const motion = new FilmMotion(5);
	motion.step(-1);
	assert.equal(motion.target, -1, "previous wraps backwards from first to last");
	motion.step(-1);
	motion.select(1);
	motion.step(1);
	motion.step(1);
	motion.step(-1);
	assert.equal(motion.selectionIndex, 2);
	assert.equal(motion.destination, 4);
	settle(motion);
	assert.equal(motion.index, 2);
});

test("another click during the follow-up mix schedules the next reconciliation", () => {
	const motion = new FilmMotion(5);
	motion.select(1);
	motion.select(3);
	for (let i = 0; i < 600 && motion.index !== 1; i++) motion.update(1 / 60);
	assert.equal(motion.destination, 3);
	assert.equal(motion.busy, true, "no idle playback frame between queued transitions");
	motion.select(2);
	assert.equal(motion.destination, 3);
	settle(motion);
	assert.equal(motion.index, 2);
});

test("invalid selections cannot overwrite a valid pending request", () => {
	const motion = new FilmMotion(5);
	motion.select(4);
	for (const index of [-1, 5, NaN, 1.5]) assert.equal(motion.select(index), false);
	assert.equal(motion.selectionIndex, 4);
	settle(motion);
	assert.equal(motion.index, 4);
});

test("only the current scene receives locally delegated input; cleanup preserves a newer owner", () => {
	const first = registerLocalSceneScroll("portfolioHub", () => true);
	const second = registerLocalSceneScroll("portfolioHub", () => false);
	first();
	assert.equal(dispatchLocalSceneScroll("portfolioHub", 100), false);
	assert.equal(dispatchLocalSceneScroll("contacts", 100), false);
	second();
	assert.equal(dispatchLocalSceneScroll("portfolioHub", 100), false);
});

test("film fits phone, tablet, laptop and wide viewports", () => {
	for (const [w, h] of [[360, 800], [768, 1024], [1366, 768], [2560, 1080]]) {
		const layout = getFilmLayout(w / h);
		const viewportWidth = 2 * Math.tan(Math.PI / 9) * 10 * w / h;
		assert.ok(Math.abs(layout.x) + layout.width * 0.54 < viewportWidth / 2);
		const bottom = layout.y - layout.height * .65;
		const top = layout.y + layout.height * .65 + (layout.compact ? 1.1 : 0);
		assert.ok(bottom > -3.64 && top < 3.64, `curved frame and upper metadata visible at ${w}×${h}`);
	}
});
