import test from "node:test";
import assert from "node:assert/strict";
import { getMmk1DetailRasterRatio, MMK1_DETAIL_SIZE, MMK1_DETAIL_STATE_COUNT, MMK1_DETAIL_VIEW, MMK1_OVERVIEW_VIEW } from "./mmk1HotspotDetailsConfig.js";

test("crane typography retains 2x rasterization within the 4K GPU limit", () => {
	assert.equal(getMmk1DetailRasterRatio(4096), 2);
	for (const limit of [2048, 4096, 8192]) {
		const ratio = getMmk1DetailRasterRatio(limit);
		assert.ok(MMK1_DETAIL_SIZE.width * 3 * ratio <= limit);
		assert.ok(MMK1_DETAIL_SIZE.height * MMK1_DETAIL_STATE_COUNT * ratio <= limit);
	}
	assert.ok(MMK1_DETAIL_SIZE.height * MMK1_DETAIL_STATE_COUNT < 320 * 10 / 2, "remove empty pixels and duplicate detail states before increasing density");
});

test("compact atlas crops preserve the on-screen panel height and contain every text row", () => {
	for (const [view, first, last] of [[MMK1_DETAIL_VIEW, 42 - 22, 170 + 13], [MMK1_OVERVIEW_VIEW, 34 - 19, 169 + 13]]) {
		assert.ok(Math.abs((view.uvTop - view.uvBottom) * MMK1_DETAIL_SIZE.height - view.height) < 1e-9);
		assert.ok(first >= (1 - view.uvTop) * MMK1_DETAIL_SIZE.height);
		assert.ok(last <= (1 - view.uvBottom) * MMK1_DETAIL_SIZE.height);
	}
});
