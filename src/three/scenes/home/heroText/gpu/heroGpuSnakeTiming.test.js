import assert from "node:assert/strict";
import test from "node:test";
import { Vector4 } from "three";
import { HeroGpuSnakeMotion, resolveHeroGpuSnakeTiming } from "./heroGpuSnakeTiming.js";

const lines = [
	{ id: 0, lastWave: 5, lastIndex: 1, lastCount: 3 },
	{ id: 1, lastWave: 2, lastIndex: 0, lastCount: 3 },
	{ id: 2, lastWave: 3, lastIndex: 1, lastCount: 2 },
];

test("GPU locale waves preserve the original letter/symbol timings and per-line budget", () => {
	assert.deepEqual(resolveHeroGpuSnakeTiming(lines).scales.map(x => x.duration), [760, 360, 360]);
	const timing = resolveHeroGpuSnakeTiming(lines, { timeBudgetMs: 400, slowMotion: 2 });
	assert.deepEqual(timing.scales.map(x => x.duration), [800, 720, 720]);
	assert.equal(timing.scales[0].scale, 400 / 760 * 2);
});

function setup() {
	const uniforms = {
		uLocaleFrom: { value: 0 }, uLocaleTo: { value: 0 }, uSnakeTime: { value: -1 },
		uSnakeTiming: { value: new Vector4() }, uLineScales: { value: new Float32Array(6) },
	};
	const variants = lines.map(line => ({ lines: [line] }));
	return { uniforms, motion: new HeroGpuSnakeMotion(uniforms, variants, () => ({})) };
}

test("one finite playhead settles on the selected locale and does no idle work", async () => {
	const { uniforms, motion } = setup();
	const run = motion.start(1);
	assert.equal(run.duration, 1044);
	assert.equal(uniforms.uSnakeTiming.value.w, 684);
	motion.update(-1);
	assert.equal(uniforms.uSnakeTime.value, 0);
	for (let i = 0; i < 11; i++) motion.update(0.1);
	await run.promise;
	assert.equal(motion.current, 1);
	assert.equal(motion.pending, null);
	assert.equal(uniforms.uSnakeTime.value, -1);
	motion.update(1);
	assert.equal(uniforms.uSnakeTime.value, -1);
	assert.equal(motion.start(1).duration, 0);
});

test("early overlap cannot truncate outgoing text; dormant/dispose finish releases waiters", async () => {
	const { uniforms, motion } = setup();
	const first = motion.start(1, { appearOverlapRatio: 0 });
	assert.equal(first.duration, 760);
	motion.update(0.03);
	const second = motion.start(2);
	await first.promise;
	assert.equal(uniforms.uLocaleFrom.value, 1);
	motion.finish();
	await second.promise;
	assert.equal(motion.current, 2);
	assert.equal(uniforms.uLocaleTo.value, 2);
	motion.set(0);
	assert.equal(motion.pending, null);
	assert.equal(uniforms.uLocaleFrom.value, 0);
});
