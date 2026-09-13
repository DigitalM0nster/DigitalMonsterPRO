import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { HexScrubVoice } from "./hexScrubVoice.js";

const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function buffer(channels = 2, length = 2000, sampleRate = 1000) {
	const data = Array.from({ length: channels }, (_, channel) => Float32Array.from({ length }, (_, i) => channel + i / length));
	return { numberOfChannels: channels, length, sampleRate, duration: length / sampleRate, getChannelData: channel => data[channel] };
}

function audioHarness() {
	const sources = [], gains = [], panners = [];
	let bufferCreates = 0;
	const param = () => ({ value: 0, cancelScheduledValues() {}, setValueAtTime(v) { this.value = v; }, linearRampToValueAtTime(v) { this.value = v; } });
	const node = () => ({ connect() {}, disconnect() { this.disconnected = true; } });
	const context = {
		currentTime: 0, state: "running", listener: null,
		createBuffer(...args) { bufferCreates++; return buffer(...args); },
		createGain() { const gain = { ...node(), gain: param() }; gains.push(gain); return gain; },
		createPanner() { const pan = { ...node(), positionX: param(), positionY: param(), positionZ: param() }; panners.push(pan); return pan; },
		createBufferSource() {
			const source = { ...node(), playbackRate: { value: 1 }, alive: false, ended: false, stopAt: Infinity,
				start(at, offset) { this.alive = true; this.startAt = at; this.offset = offset; },
				stop(at = context.currentTime) { this.stopAt = at; if (at <= context.currentTime) this.finish(); },
				finish() { if (this.ended) return; this.ended = true; this.alive = false; this.onended?.(); },
			};
			sources.push(source); return source;
		},
		advance(dt) {
			const previous = this.currentTime;
			this.currentTime += dt;
			for (const source of sources) {
				if (!source.alive) continue;
				const end = Math.min(this.currentTime, source.stopAt);
				source.offset += Math.max(0, end - Math.max(previous, source.startAt)) * source.playbackRate.value;
				if (source.offset >= source.buffer.duration || this.currentTime >= source.stopAt) source.finish();
			}
		},
	};
	return { context, sources, gains, panners, get bufferCreates() { return bufferCreates; }, voice(b = buffer()) { return new HexScrubVoice(context, b, node()); } };
}

test("PCM position follows the audio clock and integrates playback-rate changes without new sources", async () => {
	const h = audioHarness(), voice = h.voice(buffer(1, 10000));
	voice.currentTime = 0.5;
	await voice.play();
	h.context.advance(0.25); assert.equal(voice.currentTime, 0.75);
	voice.playbackRate = 2;
	h.context.advance(0.25); assert.equal(voice.currentTime, 1.25);
	voice.playbackRate = 0.5;
	h.context.advance(0.5); assert.equal(voice.currentTime, 1.5);
	assert.equal(h.sources.length, 1); assert.equal(h.gains.length, 2);
	voice.pause(); h.context.advance(1);
	assert.equal(voice.currentTime, 1.5); assert.equal(voice.paused, true);
});

test("seeks crossfade with at most two live sources and retain all gain nodes", async () => {
	const h = audioHarness(), voice = h.voice();
	await voice.play();
	for (let i = 0; i < 30; i++) {
		voice.currentTime = 0.1 + i * 0.01;
		assert.ok(h.sources.filter(s => s.alive).length <= 2);
		h.context.advance(0.001);
	}
	assert.equal(h.gains.length, 2);
	h.context.advance(0.006);
	assert.equal(h.sources.filter(s => s.alive).length, 1);
	assert.ok(Math.abs(voice.currentTime - 0.397) < 1e-8);
	assert.equal(voice.paused, false, "old onended callbacks cannot end the replacement source");
});

test("natural PCM end never loops; seeking back permits a deliberate restart", async () => {
	const h = audioHarness(), voice = h.voice(buffer(1, 1000));
	voice.currentTime = 0.98; voice.playbackRate = 0.22; await voice.play();
	h.context.advance(0.08);
	assert.equal(voice.ended, false, "last20ms lasts according to the real0.22 rate");
	h.context.advance(0.02); assert.equal(voice.ended, true); assert.equal(voice.currentTime, 1);
	for (let i = 0; i < 30; i++) await voice.play();
	assert.equal(h.sources.length, 1);
	voice.currentTime = 0.5; await voice.play();
	assert.equal(h.sources.length, 2); assert.equal(voice.ended, false);
});

test("pause/resume and dispose preserve position and clean up every source and retained gain", async () => {
	const h = audioHarness(), voice = h.voice();
	await voice.play(); h.context.advance(0.2); voice.pause();
	h.context.advance(0.01); assert.equal(h.sources.filter(s => s.alive).length, 0);
	assert.equal(voice.currentTime, 0.2);
	await voice.play(); h.context.advance(0.1);
	assert.ok(Math.abs(voice.currentTime - 0.3) < 1e-8);
	voice.dispose(); voice.dispose(); await voice.play();
	assert.equal(h.sources.filter(s => s.alive).length, 0);
	assert.ok(h.sources.every(s => s.disconnected)); assert.ok(h.gains.every(g => g.disconnected));
	assert.equal(voice.buffer, null);
});

