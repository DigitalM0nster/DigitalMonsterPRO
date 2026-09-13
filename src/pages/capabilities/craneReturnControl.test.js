import test from "node:test";
import assert from "node:assert/strict";
import { advanceCraneReturnVisibility, craneReturnLayout } from "./craneReturnControl.js";
import { getMmk1DetailLayout } from "../../three/scenes/capabilities/mmk1/mmk1HotspotDetailsConfig.js";

test("every close-up owns a visible return directly below its text, clear of site navigation", () => {
	for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [844, 390], [1024, 768], [1280, 480], [1440, 900], [1920, 1080]]) {
		for (let index = 0; index < 4; index++) {
			const detail = getMmk1DetailLayout(index, width, height);
			const r = craneReturnLayout(width, height, detail);
			assert.ok(r.width >= 44 && r.height >= 44);
			assert.equal(r.x, detail.x + 16 * detail.scale, "button aligns to text ink");
			assert.equal(r.y - (height - detail.y), 12, "return stays attached to the description");
			assert.ok(r.x + r.width <= width - 16);
			assert.ok(r.y + r.height <= height - (height <= 480 ? 50 : width <= 1024 ? 64 : 36));
			if (width > 1024) assert.ok(r.x >= 120 && r.x + r.width <= width - 96);
		}
	}
});

test("return appears promptly and reverses its exit without a position or opacity reset", () => {
	let p = advanceCraneReturnVisibility(0, true, 1 / 60);
	assert.ok(p > 0 && p < 1);
	for (let i = 0; i < 14; i++) p = advanceCraneReturnVisibility(p, true, 1 / 60);
	assert.equal(p, 1);
	p = advanceCraneReturnVisibility(p, false, .05);
	assert.ok(p > 0 && p < 1);
	assert.ok(advanceCraneReturnVisibility(p, true, .02) > p);
	for (let i = 0; i < 4; i++) p = advanceCraneReturnVisibility(p, false, .05);
	assert.equal(p, 0);
});
