import test from "node:test";
import assert from "node:assert/strict";
import { NARRATIVE_COPY, NARRATIVE_DELAY, CORE_NARRATIVE_DELAY, TRAIL_PHRASE_DURATION, TRAIL_VISIBLE_DURATION, advanceNarrative, narrativeFrame, coreNarrativeLayout, trailNarrativeWallPosition } from "./capabilityNarrativeContent.js";

test("narrative reading time waits for the active scene, but a running reveal finishes through a mix", () => {
	const active = { started: true, current: true, transitioning: false };
	for (const flags of [{ started: false }, { current: false }, { transitioning: true }]) {
		assert.equal(advanceNarrative(3, 0.02, { ...active, ...flags }), 3);
	}
	assert.equal(advanceNarrative(3, 0.02, active), 3.02);
	assert.equal(advanceNarrative(3, 10, active), 3.05);
	for (const variant of ["lightTrails", "syntheticCore"]) {
		const start = (variant === "syntheticCore" ? CORE_NARRATIVE_DELAY : NARRATIVE_DELAY) + 0.2;
		for (const current of [true, false]) {
			const next = advanceNarrative(start, 0.02, { ...active, current, transitioning: true }, variant);
			assert.ok(narrativeFrame(next, variant).reveal > narrativeFrame(start, variant).reveal);
		}
	}
	const disappearing = NARRATIVE_DELAY + TRAIL_VISIBLE_DURATION - 0.4;
	assert.ok(narrativeFrame(advanceNarrative(disappearing, 0.02, { ...active, transitioning: true }), "lightTrails").reveal
		< narrativeFrame(disappearing, "lightTrails").reveal);
	for (const variant of Object.keys(NARRATIVE_COPY)) {
		const delay = variant === "syntheticCore" ? CORE_NARRATIVE_DELAY : NARRATIVE_DELAY;
		assert.equal(narrativeFrame(delay, variant).reveal, 0);
		assert.equal(narrativeFrame(delay + 1.2, variant).reveal, 1);
	}
});

test("core text starts promptly without changing the tunnel caption timing", () => {
	assert.equal(narrativeFrame(0, "syntheticCore").reveal, 0);
	assert.ok(narrativeFrame(0.3, "syntheticCore").reveal > 0.1);
	assert.equal(narrativeFrame(1.3, "syntheticCore").reveal, 1);
	assert.equal(narrativeFrame(1.3, "lightTrails").reveal, 0);
});

test("all six phrases alternate sides, leave a blank gap, and repeat without a visible cut", () => {
	for (let i = 0; i <= 12; i++) {
		const start = NARRATIVE_DELAY + i * TRAIL_PHRASE_DURATION;
		const reading = narrativeFrame(start + 3, "lightTrails");
		assert.equal(reading.state, i % 6);
		assert.equal(reading.side, i % 2 ? -1 : 1);
		assert.equal(reading.reveal, 1);
		assert.equal(narrativeFrame(start + TRAIL_VISIBLE_DURATION + 0.2, "lightTrails").reveal, 0);
		assert.ok(narrativeFrame(start + TRAIL_PHRASE_DURATION + 0.00001, "lightTrails").reveal < 0.0001);
	}
	for (const locale of NARRATIVE_COPY.lightTrails) assert.equal(locale.length, 6);
});

test("core copy and helper occupy separate readable bounds on desktop and portrait mobile", () => {
	for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [1440, 900], [1920, 1080]]) {
		const box = coreNarrativeLayout(width, height);
		assert.ok(box.x >= 0 && box.x + box.width <= width);
		assert.ok(box.y + box.height < height - box.helperY - 24);
		assert.ok(box.helperX + 244 <= width);
	}
});

test("upright tunnel captions clear the ribs at their fixed spawn point", () => {
	for (const side of [-1, 1]) {
		const from = trailNarrativeWallPosition(side, 36);
		const outerX = Math.abs(from.x) + 20 * Math.cos(50 * Math.PI / 180);
		const topY = from.y + 40 * 384 / 1024 / 2;
		// The closest top corner stays inside the ribs' 0.91-radius triangle.
		assert.ok(outerX * Math.sqrt(3) / 2 + topY / 2 < 36 * 0.91 - 0.4);
		assert.deepEqual(trailNarrativeWallPosition(side, 36), from);
	}
});
