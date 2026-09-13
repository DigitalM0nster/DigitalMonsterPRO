import test from "node:test";
import assert from "node:assert/strict";
import { advanceLoadingProgress, resolveLoadingTarget } from "./loadingProgress.js";

test("completed file requests cannot make an unwarmed application look nearly ready", () => {
	const files = { loaded: 200, total: 200 };
	assert.ok(resolveLoadingTarget(files) <= 30);
	const compiling = resolveLoadingTarget({ ...files, preparation: 0.52 });
	assert.ok(compiling > 50 && compiling < 80);
	// Time and additional requests do not advance the GPU portion.
	assert.equal(resolveLoadingTarget({ loaded: 400, total: 400, preparation: 0.52 }), compiling);
	assert.ok(resolveLoadingTarget({ ...files, preparation: 1 }) < 100);
	assert.equal(resolveLoadingTarget({ ready: true }), 100);
});

test("empty and invalid progress remain finite and bounded before the final readiness gate", () => {
	for (const input of [{}, { total: 0 }, { loaded: Infinity, total: 2 },
		{ loaded: -1, total: 3, preparation: NaN }, { loaded: 10, total: 1, preparation: 8 }]) {
		const value = resolveLoadingTarget(input);
		assert.ok(Number.isFinite(value) && value >= 0 && value < 100);
	}
});

test("a stalled resource stage keeps the displayed integer moving within two seconds", () => {
	let progress = 39, lastInteger = 39, lastChange = 0;
	for (let tick = 1; tick <= 400; tick++) {
		const previous = progress;
		progress = advanceLoadingProgress(progress, 39, 0.08);
		assert.ok(progress >= previous && progress < 99.5);
		if (Math.floor(progress) !== lastInteger) {
			lastInteger = Math.floor(progress);
			lastChange = tick * 0.08;
		}
		assert.ok(tick * 0.08 - lastChange < 2);
	}
});

test("estimated motion never unlocks Start, and real readiness completes promptly", () => {
	let progress = 39;
	for (let tick = 0; tick < 4000; tick++) progress = advanceLoadingProgress(progress, 39, 0.08);
	assert.equal(progress, 99);
	assert.equal(advanceLoadingProgress(progress, 100, 0.08, true), 100);
	assert.equal(advanceLoadingProgress(40, 20, 0.08), 40.06);
	assert.equal(advanceLoadingProgress(40, 90, NaN), 40);
});
