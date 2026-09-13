import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("./hexTransitionSound.js", import.meta.url), "utf8");
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

function fixture({ suspended = false, pendingPlay = false, duration = 2, reverseDuration = duration, simulateEnded = true } = {}) {
	const counts = { seek: 0, rate: 0, play: 0, pause: 0, spatial: 0, gain: 0, resume: 0, nativeRestarts: 0 };
	let allowed = true, finishResume;
	const pendingPlays = [];
	const param = key => {
		let value = 0;
		return { get value() { return value; }, set value(next) { counts[key]++; value = next; } };
	};
	const panner = () => ({ positionX: param("spatial"), positionY: param("spatial"), positionZ: param("spatial") });
	function media(name, trackDuration) {
		let time = 0, rate = 1, ended = false;
		return { name, paused: true, duration: trackDuration, seeks: 0,
			get ended() { return ended; },
			get currentTime() { return time; }, set currentTime(next) { counts.seek++; this.seeks++; time = simulateEnded ? Math.min(trackDuration, next) : next; ended = false; },
			get playbackRate() { return rate; }, set playbackRate(next) { counts.rate++; rate = next; },
			advance(dt) {
				if (!this.paused) time += rate * dt;
				if (simulateEnded && time >= trackDuration) { time = trackDuration; this.paused = true; ended = true; }
			},
			play() {
				counts.play++;
				if (this.ended) { counts.nativeRestarts++; time = 0; ended = false; }
				if (pendingPlay) return new Promise(resolve => pendingPlays.push(resolve));
				this.paused = false; return Promise.resolve();
			},
			pause() { counts.pause++; this.paused = true; },
		};
	}
	const ctx = { state: suspended ? "suspended" : "running" };
	const Controller = vm.runInNewContext(`${source.replace(/^import[\s\S]*?;\r?\n/gm, "").replaceAll("export ", "")}\nHexTransitionSoundController`, {
		store: { openedCase: false }, window: {}, isMobileGraphicsDevice: () => false,
		isPageSoundAllowed: () => allowed, isSoundAudible: () => allowed,
		getMasterAudioContext: () => ctx, connectNodeToMasterBus() {},
		resumeMasterAudioContext() {
			counts.resume++;
			return suspended ? new Promise(resolve => { finishResume = () => { ctx.state = "running"; resolve(); }; }) : Promise.resolve();
		},
		suspendMasterAudioContext() { ctx.state = "suspended"; },
		loadAudioBuffer() { throw new Error("unexpected runtime decode"); },
		registerSiteSoundMuteHandler() {}, registerPageVisibilitySoundHandlers() {},
		CAROUSEL_PROGRESS_SEGMENT_END: 1, CAROUSEL_PROGRESS_SMOOTH: 10,
		isCarouselRoutePage: () => true,
	});
	const subject = new Controller();
	Object.assign(subject, {
		_audio: media("forward", duration), _audioReversed: media("reverse", reverseDuration),
		_ready: true, _duration: duration, _reverseDuration: reverseDuration, _ctx: ctx,
		_forwardPanner: panner(), _reversePanner: panner(),
		_forwardGain: { gain: param("gain") }, _reverseGain: { gain: param("gain") },
	});
	subject._configurePanner(subject._forwardPanner); subject._configurePanner(subject._reversePanner);
	Object.keys(counts).forEach(key => { counts[key] = 0; });
	return { subject, counts, ctx, pendingPlays,
		setAllowed(value) { allowed = value; },
		finishResume() { finishResume?.(); },
		async frame(progress, dt = 1 / 60, target = progress) {
			subject._audio?.advance(dt); subject._audioReversed?.advance(dt);
			subject.update(dt, { progress, progressTarget: target }, { currentPage: "/" });
			await settle();
		},
	};
}

async function constantMotion(reverse = false) {
	const f = fixture();
	const initial = reverse ? 0.85 : 0.1;
	f.subject._lastProgress = initial;
	f.subject._lastProgressTarget = initial;
	for (let frame = 1; frame <= 60; frame++) await f.frame(initial + (reverse ? -1 : 1) * frame * 0.6 / 60);
	return f;
}

