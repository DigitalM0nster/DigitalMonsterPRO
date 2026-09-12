import test from "node:test";
import assert from "node:assert/strict";
import { aboutStoryToModelProgress, aboutStoryToFrontDissolve, stageLocalToHudMix, getAboutStorySegment } from "./aboutStoryTiming.js";
import { applyLocalSegmentTargetRest, chaseSegmentValue } from "../../three/render/transition/segmentScrollSpring.js";

test("every text transition is 1.75 times faster than the previous quarter-stage wipe", () => {
	for (const previousLocal of [0, 0.05, 0.1, 0.2, 0.25]) {
		assert.ok(Math.abs(stageLocalToHudMix(previousLocal / 1.75) - previousLocal * 4) < 1e-12);
	}
	assert.equal(stageLocalToHudMix(1 / 7), 1);
	assert.equal(stageLocalToHudMix(1), 1);
});

test("text2's anchor holds the slightly open model with no front-plate dissolve", () => {
	assert.ok(aboutStoryToModelProgress(0.2) > 0.2);
	assert.equal(stageLocalToHudMix(0.5), 1);
	assert.equal(aboutStoryToModelProgress(0.5), 0.5);
	for (const story of [0, 0.125, 0.25, 0.4, 0.5]) {
		assert.equal(aboutStoryToFrontDissolve(story), 0);
	}
	assert.equal(aboutStoryToFrontDissolve(0.75), 0.5);
	assert.equal(aboutStoryToFrontDissolve(1), 1);
});

test("the canonical spring settles at the opening anchor from both directions", () => {
	for (const fps of [30, 60, 144]) {
		for (const [initial, expected] of [[0.1, 0], [0.32, 0.5], [0.65, 0.5], [0.9, 1], [1.3, 1], [1.8, 2]]) {
			let target = initial;
			let current = initial;
			for (let frame = 0; frame < fps * 15; frame++) {
				const { start, span, local } = getAboutStorySegment(target);
				target = start + span * applyLocalSegmentTargetRest(local, 1 / fps, {
					returnSmooth: 0.7, advanceSmooth: 0.7, retreatSmooth: 0.7, finalMul: 6,
				});
				current = chaseSegmentValue(current, target, 1 / fps, { smooth: 2.2 });
			}
			assert.ok(Math.abs(current - expected) < 1e-4, `${fps}fps: ${initial} → ${current}`);
			assert.equal(target, expected);
			if (expected === 0.5) assert.equal(aboutStoryToFrontDissolve(target), 0);
		}
	}
});

test("motion beyond the opening anchor and all route-edge poses keep their original timing", () => {
	for (let i = 50; i <= 400; i++) {
		const story = i / 100;
		assert.equal(aboutStoryToModelProgress(story), story);
	}
	assert.equal(aboutStoryToModelProgress(-1.5), 0);
	assert.equal(aboutStoryToModelProgress(5.5), 4);
	assert.ok(aboutStoryToModelProgress(0.500001) - aboutStoryToModelProgress(0.499999) < 0.000002);
});
