import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { aboutStoryToModelProgress, aboutStoryToFrontDissolve, stageLocalToHudMix, getAboutStorySegment } from "./aboutStoryTiming.js";
import { applyLocalSegmentTargetRest, chaseSegmentValue } from "../../three/render/transition/segmentScrollSpring.js";

test("opening and final text wipes follow model motion, forward and backward", () => {
	for (const [start, span] of [[0, 0.5], [2, 1]]) {
		for (const direction of [1, -1]) {
			let previousMix = direction === 1 ? 0 : 1;
			let previousModel = start + (direction === 1 ? 0 : span);
			for (let step = 1; step <= 100; step++) {
				const progress = direction === 1 ? step / 100 : 1 - step / 100;
				const local = progress * span;
				const mix = stageLocalToHudMix(local, span);
				const model = aboutStoryToModelProgress(start + local);
				assert.ok((mix - previousMix) * direction > 0, "text must not finish early or wait on reverse");
				assert.ok((model - previousModel) * direction > 0, "model must not pause before the stop");
				assert.ok(Math.abs(mix - (model - start) / span) < 1e-12);
				previousMix = mix;
				previousModel = model;
			}
		}
	}
});

test("second text wipe matches opening wheel distance while retaining model timing", () => {
	const source = readFileSync(new URL("./aboutPanelHudStory.js", import.meta.url), "utf8");
	const start = source.indexOf("export function resolveAboutPanelHudStoryPair(story)");
	const end = source.indexOf("\n}", start) + 2;
	const resolvePair = vm.runInNewContext(`(${source.slice(start, end).replace("export ", "")})`, {
		clampStoryVisual: s => Math.max(0, Math.min(4, s)),
		stageLocalToHudMix, ABOUT_OPEN_STORY_ANCHOR: 0.5,
	});
	for (const delta of [0, 0.02, 0.1, 0.2, 1 / 3, 0.4, 0.2, 0.01, 0]) {
		const opening = resolvePair(delta * 1.5);
		const second = resolvePair(1 + delta);
		assert.ok(Math.abs(second.mix - opening.mix) < 1e-12);
		assert.equal(second.from, "text2");
		assert.equal(second.to, "text3");
		assert.equal(aboutStoryToModelProgress(1 + delta), 1 + delta);
	}
	assert.equal(resolvePair(1.5).mix, 1);
	assert.equal(resolvePair(2).mix, 0);
});

test("text2's anchor holds the slightly open model with no front-plate dissolve", () => {
	assert.equal(aboutStoryToModelProgress(0.2), 0.2);
	assert.equal(stageLocalToHudMix(0.5, 0.5), 1);
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
	assert.ok(Math.abs(aboutStoryToModelProgress(0.500001) - aboutStoryToModelProgress(0.499999) - 0.000002) < 1e-12);
});
