import test from "node:test";
import assert from "node:assert/strict";
import { getScenePixelRatio, setScenePixelRatio, resolveOutputPixelRatio } from "./renderResolution.js";
import { resolveRendererPixelRatio } from "../../functions/getGraphicsTier.js";

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

test("phone native DPR-3 stays on final output while prepared scenes use tier caps", () => {
	for (const tier of ["medium", "high", "low"]) {
		const renderer = { getPixelRatio: () => 2 };
		const ratio = resolveRendererPixelRatio(tier, 3, true);
		setScenePixelRatio(renderer, ratio);
		assert.equal(resolveOutputPixelRatio(tier, ratio, 3, 390, 700), 3);
		assert.equal(getScenePixelRatio(renderer), tier === "low" ? 1 : 2);
	}
});

test("native phone output respects device ratio and bounds larger compact screens", () => {
	for (const tier of ["high", "medium", "low"]) {
		assert.equal(resolveOutputPixelRatio(tier, 1, 1, 390, 700), 1);
		assert.equal(resolveOutputPixelRatio(tier, 2, 2, 390, 700), 2);
		assert.equal(resolveOutputPixelRatio(tier, 2, 4, 390, 700), 3);
		assert.equal(resolveOutputPixelRatio(tier, 2, NaN, 390, 700), 2);
		const tablet = resolveOutputPixelRatio(tier, 2, 3, 1024, 1366);
		assert.equal(tablet, 2, "pixel budget never reduces the existing scene ratio");
	}
});

test("output pixel budget bounds fill rate without degrading the scene", () => {
	assert.equal(resolveOutputPixelRatio("medium", 1, 3, 1440, 900), 2);
	assert.equal(resolveOutputPixelRatio("medium", 1, 2, 3840, 2160), 1);
	assert.equal(resolveOutputPixelRatio("medium", 1, NaN, 1440, 900), 1);
	assert.equal(resolveOutputPixelRatio("medium", 1, 0.5, 1440, 900), 1);
});
