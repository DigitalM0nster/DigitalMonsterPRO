import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { LightTrailSoundMotion } from "./lightTrailSoundMotion.js";

function fixture() {
	const sources = [];
	const gates = { audible: true, visible: true };
	const parameter = () => ({ value: 0, cancelScheduledValues() {}, setValueAtTime(value) { this.value = value; },
		setTargetAtTime(value, at, smoothing) { this.target = { value, at, smoothing }; } });
	const node = extra => ({ connect() {}, disconnect() {}, ...extra });
	const ctx = { currentTime: 0, state: "running",
		createGain: () => node({ gain: parameter() }),
		createBiquadFilter: () => node({ frequency: parameter(), Q: parameter() }),
		createBufferSource: () => {
			const source = node({ playbackRate: parameter(),
				start() { sources.push(this); }, stop(at) { this.endsAt = at; } });
			return source;
		},
	};
	const source = readFileSync(new URL("./CapabilitySceneSound.js", import.meta.url), "utf8")
		.replace(/^import .*;\r?$/gm, "").replace("export class CapabilitySceneSound", "class CapabilitySceneSound");
	const Sound = vm.runInNewContext(`${source}\nCapabilitySceneSound`, {
		LightTrailSoundMotion,
		getMasterAudioContext: () => ctx,
		connectGainWithPanToMasterBus: () => node({ pan: parameter() }),
		registerSiteSoundMuteHandler: () => () => {},
		registerPageVisibilitySoundHandlers: () => () => {},
		isSoundAudible: () => gates.audible,
		isSiteSoundMuteFading: () => false,
		isPageSoundAllowed: () => gates.visible,
	});
	const sound = new Sound();
	sound.buffers = { flight: { duration: 8 }, movement: { duration: 26 }, glide: { duration: 31 } };
	const world = { trailChainData: new Float32Array(42 * 7 * 4), cameraBank: 0 };
	const advance = delta => {
		ctx.currentTime += delta;
		for (const source of sources) if (!source.ended && source.endsAt <= ctx.currentTime) {
			source.ended = true; source.onended();
		}
	};
	return { sound, world, sources, gates, advance, ctx };
}

test("flight retains three continuous sources through gestures and recording loop boundaries", () => {
	for (const fps of [30, 60, 144]) {
		const { sound, world, sources, advance, ctx } = fixture();
		for (let frame = 0; frame < 40 * fps; frame++) {
			advance(1 / fps);
			const x = Math.sin(ctx.currentTime * 4) * 1.5;
			for (let i = 0; i < world.trailChainData.length; i += 4) world.trailChainData[i] = x;
			sound._flight(1 / fps, world, 1);
		}
		assert.equal(sources.length, 3, "gestures and direction reversals never restart or stack whooshes");
		assert.ok(sources.every(source => source.loop && !source.ended && source.endsAt > ctx.currentTime));
		assert.equal(sound.voices.get("movement").source.playbackRate.target.value, 1, "idle laser pitch stays stable");
		const glide = sound.voices.get("glide");
		assert.ok(glide.source.playbackRate.target.value >= 0.96 && glide.source.playbackRate.target.value <= 1.04);
		assert.equal(glide.source.playbackRate.target.smoothing, 0.24);
		advance(0.5);
		assert.equal(sound.entries.size, 0, "a stopped scene cannot leave an orphaned loop playing");
	}
});

test("mute, hidden page and scene leave stop flight; return starts at the quiet idle balance", () => {
	for (const block of ["audible", "visible", "enabled"]) {
		const { sound, world, gates, advance } = fixture();
		const frame = { enabled: true, reveal: 0, flightWorld: world };
		sound.update(1 / 60, frame);
		sound.flightMotion.amount = 1;
		if (block === "enabled") frame.enabled = false;
		else gates[block] = false;
		sound.update(1 / 60, frame);
		advance(0.5);
		assert.equal(sound.entries.size, 0);
		frame.enabled = true; gates.audible = true; gates.visible = true;
		sound.update(1 / 60, frame);
		assert.equal(sound.voices.size, 3);
		assert.equal(sound.flightMotion.amount, 0);
		// Check the live gain target, before the separate dormant-frame watchdog.
		const volumes = {};
		sound._drive = (voice, volume) => { volumes[voice.key] = volume; };
		sound._flight(1 / 60, world, 1);
		assert.equal(volumes.flight, 0.011);
		assert.equal(volumes.movement, 0.02);
		assert.equal(volumes.glide, 0);
	}
});
