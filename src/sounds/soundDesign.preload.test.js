import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const soundSource = readFileSync(new URL("./soundDesign.js", import.meta.url), "utf8");
const mainSource = readFileSync(new URL("../app/MainContent.jsx", import.meta.url), "utf8");
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const deferred = () => {
	let resolve, reject;
	const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
	return { promise, resolve, reject };
};

function preparationFixture() {
	const decodes = [], controllers = [];
	const context = { state: "suspended" };
	const names = ["CaseStudyTextTransition", "AboutFrontDissolve", "AboutBackDissolve", "AboutParticle", "AboutPcbAppear"];
	const modules = names.map(name => ({ [`preload${name}Sound`]() {
		const job = deferred(); controllers.push(job); return job.promise;
	} }));
	const code = soundSource.slice(soundSource.indexOf("export function preloadSoundDesign()"), soundSource.indexOf("\nfunction getSoundPan("));
	const preload = vm.runInNewContext(`let soundDesignPreloadPromise = null; ${code.replace("export ", "")}\npreloadSoundDesign`, {
		window: {}, initMasterAudioBus() {}, getAudioContext: () => context,
		resumeMasterAudioContext() { throw new Error("preparation must not wait for user activation"); },
		getUniqueSoundSources: () => ["click", "underwater"],
		preloadAudioBuffers(sources, ctx) {
			assert.equal(ctx.state, "suspended"); assert.equal(sources.length, 2);
			const job = deferred(); decodes.push(job); return job.promise;
		},
		loadSoundControllerModules: async () => modules,
	});
	return { preload, decodes, controllers };
}

test("audio prepares while suspended, waits for derived buffers, and reuses readiness on Start", async () => {
	const f = preparationFixture();
	const first = f.preload();
	assert.equal(f.preload(), first);
	assert.equal(f.decodes.length, 1);
	let ready = false; first.then(() => { ready = true; });
	f.decodes[0].resolve([{ status: "fulfilled" }]); await settle();
	assert.equal(f.controllers.length, 5);
	assert.equal(ready, false);
	f.controllers.slice(0, 4).forEach(job => job.resolve()); await settle();
	assert.equal(ready, false);
	f.controllers[4].resolve(); await first;
	assert.equal(ready, true);
	assert.equal(f.preload(), first);
	assert.equal(f.decodes.length, 1, "Start must not repeat catalog decoding or frame yields");
});

test("failed preparation can retry instead of retaining a rejected readiness promise", async () => {
	const f = preparationFixture();
	const first = f.preload(); f.decodes[0].reject(new Error("decode unavailable"));
	await assert.rejects(first, /decode unavailable/);
	const retry = f.preload(); assert.notEqual(retry, first);
	f.decodes[1].resolve([]); await settle();
	f.controllers.forEach(job => job.resolve()); await retry;
});

test("language readiness waits for decoded sounds and reverse hex, not native media metadata", async () => {
	const sounds = deferred(), hex = deferred();
	let ready = false, mediaPrepared = false;
	const normalized = mainSource.replaceAll("\r\n", "\n");
	const effectStart = normalized.indexOf("\tuseEffect(() => {\n\t\tlet active = true;");
	assert.ok(effectStart >= 0);
	const body = normalized.slice(effectStart + "\tuseEffect(() => {".length, normalized.indexOf("\n\t}, []);", effectStart));
	const run = vm.runInNewContext(`() => {${body}}`, {
		preloadUnderwaterSound() { mediaPrepared = true; return new Promise(() => {}); },
		preloadHtmlRoutes: async () => {}, prefetchSoundDesign: async () => {},
		preloadSoundDesign: () => sounds.promise, preloadHexTransitionSound: () => hex.promise,
		setRouteAssetsReady: value => { ready = value; }, console,
	});
	run(); await settle(); assert.equal(mediaPrepared, true); assert.equal(ready, false);
	sounds.resolve(); await settle(); assert.equal(ready, false);
	hex.resolve(); await settle(); assert.equal(ready, true);
});

test("failed route or audio preparation reports the error without unlocking Start", async () => {
	const normalized = mainSource.replaceAll("\r\n", "\n");
	const start = normalized.indexOf("\tuseEffect(() => {\n\t\tlet active = true;");
	const body = normalized.slice(start + "\tuseEffect(() => {".length, normalized.indexOf("\n\t}, []);", start));
	for (const unmount of [false, true]) {
		const assets = deferred(); let ready = false, failure = null;
		const run = vm.runInNewContext(`() => {${body}}`, {
			preloadUnderwaterSound: async () => {}, preloadHtmlRoutes: () => assets.promise,
			prefetchSoundDesign: async () => {}, preloadSoundDesign: async () => {}, preloadHexTransitionSound: async () => {},
			setRouteAssetsReady: value => { ready = value; },
			setPreparationFailure: value => { failure = value; }, Error, console: { error() {} },
		});
		const cleanup = run(); if (unmount) cleanup();
		assets.reject(new Error("Audio preparation failed")); await settle();
		assert.equal(ready, false);
		if (unmount) assert.equal(failure, null);
		else { assert.equal(failure.phase, "route-and-audio-preparation"); assert.equal(failure.message, "Audio preparation failed"); }
	}
});

test("a synchronous WebGL host failure closes the ready gate and reports diagnostics", () => {
	const normalized = mainSource.replaceAll("\r\n", "\n");
	const start = normalized.indexOf("const handleWebGLFailure = ");
	const source = normalized.slice(start, normalized.indexOf("\n\t};", start) + 5);
	let ready = true, failure = null;
	const fail = vm.runInNewContext(`${source}\nhandleWebGLFailure`, {
		Error, setThreeReady: value => { ready = value; }, setPreparationFailure: value => { failure = value; },
	});
	fail(new Error("WebGL host unavailable"));
	assert.equal(ready, false);
	assert.equal(failure.phase, "webgl-host");
	assert.equal(failure.message, "WebGL host unavailable");
});