function controllerHarness({ suspended = false, deferDecode = false, mobile = false } = {}) {
	const h = audioHarness(); h.context.state = suspended ? "suspended" : "running";
	const forward = buffer(2, 1104);
	let decodes = 0, resumes = 0, resolveDecode;
	const source = readFileSync(new URL("./hexTransitionSound.js", import.meta.url), "utf8");
	const Controller = vm.runInNewContext(`${source.replace(/^import[\s\S]*?;\r?\n/gm, "").replaceAll("export ", "")}\nHexTransitionSoundController`, {
		HexScrubVoice, window: {}, store: { openedCase: false }, isMobileGraphicsDevice: () => mobile,
		getMasterAudioContext: () => h.context, connectNodeToMasterBus() {},
		loadAudioBuffer() { decodes++; return deferDecode ? new Promise(resolve => { resolveDecode = resolve; }) : Promise.resolve(forward); },
		resumeMasterAudioContext() { resumes++; return Promise.resolve(); }, suspendMasterAudioContext() {},
		isPageSoundAllowed: () => true, isSoundAudible: () => true,
		registerPageVisibilitySoundHandlers() {}, registerSiteSoundMuteHandler() {},
		CAROUSEL_PROGRESS_SEGMENT_END: 1, CAROUSEL_PROGRESS_SMOOTH: 10, isCarouselRoutePage: () => true,
		Audio: function () { throw new Error("HTML media must not be constructed"); },
		Blob: function () { throw new Error("WAV encoding must not be used"); },
	});
	return { ...h, subject: new Controller(), forward, resolveDecode: () => resolveDecode?.(forward), get decodes() { return decodes; }, get resumes() { return resumes; } };
}

test("preload prepares both PCM polarities while suspended without HTML media, resume or a playing source", async () => {
	const h = controllerHarness({ suspended: true });
	await h.subject.preload(); await h.subject.preload();
	assert.equal(h.subject._ready, true); assert.equal(h.decodes, 1); assert.equal(h.resumes, 0);
	assert.equal(h.sources.length, 0); assert.equal(h.gains.length, 6); assert.equal(h.panners.length, 2);
	assert.equal(h.subject._audio.buffer, h.forward);
	assert.equal(h.subject._audio.duration, h.subject._audioReversed.duration);
	for (let ch = 0; ch < 2; ch++) {
		assert.deepEqual(h.subject._audioReversed.buffer.getChannelData(ch), h.forward.getChannelData(ch).slice().reverse());
	}
	h.subject.dispose(); assert.ok(h.gains.every(g => g.disconnected)); assert.ok(h.panners.every(p => p.disconnected));
});

test("dispose during decode cannot create delayed voices or retain their audio graph", async () => {
	const h = controllerHarness({ deferDecode: true });
	const ready = h.subject.preload(); h.subject.dispose(); h.resolveDecode(); await ready;
	assert.equal(h.subject._ready, false); assert.equal(h.subject._audio, null);
	assert.equal(h.gains.length, 0); assert.equal(h.sources.length, 0);
});

test("mobile hex voices stay three times quieter through reversal, fades, mute and restart", async () => {
	for (const mobile of [false, true]) {
		const h = controllerHarness({ mobile });
		await h.subject.preload();
		const expected = mobile ? 0.24 : 0.72;
		const assertVolume = () => {
			assert.equal(h.subject._forwardGain.gain.value, expected);
			assert.equal(h.subject._reverseGain.gain.value, expected);
		};
		assertVolume();
		for (const direction of [1, -1]) {
			h.subject._playScrub(direction, 1, 0.5);
			await settle();
			assertVolume();
			h.subject._pauseAtRest();
			h.subject._tickFadeOut(0.07);
			assert.ok(h.subject._forwardGain.gain.value < expected);
			h.subject._tickFadeOut(0.08);
			assertVolume();
		}
		h.subject._beginSiteMuteFade(100);
		h.subject._tickFadeOut(0.05);
		h.subject._cancelSiteMuteFade();
		assertVolume();
		h.subject._stop(true);
		h.subject._playScrub(1, 1, 0.2);
		await settle();
		assertVolume();
		h.subject.dispose();
	}
});

test("real PCM controller reverse plus held/chasing tail uses bounded sources and no new buffers or gain nodes", async () => {
	const h = controllerHarness(); await h.subject.preload();
	const gainCount = h.gains.length;
	h.subject._lastProgress = 0.85; h.subject._lastProgressTarget = 0;
	for (let i = 1; i <= 240; i++) {
		h.context.advance(1 / 60);
		const progress = i <= 180 ? 0.85 * Math.exp(-4 * i / 60) : 0;
		h.subject.update(1 / 60, { progress, progressTarget: 0 }, { currentPage: "/" });
		await settle();
	}
	assert.ok(h.sources.length <= 8, `unexpected source churn: ${h.sources.length}`);
	assert.equal(h.gains.length, gainCount); assert.equal(h.decodes, 1);
	assert.equal(h.subject._audioReversed.paused, true);
	assert.equal(h.sources.filter(s => s.alive).length, 0);
});
