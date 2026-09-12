import test from "node:test";
import assert from "node:assert/strict";
import { resolveLoadingTarget } from "./loadingProgress.js";

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
