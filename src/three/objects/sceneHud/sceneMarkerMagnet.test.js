import test from "node:test";
import assert from "node:assert/strict";
import { advanceMarkerMagnet } from "./sceneMarkerMagnet.js";

const state = () => ({ offset: { x: 0, y: 0 }, velocity: { x: 0, y: 0 } });
const step = (s, x, y, dt) => advanceMarkerMagnet(s.offset, s.velocity, x, y, dt);

test("magnet eases both ends without slowing the old city's response", () => {
	const s = state();
	step(s, 30, 0, .001);
	assert.ok(s.offset.x < 9 * (1 - Math.exp(-14 * .001)), "no instant velocity jump on entry");
	step(s, 30, 0, .049); step(s, 30, 0, .05);
	assert.ok(s.offset.x >= 9 * (1 - Math.exp(-14 * .1)), "at least as responsive after 100 ms");
	step(s, 30, 0, .05);
	assert.ok(s.offset.x > 9 * .95, "settles within 150 ms");
	const velocity = s.velocity.x;
	step(s, -30, 0, .00001);
	assert.ok(Math.abs(s.velocity.x - velocity) < .2, "cursor reversal preserves velocity continuity");
	step(s, -30, 0, .05); step(s, -30, 0, .05);
	assert.ok(s.offset.x < 0 && s.velocity.x < 0, "reversal still responds promptly");
});

test("magnetic movement agrees at 30, 60 and 144 FPS and across uneven frames", () => {
	const results = [];
	for (const rate of [30, 60, 144]) {
		const s = state();
		for (let i = 0; i < rate / 2; i++) step(s, 24, 18, 1 / rate);
		results.push(s);
	}
	const uneven = state();
	for (let i = 0; i < 10; i++) { step(uneven, 24, 18, .008); step(uneven, 24, 18, .042); }
	for (const s of [...results, uneven]) {
		assert.ok(Math.abs(s.offset.x - results[0].offset.x) < 1e-10);
		assert.ok(Math.abs(s.offset.y - results[0].offset.y) < 1e-10);
	}
});

test("fast circular/reversed cursor motion stays within nine pixels and releases to rest", () => {
	const s = state();
	for (let i = 0; i < 1200; i++) {
		step(s, Math.cos(i * .35) * 40, Math.sin(i * .35) * 40, 1 / 120);
		assert.ok(Math.hypot(s.offset.x, s.offset.y) <= 9 + 1e-10);
	}
	for (let i = 0; i < 120; i++) step(s, 0, 0, 1 / 120);
	assert.deepEqual(s, state(), "inactive markers settle completely, without an idle spring tail");
});
