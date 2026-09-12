import test from "node:test";
import assert from "node:assert/strict";
import { getScenePixelRatio, setScenePixelRatio, resolveOutputPixelRatio } from "./renderResolution.js";

test("a native Medium output does not change its scene ratio or another renderer", () => {
	const medium = { getPixelRatio: () => 2 }, high = { getPixelRatio: () => 2 };
	setScenePixelRatio(medium, 1);
	assert.equal(getScenePixelRatio(medium), 1);
	assert.equal(getScenePixelRatio(high), 2);
	for (const scale of [1, 1.25, 1.5, 2]) {
		assert.equal(resolveOutputPixelRatio("medium", 1, scale, 1440, 900), scale);
	}
	assert.equal(resolveOutputPixelRatio("high", 2, 1.25, 1440, 900), 2);
	assert.equal(resolveOutputPixelRatio("low", 1, 2, 1440, 900), 1);
});

test("output pixel budget bounds fill rate without degrading the scene", () => {
	assert.equal(resolveOutputPixelRatio("medium", 1, 3, 1440, 900), 2);
	assert.equal(resolveOutputPixelRatio("medium", 1, 2, 3840, 2160), 1);
	assert.equal(resolveOutputPixelRatio("medium", 1, NaN, 1440, 900), 1);
	assert.equal(resolveOutputPixelRatio("medium", 1, 0.5, 1440, 900), 1);
});
