import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { getLetterSnakeVolume, LETTER_SNAKE_SOUND } from "./letterSnakeSound.js";

function fixture() {
	const gates = { audible: true, fading: false, visible: true };
	const source = readFileSync(new URL("./CapabilitySceneSound.js", import.meta.url), "utf8")
		.replace(/^import .*;\r?$/gm, "").replace("export class CapabilitySceneSound", "class CapabilitySceneSound");
	const Sound = vm.runInNewContext(`${source}\nCapabilitySceneSound`, {
		getLetterSnakeVolume, LETTER_SNAKE_SOUND,
		LightTrailSoundMotion: class { reset() {} },
		registerSiteSoundMuteHandler: () => () => {},
		registerPageVisibilitySoundHandlers: () => () => {},
		isSoundAudible: () => gates.audible,
		isSiteSoundMuteFading: () => gates.fading,
		isPageSoundAllowed: () => gates.visible,
		getMasterAudioContext: () => ({ state: "running" }),
	});
	const sound = new Sound();
	sound.buffers = {};
	const driven = [];
	sound._start = key => {
		const voice = { key };
		sound.voices.set(key, voice); sound.entries.add(voice);
		return voice;
	};
	sound._drive = (voice, volume) => driven.push({ key: voice.key, volume });
	sound._fade = voice => { if (voice) sound.voices.delete(voice.key); };
	return { sound, driven, gates };
}

test("an owned hotspot sounds during partial entry and reverses with its painted letters", () => {
	const { sound, driven } = fixture();
	const frame = { enabled: false, hoverEnabled: true, reveal: 0, hoverReveals: [0.3] };
	sound.update(1 / 60, frame);
	sound.update(1 / 60, { ...frame, reveal: 0.2, hoverReveals: [0.32] });
	assert.equal(driven.length, 1);
	assert.equal(driven[0].key, "letter-flow");
	assert.ok(driven[0].volume > 0);
	sound.update(1 / 60, { ...frame, hoverReveals: [0.3] });
	assert.equal(driven[1].volume, driven[0].volume);
	sound.update(1 / 60, frame);
	assert.equal(sound.voices.size, 0, "settled labels fade to silence");
});

test("losing pointer ownership stays silent and cannot replay hidden progress on return", () => {
	const { sound, driven } = fixture();
	const frame = { enabled: true, hoverEnabled: false, reveal: 0, hoverReveals: [0.3] };
	sound.update(1 / 60, frame);
	sound.update(1 / 60, { ...frame, hoverReveals: [0.6] });
	sound.update(1 / 60, { ...frame, hoverEnabled: true, hoverReveals: [0.6] });
	assert.equal(driven.length, 0);
	sound.update(1 / 60, { ...frame, hoverEnabled: true, hoverReveals: [0.62] });
	assert.equal(driven.length, 1);
});

test("mute, hidden page, unprepared and disposed audio block even owned hotspot motion", () => {
	for (const block of [f => { f.gates.audible = false; }, f => { f.gates.fading = true; },
		f => { f.gates.visible = false; }, f => { f.sound.buffers = null; }, f => { f.sound.disposed = true; }]) {
		const f = fixture(); block(f);
		for (const progress of [0.3, 0.32]) f.sound.update(1 / 60, {
			enabled: false, hoverEnabled: true, reveal: 0, hoverReveals: [progress],
		});
		assert.equal(f.driven.length, 0);
	}
});

test("other capability scenes retain their existing default hover gate", () => {
	const { sound, driven } = fixture();
	for (const progress of [0.3, 0.32]) sound.update(1 / 60, {
		enabled: true, reveal: 0, hoverReveals: [progress],
	});
	assert.equal(driven.length, 1);
});

test("incoming HUD letters keep full interaction gain while background visibility is zero", () => {
	const { sound, driven } = fixture();
	const frame = { enabled: false, hudEnabled: true, visibility: 0, hudVisibility: 1, reveal: 0 };
	for (const hudReveal of [0.3, 0.32, 0.3]) sound.update(1 / 60, { ...frame, hudReveal });
	assert.equal(driven.length, 2);
	assert.ok(driven.every(voice => voice.key === "letter-flow" && voice.volume > 0));
	sound.update(1 / 60, { ...frame, hudEnabled: false, hudReveal: 0.28 });
	assert.equal(sound.voices.size, 0);
	sound.update(1 / 60, { ...frame, hudReveal: 0.28 });
	assert.equal(driven.length, 2, "no catch-up playback after regaining ownership");
});

