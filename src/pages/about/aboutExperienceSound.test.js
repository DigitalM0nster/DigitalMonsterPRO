import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { aboutStoryToFrontDissolve, stageLocalToHudMix } from "./aboutStoryTiming.js";

const runtime = readFileSync(new URL("./aboutExperienceRuntime.js", import.meta.url), "utf8");
const updateStart = runtime.indexOf("\tconst updateMotionSounds =");
const updateSource = runtime.slice(updateStart, runtime.indexOf("\n\t};", updateStart) + 5);

function soundHarness({ delayed = false } = {}) {
	const sources = [], timers = [];
	const param = () => ({ value: 0, cancelScheduledValues() {}, setValueAtTime(v) { this.value = v; },
		exponentialRampToValueAtTime(v) { this.value = v; }, setTargetAtTime(v) { this.value = v; } });
	const node = () => ({ connect() {}, disconnect() {}, gain: param(), frequency: param(), Q: param(), playbackRate: param() });
	const ctx = {
		currentTime: 0, createGain: node, createBiquadFilter: node,
		createBuffer(channels, length, sampleRate) {
			const data = Array.from({ length: channels }, () => new Float32Array(length));
			return { numberOfChannels: channels, length, sampleRate, duration: length / sampleRate, getChannelData: i => data[i] };
		},
		createBufferSource() {
			const source = { ...node(), started: false, stopped: false, start() { this.started = true; }, stop() { this.stopped = true; } };
			sources.push(source); return source;
		},
	};
	let finishLoad;
	const buffer = ctx.createBuffer(2, 24000, 8000);
	const loading = delayed ? new Promise(resolve => { finishLoad = resolve; }) : Promise.resolve(buffer);
	const context = {
		isPageSoundAllowed: () => true, isSoundAudible: () => true,
		registerPageVisibilitySoundHandlers() {}, registerSiteSoundMuteHandler() {},
		getMasterAudioContext: () => ctx, resumeMasterAudioContext: () => Promise.resolve(),
		connectGainWithPanToMasterBus: () => null, loadAudioBuffer: () => loading,
		SOUND_CATALOG: {}, performance: { now: () => 0 }, setTimeout: fn => timers.push(fn),
	};
	const modules = {};
	for (const name of ["aboutFrontDissolveSound", "aboutBackDissolveSound", "aboutPcbAppearSound", "aboutParticleSound", "caseStudyTextTransitionSound"]) {
		const text = readFileSync(new URL(`../../sounds/${name}.js`, import.meta.url), "utf8")
			.replace(/^import[\s\S]*?;\s*$/gm, "")
			.replace(/^export \{[^}]*\} from [^;]+;\s*$/gm, "");
		const exports = Array.from(text.matchAll(/export function (\w+)/g), match => match[1]);
		Object.assign(modules, vm.runInNewContext(`${text.replace(/^export /gm, "")}\n({${exports.join(",")}})`, { ...context }));
	}
	return { ...modules, sources, finishLoad: () => finishLoad?.(buffer), flush: () => { while (timers.length) timers.shift()(); } };
}

test("all About loops fade and stop at an anchor without requiring another animation frame", async () => {
	for (const story of [0.5, 1, 2, 3]) {
		const sounds = soundHarness();
		await Promise.all([sounds.preloadAboutFrontDissolveSound(), sounds.preloadAboutBackDissolveSound(),
			sounds.preloadAboutPcbAppearSound(), sounds.preloadAboutParticleSound(), sounds.preloadCaseStudyTextTransitionSound()]);
		sounds.updateAboutFrontDissolveSound(1 / 60, 0.4);
		sounds.updateAboutBackDissolveSound(1 / 60, 0.4);
		sounds.updateAboutPcbAppearSound(1 / 60, 0.7);
		sounds.updateAboutParticleSound(1.9, 1 / 60);
		sounds.updateCaseStudyTextTransitionSound(1 / 60, 0.4);
		assert.equal(sounds.sources.filter(s => s.started && !s.stopped).length, 5);
		const update = vm.runInNewContext(`${updateSource}\nupdateMotionSounds`, {
			...sounds, current: story, target: story, STORY_MAX: 4, aboutStoryToFrontDissolve,
			isAboutPanelHudLocaleMixBusy: () => false, clampStoryVisual: s => s,
			resolveAboutPanelHudStoryPair: s => ({ mix: s >= 3 ? 1 : stageLocalToHudMix(s % 1) }),
		});
		update(0);
		sounds.flush();
		assert.equal(sounds.sources.filter(s => s.started && !s.stopped).length, 0, `story ${story}`);
		const before = sounds.sources.length;
		update(0); sounds.flush();
		assert.equal(sounds.sources.length, before, "rest must not restart a voice");
	}
});

test("the last spring frame sends zero delta before rAF stops, including a snapped endpoint", () => {
	const start = runtime.indexOf("\tconst tick = (now)");
	const code = runtime.slice(start, runtime.indexOf("\n\tconst startAnimation", start));
	for (const story of [0.5, 1, 2]) {
		const updates = []; let requestedFrames = 0;
		const tick = vm.runInNewContext(`${code}\ntick`, {
			rafId: 0, disposed: false, ownsInput: () => true, previousFrameAt: 0,
			current: story - 0.001, target: story, STORY_MAX: 4,
			CAROUSEL_PROGRESS_COMMIT_EPS: 1e-4, CAROUSEL_PROGRESS_COMMIT_SNAP_ZONE: 0.01,
			applyStageTargetRest: () => story, getStoryChaseConfig: () => ({}),
			chaseSegmentValue: () => story, snapStoryPair: () => ({ current: story, target: story }),
			syncBoundaryDrive() {}, tryCommitRouteLeave: () => false, publish() {},
			storyNeedsAnimation: () => false, updateMotionSounds: delta => updates.push(delta),
			window: { requestAnimationFrame: () => requestedFrames++ },
		});
		tick(16);
		assert.deepEqual(updates, [0]); assert.equal(requestedFrames, 0);
	}
});

test("a late particle decode cannot restart audio after scrolling stopped", async () => {
	const sounds = soundHarness({ delayed: true });
	const ready = sounds.preloadAboutParticleSound();
	await Promise.resolve();
	await Promise.resolve();
	const before = sounds.sources.length;
	// Previously each moving update queued a callback that started an idle loop.
	sounds.updateAboutParticleSound(1.9, 1 / 60);
	sounds.updateAboutParticleSound(1.9, 0);
	sounds.finishLoad(); await ready;
	assert.equal(sounds.sources.length, before);
	sounds.updateAboutParticleSound(2, 1 / 60);
	assert.equal(sounds.sources.length, before + 1, "new painted motion resumes sound normally");
	sounds.updateAboutParticleSound(2, 0); sounds.flush();
	assert.ok(sounds.sources.every(s => s.stopped));
});
