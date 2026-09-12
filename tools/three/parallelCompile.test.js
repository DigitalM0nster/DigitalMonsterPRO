import test from "node:test";
import assert from "node:assert/strict";
import { patchThreeParallelCompile, waitForPrograms } from "./parallelCompile.js";

function harness() {
	const ticks = [], queries = [];
	const gl = {
		LINK_STATUS: 1,
		getProgramParameter: program => { queries.push(program); return program.valid !== false; },
		getProgramInfoLog: () => "syntax error",
	};
	const makeProgram = () => ({
		program: {}, ready: false, reflections: 0,
		isReady() { return this.ready; },
		getUniforms() { this.reflections++; }, getAttributes() { this.reflections++; },
	});
	return { ticks, queries, gl, makeProgram, nextTick: fn => ticks.push(fn) };
}

test("pending programs never query logs/status/reflection; readiness waits for every variant", async () => {
	const h = harness(), first = h.makeProgram(), second = h.makeProgram(), scene = {};
	let resolved = false;
	const ready = waitForPrograms(new Set([first, second]), h.gl, () => false, scene, h.nextTick);
	ready.then(() => { resolved = true; });
	assert.deepEqual(h.queries, []);
	first.ready = true;
	h.ticks.shift()();
	await Promise.resolve();
	assert.equal(resolved, false);
	assert.equal(first.reflections, 2);
	assert.equal(second.reflections, 0);
	second.ready = true;
	h.ticks.shift()();
	assert.equal(await ready, scene);
	assert.deepEqual(h.queries, [first.program, second.program]);
	assert.equal(h.ticks.length, 0);
});

test("a completed but invalid shader rejects instead of unlocking preparation", async () => {
	const h = harness(), program = h.makeProgram();
	program.ready = true; program.program.valid = false;
	await assert.rejects(waitForPrograms(new Set([program]), h.gl, () => false, {}, h.nextTick), /syntax error/);
	assert.equal(program.reflections, 0);
	assert.equal(h.ticks.length, 0);
});

test("context loss or disposal during polling cancels without querying destroyed GL resources", async () => {
	for (const disposeProgram of [false, true]) {
		const h = harness(), program = h.makeProgram();
		let cancelled = false;
		const ready = waitForPrograms(new Set([program]), h.gl, () => cancelled, {}, h.nextTick);
		const rejected = assert.rejects(ready, { name: "AbortError" });
		if (disposeProgram) program.program = undefined;
		else cancelled = true;
		h.ticks.shift()();
		await rejected;
		assert.deepEqual(h.queries, []);
		assert.equal(h.ticks.length, 0);
	}
});

test("the backport refuses an unreviewed Three source version", () => {
	assert.throws(() => patchThreeParallelCompile("different Three source"), /Three source changed/);
});
