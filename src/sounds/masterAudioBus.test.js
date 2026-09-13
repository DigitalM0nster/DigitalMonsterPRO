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