test("reverse retains the reversed track while removing forced per-frame media seeks", async () => {
	const after = await constantMotion(true);
	assert.ok(after.counts.seek <= 2);
	assert.equal(after.subject._audio.paused, true);
	assert.equal(after.subject._audioReversed.paused, false);
	assert.ok(Math.abs(after.subject._audioReversed.currentTime - 1.5) <= 0.1);
});

test("forward scrub stays within hard-sync drift with bounded seeks and no running-context resume", async () => {
	const after = await constantMotion();
	assert.ok(after.counts.seek <= 2);
	assert.ok(Math.abs(after.subject._audio.currentTime - 1.4) <= 0.1);
	assert.equal(after.counts.resume, 0);
	assert.ok(after.counts.rate <= 2);
	assert.equal(after.counts.spatial, 120, "two Y-only writes per changed frame");
	assert.equal(after.counts.gain, 0);
});

test("real drift still seeks; immediate direction reversal selects the proper prepared polarity", async () => {
	const f = await constantMotion();
	f.subject._audio.currentTime = 0;
	let seeks = f.counts.seek;
	await f.frame(0.71);
	assert.equal(f.counts.seek, seeks + 1);
	await f.frame(0.70);
	assert.equal(f.subject._audio.paused, true);
	assert.equal(f.subject._audioReversed.paused, false);
	assert.ok(Math.abs(f.subject._audioReversed.currentTime - 0.6) < 0.02);
});

test("suspended context resumes once; resolving it after mute, rest or hide cannot start stale playback", async () => {
	for (const stop of [
		f => { f.setAllowed(false); f.subject._stop(true); },
		f => f.subject._pauseInactive(null),
		f => f.subject._suspendForPageHidden(),
	]) {
		const f = fixture({ suspended: true });
		for (let frame = 1; frame <= 30; frame++) await f.frame(frame / 100);
		assert.equal(f.counts.resume, 1);
		assert.equal(f.counts.play, 0);
		stop(f); f.finishResume(); await settle();
		assert.equal(f.counts.play, 0);
	}
});

test("after resume only a new moving frame starts playback at current painted progress", async () => {
	const f = fixture({ suspended: true });
	await f.frame(0.2); await f.frame(0.4);
	f.finishResume(); await settle();
	assert.equal(f.counts.play, 0);
	await f.frame(0.5);
	assert.equal(f.counts.play, 1);
	assert.equal(f.subject._audio.currentTime, 1);
});

test("pending HTML play is not resubmitted every animation frame", async () => {
	const f = fixture({ pendingPlay: true });
	for (let frame = 1; frame <= 30; frame++) await f.frame(frame / 100);
	assert.equal(f.counts.play, 1);
	assert.ok(f.counts.seek <= 1, "pending native play must not also trigger repeated seeks");
	assert.equal(f.pendingPlays.length, 1);
	f.pendingPlays[0](); await settle();
	assert.equal(f.subject._pendingPlay.has(f.subject._audio), false);
});

test("mute cancels pending native play and an older resolution cannot clear a newer play request", async () => {
	const f = fixture({ pendingPlay: true });
	await f.frame(0.2);
	f.subject._stop(true);
	assert.equal(f.counts.pause, 1);
	assert.equal(f.subject._pendingPlay.has(f.subject._audio), false);
	await f.frame(0.3);
	assert.equal(f.pendingPlays.length, 2);
	f.pendingPlays[0](); await settle();
	assert.equal(f.subject._pendingPlay.has(f.subject._audio), true);
	f.pendingPlays[1](); await settle();
	assert.equal(f.subject._pendingPlay.has(f.subject._audio), false);
});

test("fast spring still corrects real drift without seeking on every animation frame", async () => {
	const f = fixture();
	for (let frame = 1; frame <= 60; frame++) await f.frame(1 - Math.exp(-8 * frame / 60), 1 / 60, 1);
	assert.ok(f.counts.seek > 0 && f.counts.seek <= 12);
	assert.ok(f.counts.rate <= 25);
	assert.ok(f.counts.play <= 2);
	assert.equal(f.counts.nativeRestarts, 0);
	assert.ok(Math.abs(f.subject._audio.currentTime - 2) <= 0.1);
});

