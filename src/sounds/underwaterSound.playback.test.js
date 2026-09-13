import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

function createController() {
	const source = readFileSync(new URL("./underwaterSound.js", import.meta.url), "utf8");
	const methods = ["constructor", "_ensurePlaying", "_pause"].map(name =>
		source.match(new RegExp(`^\\t${name}\\([^]*?^\\t}`, "m"))[0]).join("\n");
	const context = { state: "running" }, requests = [];
	let resumes = 0, pauses = 0, allowed = true;
	const Controller = vm.runInNewContext(`(class {${methods}})`, {
		resumeMasterAudioContext() { resumes++; return new Promise(() => {}); },
		isPageSoundAllowed: () => allowed,
	});
	const audio = {
		paused: true, currentTime: 0,
		play() { return new Promise((resolve, reject) => requests.push({
			resolve: () => { audio.paused = false; resolve(); }, reject,
		})); },
		pause() { pauses++; audio.paused = true; },
	};
	const controller = Object.assign(new Controller(), { _audio: audio, _getAudioContext: () => context });
	return { controller, audio, context, requests, get resumes() { return resumes; }, get pauses() { return pauses; },
		setAllowed(value) { allowed = value; } };
}

test("a slow media play queues only one request across many frames", async () => {
	const { controller, requests } = createController();
	const pending = controller._ensurePlaying();
	for (let frame = 0; frame < 120; frame++) assert.equal(controller._ensurePlaying(), pending);
	assert.equal(requests.length, 1);
	requests[0].resolve();
	await pending;
	assert.equal(controller._playing, true);
	controller._ensurePlaying();
	assert.equal(requests.length, 1);
});

test("suspended audio never defers media playback beyond the current Home update", async () => {
	const bus = createController();
	bus.context.state = "suspended";
	assert.equal(bus.controller._ensurePlaying(), undefined);
	assert.equal(bus.resumes, 1);
	bus.controller._pause(true);
	bus.context.state = "running";
	await Promise.resolve();
	assert.equal(bus.requests.length, 0, "Context recovery alone cannot start a scene that already left");
	const pending = bus.controller._ensurePlaying();
	bus.requests[0].resolve();
	await pending;
	assert.equal(bus.controller._playing, true);
});

test("late play after leave is stopped and cannot mark the ambience as playing", async () => {
	const bus = createController();
	const pending = bus.controller._ensurePlaying();
	bus.controller._pause(true);
	bus.requests[0].resolve();
	await pending;
	assert.equal(bus.controller._playing, false);
	assert.equal(bus.audio.paused, true);
	assert.equal(bus.controller._playPromise, null);
});

test("a stale completion must not cancel newer playback after returning Home", async () => {
	const bus = createController();
	const old = bus.controller._ensurePlaying();
	bus.controller._pause(true);
	const current = bus.controller._ensurePlaying();
	bus.requests[0].resolve();
	await old;
	assert.equal(bus.controller._playPromise, current);
	assert.equal(bus.pauses, 1, "Leave cancels the pending native play; stale completion does not pause the new one");
	bus.requests[1].resolve();
	await current;
	assert.equal(bus.controller._playing, true);
});

test("mute during a pending play remains silent, rejection allows a later retry", async () => {
	const bus = createController();
	const muted = bus.controller._ensurePlaying();
	bus.setAllowed(false);
	bus.requests[0].resolve();
	await muted;
	assert.equal(bus.controller._playing, false);
	assert.equal(bus.audio.paused, true);
	bus.setAllowed(true);
	const rejected = bus.controller._ensurePlaying();
	bus.requests[1].reject(new Error("media playback unavailable"));
	await rejected;
	assert.equal(bus.controller._playPromise, null);
	const resumed = bus.controller._ensurePlaying();
	bus.requests[2].resolve();
	await resumed;
	assert.equal(bus.controller._playing, true);
});
