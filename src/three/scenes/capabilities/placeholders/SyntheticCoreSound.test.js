import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function fixture() {
	const gates = { audible: true, visible: true, fading: false };
	const source = readFileSync(new URL("./SyntheticCoreSound.js", import.meta.url), "utf8")
		.replace(/^import .*;\r?$/gm, "").replace("export class SyntheticCoreSound", "class SyntheticCoreSound");
	const Sound = vm.runInNewContext(`${source}\nSyntheticCoreSound`, {
		registerSiteSoundMuteHandler: () => () => {}, registerPageVisibilitySoundHandlers: () => () => {},
		isSoundAudible: () => gates.audible, isPageSoundAllowed: () => gates.visible,
		isSiteSoundMuteFading: () => gates.fading, getMasterAudioContext: () => ({ state: "running" }),
	});
	const sound = new Sound(), levels = new Map();
	sound.buffers = {};
	sound._loop = (key, volume) => levels.set(key, volume);
	sound._opening = (_dt, _progress, _speed, gain) => levels.set("openingGain", gain);
	const frame = { enabled: false, visibility: 0, interactionEnabled: true, interactionVisibility: 1,
		pointer: { x: 0, y: 0 }, hud: { sphereHovered: true,
			uniforms: { uViewport: { value: { x: 1920, y: 1080 } }, uCoreHover: { value: 1 } },
			lens: { material: { uniforms: { uProbe: { value: 0 } } } } } };
	return { sound, levels, frame, gates };
}

test("incoming sphere hover and surface motion sound without activating the ambient bed", () => {
	const { sound, levels, frame } = fixture();
	sound.update(1 / 60, 0, 0, frame);
	assert.ok(levels.get("hover") > 0);
	assert.equal(levels.get("light"), 0);
	assert.equal(levels.get("flow"), 0);
	frame.pointer.x = 0.01;
	sound.update(1 / 60, 0, 0.016, frame);
	assert.ok(levels.get("surface") > 0);
	assert.equal(levels.get("openingGain"), 1);
	frame.interactionEnabled = false; frame.enabled = true; frame.visibility = 0.5;
	sound.update(1 / 60, 0, 0.032, frame);
	assert.equal(levels.get("hover"), 0);
	assert.equal(levels.get("surface"), 0);
});

test("hidden, muted, unprepared and unowned sphere motion cannot start audio", () => {
	for (const block of [f => { f.gates.audible = false; }, f => { f.gates.visible = false; },
		f => { f.gates.fading = true; }, f => { f.sound.buffers = null; },
		f => { f.frame.interactionEnabled = false; }, f => { f.sound.disposed = true; }]) {
		const f = fixture(); block(f);
		f.sound.update(1 / 60, 0.3, 1, f.frame);
		assert.equal(f.levels.size, 0);
	}
});
