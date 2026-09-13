import test from "node:test";
import assert from "node:assert/strict";
import { advanceCraneReturnVisibility, craneReturnLayout, updateCraneReturn } from "./craneReturnControl.js";
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

test("return reverses its letter playhead without a reset", () => {
	let p = advanceCraneReturnVisibility(0, true, 1 / 60);
	assert.ok(p > 0 && p < 1);
	for (let i = 0; i < 32; i++) p = advanceCraneReturnVisibility(p, true, 1 / 60);
	assert.equal(p, 1);
	p = advanceCraneReturnVisibility(p, false, .05);
	assert.ok(p > 0 && p < 1);
	assert.ok(advanceCraneReturnVisibility(p, true, .02) > p);
	for (let i = 0; i < 6; i++) p = advanceCraneReturnVisibility(p, false, .05);
	assert.equal(p, 0);
});

test("return waits for all text, then exits before changing its anchor or locale", () => {
	const state = { reveal: 0, index: -1, locale: 0 };
	for (let i = 0; i < 90; i++) updateCraneReturn(state, 2, 0, false, 1 / 60);
	assert.equal(state.reveal, 0, "nothing visible during camera flight or text reveal");
	for (let i = 0; i < 32; i++) updateCraneReturn(state, 2, 0, true, 1 / 60);
	assert.equal(state.reveal, 1);
	updateCraneReturn(state, 3, 1, true, .05);
	assert.equal(state.index, 2); assert.equal(state.locale, 0);
	assert.ok(state.reveal > 0 && state.reveal < 1);
	for (let i = 0; i < 4; i++) updateCraneReturn(state, 3, 1, false, .05);
	assert.equal(state.reveal, 0);
	updateCraneReturn(state, 3, 1, false, .05);
	assert.equal(state.index, 3); assert.equal(state.locale, 1); assert.equal(state.reveal, 0);
	updateCraneReturn(state, 3, 1, true, .05);
	assert.ok(state.reveal > 0);
});