test("all capability worlds use pointer ownership for interactive audio, not route activation", () => {
	const source = readFileSync(new URL("../three/scenes/capabilities/CapabilityWorldScene.js", import.meta.url), "utf8");
	const method = source.slice(source.indexOf("\tupdate(delta, frame) {"), source.indexOf("\n\tbeginWarmupDraw()"));
	const Scene = vm.runInNewContext(`class Scene { ${method} }\nScene`, {
		getLoaderCurtainRemainingMs: () => 0,
		THREE: { MathUtils: { damp: value => value, clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)) } },
	});
	for (const sceneVariant of ["syntheticCore", "spatialMatrix", "lightTrails"]) {
		const scene = new Scene();
		scene.capability = { sceneVariant }; scene.sceneId = sceneVariant;
		scene.store = { appStarted: true, hexShaderProgress: 0.5 };
		scene.cameraParallax = { x: 0, y: 0 }; scene.root = { visible: true };
		scene._enableWorld = () => {};
		let textFrame, coreFrame;
		scene.world = { update() {}, setInteractionEnabled() {}, assemblyUniform: { value: 0 },
			sound: { update: (_d, _p, _t, state) => { coreFrame = state; } } };
		scene.sceneSound = { update: (_d, state) => { textFrame = state; } };
		const frame = { camera: {}, activeSceneId: "portfolio", interactionEnabled: true, pointer: { x: 0, y: 0 } };
		scene.update(1 / 60, frame);
		assert.equal(textFrame.enabled, false);
		assert.equal(textFrame.hudEnabled, true);
		assert.equal(textFrame.hudVisibility, 1);
		assert.equal(coreFrame.interactionEnabled, true);
		assert.equal(coreFrame.visibility, 0, "incoming ambient sound stays silent");
		for (const blocked of [{ pointerBlocked: true }, { interactionEnabled: false }]) {
			scene.update(1 / 60, { ...frame, ...blocked });
			assert.equal(textFrame.hudEnabled, false);
			assert.equal(coreFrame.interactionEnabled, false);
		}
		scene.store.appStarted = false;
		scene.update(1 / 60, frame);
		assert.equal(textFrame.hudEnabled, false);
		assert.equal(coreFrame.interactionEnabled, false);
	}
});

test("crane passes hotspot ownership to audio before becoming the fully opened scene", () => {
	const source = readFileSync(new URL("../three/scenes/capabilities/mmk1/Mmk1CapabilityScene.js", import.meta.url), "utf8");
	const method = source.slice(source.indexOf("\tupdate(delta, frame) {"), source.indexOf("\n\tbeginWarmupDraw()"));
	const Scene = vm.runInNewContext(`class Base { update() {} }\nclass Scene extends Base { ${method} }\nScene`, {
		getLoaderCurtainRemainingMs: () => 0,
		INTRO_SOUND_SAMPLE_RANGE: {},
	});
	const scene = new Scene();
	scene.showCase = true; scene.sceneId = "mmk1";
	scene.store = { appStarted: true, hexShaderProgress: 0.5 };
	let state;
	scene.sceneSound = { update: (_delta, next) => { state = next; } };
	scene._cameraHotspots = { active: true, update: () => true };
	scene.update(1 / 60, { activeSceneId: "home" });
	assert.equal(state.enabled, false);
	assert.equal(state.hoverEnabled, true);
	scene._cameraHotspots.active = false;
	scene.update(1 / 60, { activeSceneId: "home", pointerBlocked: true });
	assert.equal(state.hoverEnabled, false);
	scene._cameraHotspots.active = true;
	scene.store.appStarted = false;
	scene.update(1 / 60, { activeSceneId: "mmk1" });
	assert.equal(state.hoverEnabled, false, "preloader warm draws cannot play hover audio");
});
