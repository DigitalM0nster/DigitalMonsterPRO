import test from "node:test";
import assert from "node:assert/strict";
import { LightTrailSoundMotion } from "./lightTrailSoundMotion.js";

function positions(time, speed, opposing = false) {
	const data = new Float32Array(42 * 7 * 4);
	for (let strand = 0; strand < 7; strand++) for (let point = 0; point < 42; point++) {
		const offset = (strand * 42 + point) * 4;
		// Three pairs cancel their centroid perfectly; the seventh strand stays still.
		const direction = opposing ? strand === 6 ? 0 : strand % 2 ? -1 : 1 : 1;
		data[offset] = time * speed * direction;
		data[offset + 2] = time * 16;
	}
	return data;
}

test("opposing visible strands still produce motion energy", () => {
	const motion = new LightTrailSoundMotion();
	for (let frame = 0; frame < 60; frame++) motion.update(1 / 60, positions(frame / 60, 6, true));
	assert.ok(motion.amount > 0.8);
	assert.ok(Math.abs(motion.pan) < 0.00001);
});

test("forward flight adds no accent; slower gestures stay below fast gestures", () => {
	const levels = [];
	for (const speed of [0, 1.5, 6]) {
		const motion = new LightTrailSoundMotion();
		for (let frame = 0; frame < 60; frame++) motion.update(1 / 60, positions(frame / 60, speed));
		levels.push(motion.amount);
	}
	assert.equal(levels[0], 0);
	assert.ok(levels[1] > 0.1 && levels[1] < 0.3);
	assert.ok(levels[2] > levels[1] * 4);
});

test("attack, release and stereo remain stable across frame rates", () => {
	const results = [];
	for (const fps of [30, 60, 144]) {
		const motion = new LightTrailSoundMotion();
		for (let frame = 0; frame <= fps; frame++) motion.update(1 / fps, positions(frame / fps, 6));
		const active = motion.amount;
		const held = positions(1, 6);
		for (let frame = 0; frame < fps; frame++) motion.update(1 / fps, held);
		assert.ok(motion.amount > 0 && motion.amount < 0.025, "gesture accent settles smoothly while the controller retains its idle tone");
		assert.ok(motion.pan <= 0.7);
		results.push(active);
	}
	assert.ok(Math.max(...results) - Math.min(...results) < 0.00001);
});

test("page return and suspended frames do not create a false loud sweep", () => {
	const motion = new LightTrailSoundMotion();
	motion.update(1 / 60, positions(0, 6));
	motion.update(1 / 60, positions(1, 6));
	assert.equal(motion.amount, 0, "coordinate discontinuity is not a gesture");
	motion.update(1, positions(2, 6));
	assert.equal(motion.amount, 0);
	motion.reset();
	motion.update(1 / 60, positions(3, 6));
	assert.equal(motion.amount, 0);
});
