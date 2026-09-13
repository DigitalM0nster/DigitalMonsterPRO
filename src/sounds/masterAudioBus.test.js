import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

function createBus() {
	let phase = 0;
	const analyser = {
		fftSize: 1024,
		connect() {},
		getFloatTimeDomainData(buffer) {
			for (let i = 0; i < buffer.length; i++) buffer[i] = Math.sin(i * 0.17 + phase) * 0.2;
		},
	};
	const context = {
		state: "running",
		createGain: () => ({ gain: {}, connect() {} }),
		createAnalyser: () => analyser,
	};
	const source = readFileSync(new URL("./masterAudioBus.js", import.meta.url), "utf8").replaceAll("export ", "");
	const read = vm.runInNewContext(`${source}\nreadMasterAudioSnapshot`, {
		Float32Array,
		window: { AudioContext: function () { return context; } },
	});
	return { read, analyser, context, setPhase(value) { phase = value; } };
}

test("caller-owned audio buffer matches independent snapshots without overwriting earlier snapshots", () => {
	const bus = createBus();
	const target = new Float32Array(88);
	const first = bus.read(88);
	const saved = first.waveform.slice();
	for (let frame = 0; frame < 120; frame++) {
		bus.setPhase(frame * 0.1);
		if (frame === 60) bus.analyser.fftSize = 2048;
		const expected = bus.read(88);
		const actual = bus.read(88, target);
		assert.equal(actual.waveform, target);
		assert.deepEqual(actual.waveform, expected.waveform);
		for (const key of ["level", "peak", "rms"]) assert.equal(actual[key], expected[key]);
	}
	assert.deepEqual(first.waveform, saved);
});

test("resized or closed analyser preserves buffer ownership and null-waveform behavior", () => {
	const bus = createBus();
	const oldTarget = new Float32Array(88).fill(9);
	const resized = bus.read(132, oldTarget);
	assert.equal(resized.waveform.length, 132);
	assert.notEqual(resized.waveform, oldTarget);
	assert.ok(oldTarget.every(value => value === 9));
	const minimum = new Float32Array(8);
	assert.equal(bus.read(2, minimum).waveform, minimum);
	bus.context.state = "closed";
	const closed = bus.read(88, oldTarget);
	assert.equal(closed.waveform, null);
	assert.equal(closed.level, 0);
	assert.ok(oldTarget.every(value => value === 9));
});

function createResumeBus(state = "suspended") {
	const requests = [];
	const context = {
		state, createGain: () => ({ gain: {}, connect() {} }),
		createAnalyser: () => ({ connect() {} }),
		resume() {
			return new Promise((resolve, reject) => requests.push({ resolve, reject }));
		},
	};
	const source = readFileSync(new URL("./masterAudioBus.js", import.meta.url), "utf8").replaceAll("export ", "");
	const resume = vm.runInNewContext(`${source}\nresumeMasterAudioContext`, {
		window: { AudioContext: function () { return context; } },
	});
	return { context, requests, resume };
}

test("runtime callers share one native resume while it is pending", async () => {
	const bus = createResumeBus();
	const first = bus.resume();
	for (let frame = 0; frame < 120; frame++) assert.equal(bus.resume(), first);
	assert.equal(bus.requests.length, 1);
	bus.context.state = "running";
	bus.requests[0].resolve();
	await first;
	await bus.resume();
	assert.equal(bus.requests.length, 1);
});

test("later gestures can unlock an unresolved pre-gesture attempt without duplicating one event", async () => {
	const bus = createResumeBus();
	const cold = bus.resume();
	const gesture = bus.resume({ userGesture: true });
	assert.notEqual(gesture, cold);
	assert.equal(bus.requests.length, 2, "Native resume is called synchronously inside the gesture");
	assert.equal(bus.resume({ userGesture: true }), gesture);
	assert.equal(bus.resume(), gesture);
	await Promise.resolve();
	const nextGesture = bus.resume({ userGesture: true });
	assert.equal(bus.requests.length, 3, "A subsequent event can retry a never-settled gesture");
	bus.requests[0].resolve();
	bus.requests[1].resolve();
	await Promise.all([cold, gesture]);
	assert.equal(bus.resume(), nextGesture, "Old completion must not clear the newest attempt");
	bus.context.state = "running";
	bus.requests[2].resolve();
	await nextGesture;
});

test("interrupted contexts resume and rejected attempts do not block a fresh gesture", async () => {
	const bus = createResumeBus("interrupted");
	const interrupted = bus.resume();
	assert.equal(bus.requests.length, 1);
	bus.requests[0].reject(new Error("gesture required"));
	await interrupted;
	const gesture = bus.resume({ userGesture: true });
	assert.equal(bus.requests.length, 2);
	bus.context.state = "running";
	bus.requests[1].resolve();
	await gesture;
	bus.context.state = "closed";
	await bus.resume({ userGesture: true });
	assert.equal(bus.requests.length, 2);
});

test("Start and sound-enable actions explicitly resume inside their gesture", () => {
	const calls = [];
	const context = {
		store: {}, document: { hidden: false }, Audio: function () {}, SOUND_CATALOG: {},
		cancelPendingSiteSoundMute() {}, initMasterAudioBus() {}, playHtmlOneShot() {},
		resumeMasterAudioContext: options => { calls.push(options?.userGesture); },
	};
	const toggle = readFileSync(new URL("./siteSoundToggle.js", import.meta.url), "utf8");
	const enable = toggle.match(/function enableSiteSound\(\) \{[^]*?\n\}/)[0];
	vm.runInNewContext(`${enable}\nenableSiteSound()`, context);
	const design = readFileSync(new URL("./soundDesign.js", import.meta.url), "utf8");
	for (const name of ["playLoaderStartClickSound", "playStartAppSound"]) {
		const method = design.match(new RegExp(`export function ${name}\\(\\) \\{[^]*?\\n\\}`))[0].replace("export ", "");
		vm.runInNewContext(`let uiClickAudio, startAppAudio;\n${method}\n${name}()`, { ...context });
	}
	assert.deepEqual(calls, [true, true, true]);
});