test("rest, mute and hidden-page updates keep both tracks paused without repeated native property writes", async () => {
	const f = fixture();
	await f.frame(0);
	const initial = { ...f.counts };
	for (let i = 0; i < 30; i++) await f.frame(0);
	assert.deepEqual(f.counts, initial);
	await f.frame(0.3); f.setAllowed(false); await f.frame(0.31);
	assert.equal(f.subject._audio.paused, true); assert.equal(f.subject._audioReversed.paused, true);
	const stopped = { ...f.counts };
	for (let i = 0; i < 30; i++) await f.frame(0.31);
	assert.deepEqual(f.counts, stopped);
});

test("MP3 padding does not push the shorter reversed WAV past its real end", () => {
	const f = fixture({ duration: 1.128, reverseDuration: 1.104, simulateEnded: true });
	f.subject._playScrub(-1, 1.128, 0);
	assert.ok(Math.abs(f.subject._audioReversed.currentTime - 1.104 * 0.998) < 1e-8);
	assert.ok(Math.abs(f.subject._audioReversed.playbackRate - 1.104) < 1e-8);
	assert.equal(f.counts.nativeRestarts, 0);
	f.subject._seekTo(f.subject._audioReversed, 2);
	assert.ok(f.subject._audioReversed.currentTime < 1.104);
});

test("known reversed PCM duration is used before WAV metadata becomes available", () => {
	const f = fixture({ duration: 1.128, reverseDuration: 1.104 });
	f.subject._audioReversed.duration = NaN;
	f.subject._playScrub(-1, 1.128, 0.5);
	assert.ok(Math.abs(f.subject._audioReversed.currentTime - 0.552) < 1e-8);
	assert.ok(Math.abs(f.subject._audioReversed.playbackRate - 1.104) < 1e-8);
});

test("reverse spring can finish a shorter WAV naturally without an ended/play/seek loop", async () => {
	const f = fixture({ duration: 1.128, reverseDuration: 1.104, simulateEnded: true });
	f.subject._lastProgress = 0.85; f.subject._lastProgressTarget = 0;
	for (let frame = 1; frame <= 180; frame++) await f.frame(0.85 * Math.exp(-4 * frame / 60), 1 / 60, 0);
	assert.equal(f.counts.nativeRestarts, 0);
	assert.ok(f.counts.play <= 2);
	assert.ok(f.counts.seek <= 12);
	assert.equal(f.subject._audioReversed.paused, true);
	const plays = f.counts.play;
	for (let frame = 0; frame < 60; frame++) await f.frame(0);
	assert.equal(f.counts.play, plays, "settled spring cannot spontaneously restart the clip");
});

test("ended guard still permits seeking back into the track and reversing the transition", async () => {
	const f = fixture({ duration: 1.128, reverseDuration: 1.104, simulateEnded: true });
	f.subject._audioReversed.currentTime = 1.104;
	f.subject._playScrub(-1, 1.128, 0.005);
	assert.equal(f.counts.play, 0, "the final few milliseconds are not replayed");
	f.subject._playScrub(-1, 1.128, 0.5);
	await settle();
	assert.equal(f.counts.play, 1);
	assert.equal(f.counts.nativeRestarts, 0);
	assert.ok(Math.abs(f.subject._audioReversed.currentTime - 0.552) < 1e-8);
	f.subject._playScrub(1, 1.128, 0.6);
	assert.equal(f.subject._audioReversed.paused, true);
	assert.equal(f.subject._audio.paused, false);
	assert.ok(Math.abs(f.subject._audio.currentTime - 0.6768) < 1e-8);
});

test("held/tiny-chase tail frames cannot re-arm an ended track through currentTime seeks", async () => {
	const f = fixture({ duration: 1.128, reverseDuration: 1.104, simulateEnded: true });
	f.subject._audioReversed.currentTime = 1.104;
	assert.equal(f.subject._audioReversed.ended, false, "a seek clears HTML ended state");
	f.subject._lastProgress = 0.018; f.subject._lastProgressTarget = 0.018;
	const seeks = f.subject._audioReversed.seeks;
	for (let frame = 0; frame < 40; frame++) {
		const progress = 0.018 - frame * 0.0001;
		await f.frame(progress);
		await f.frame(progress);
	}
	assert.equal(f.counts.play, 0);
	assert.equal(f.subject._audioReversed.seeks, seeks, "held frames must not keep seeking/re-arming the final20ms");
	assert.equal(f.counts.nativeRestarts, 0);
});
