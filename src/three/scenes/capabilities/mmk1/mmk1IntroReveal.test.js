import test from "node:test";
import assert from "node:assert/strict";
import { advanceMmk1IntroReveal, mmk1IntroSoundReveal } from "./mmk1IntroReveal.js";
import { Mmk1HotspotDetails } from "./Mmk1HotspotDetails.js";
import { SceneTextLocale } from "../typography/sceneTextLocale.js";

test("overview begins on the first eligible scene frame, without a second delay after the curtain", () => {
	const details = Object.create(Mmk1HotspotDetails.prototype);
	details.markers = Array.from({ length: 4 }, (_, i) => ({ name: `marker-${i}` }));
	details.panels = Array.from({ length: 5 }, () => ({ material: { uniforms: {
		uSnake: { value: 0 }, uReveal: { value: 0 }, uDetails: { value: 0 },
		uLocale: { value: 0 }, uMarkerTime: { value: 0 },
	} } }));
	details.localeMotions = Array.from({ length: 5 }, () => new SceneTextLocale());
	details.bloomMesh = { visible: false };
	const reveal = details.panels[4].material.uniforms.uReveal;
	details.update(1 / 60, null, null, "ru", { started: false, current: true });
	details.update(1 / 60, null, null, "ru", { started: true, current: false });
	assert.equal(reveal.value, 0, "preparation and dormant frames stay hidden");
	details.update(1 / 60, null, null, "ru", { started: true, current: true });
	assert.ok(reveal.value > 0, "no blank pause after the scene becomes available");
	for (let i = 0; i < 37; i++) details.update(1 / 60, null, null, "ru", { started: true, current: true });
	assert.equal(reveal.value, 1);
	assert.equal(details.bloomMesh.visible, false, "settled text adds no light draw");
});

test("intro completes in 620 ms and reverses without resetting", () => {
	const appearing = advanceMmk1IntroReveal(0, true, 0.248);
	assert.ok(Math.abs(appearing - 0.4) < 1e-9);
	const leaving = advanceMmk1IntroReveal(appearing, false, 0.124);
	assert.ok(Math.abs(leaving - 0.2) < 1e-9);
	assert.ok(Math.abs(advanceMmk1IntroReveal(leaving, true, 0.124) - appearing) < 1e-9);
	assert.equal(advanceMmk1IntroReveal(0, true, 0.62), 1);
	assert.equal(advanceMmk1IntroReveal(1, false, 0.62), 0);
	assert.equal(advanceMmk1IntroReveal(appearing, true, -1), appearing);
});

test("intro sound follows occupied text, excluding empty atlas margins in both directions", () => {
	const right = 0.8;
	const start = (1 - right) * 0.72;
	const end = (1 - 8 / 560) * 0.72 + 0.28;
	assert.equal(mmk1IntroSoundReveal(0, right), 0);
	assert.equal(mmk1IntroSoundReveal(start, right), 0);
	assert.ok(Math.abs(mmk1IntroSoundReveal((start + end) / 2, right) - 0.5) < 1e-9);
	assert.equal(mmk1IntroSoundReveal(end, right), 1);
	assert.equal(mmk1IntroSoundReveal(1, right), 1);
});
