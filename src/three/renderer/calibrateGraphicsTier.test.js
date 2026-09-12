import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import * as THREE from "three";

function setup(name, forced = null, perPassMs = null, gpuWaitMs = 0) {
	const cache = new Map();
	let clock = 0;
	let draws = 0;
	let target = null;
	const source = readFileSync(new URL("./calibrateGraphicsTier.js", import.meta.url), "utf8")
		.replace(/^import .*;\s*$/gm, "").replace("export function", "function");
	const calibrate = vm.runInNewContext(`${source}\ncalibrateGraphicsTier`, {
		getForcedGraphicsTierFromUrl: () => forced,
		sessionStorage: { getItem: (key) => cache.get(key), setItem: (key, value) => cache.set(key, value) },
		THREE: perPassMs === null ? {} : THREE,
		performance: { now: () => clock }, console: { warn() {} },
	});
	const renderer = {
		getContext: () => ({ getExtension: () => null, getParameter: () => name, finish() { clock += gpuWaitMs; } }),
		getRenderTarget: () => target,
		setRenderTarget: (value) => { target = value; },
		render: () => { draws++; clock += perPassMs; },
	};
	return { run: (tier) => calibrate(renderer, tier), cache, getDraws: () => draws };
}

test("unverified GPU families use measured performance instead of automatic high", () => {
	for (const name of ["NVIDIA GeForce GTX 750 Ti", "NVIDIA GeForce RTX 3050 Laptop GPU", "AMD Radeon RX 550", "Apple M1", "NVIDIA GeForce RTX 3070 Ti Laptop GPU"]) {
		for (const [ms, expected] of [[1, "high"], [3, "medium"], [7, "low"]]) {
			const { run, getDraws } = setup(name, null, ms);
			const result = run("high");
			assert.equal(result.tier, expected, `${name}: ${ms} ms`);
			assert.equal(result.perPassMs, ms);
			assert.equal(getDraws(), 6);
			assert.equal(run("high").cached, true);
			assert.equal(getDraws(), 6, "cached startup must not repeat the probe");
		}
	}
});

test("CPU submission diagnostic excludes explicit GPU wait without extra draws", () => {
	const { run, getDraws } = setup("unknown GPU", null, 1, 12);
	const result = run("high");
	assert.equal(result.cpuSubmitMs, 1);
	assert.equal(result.perPassMs, 4);
	assert.equal(getDraws(), 6);
});

test("GPU cache does not preserve a previous startup's medium cap", () => {
	const { run } = setup("NVIDIA GeForce RTX 3070 Ti");
	assert.equal(run("medium").tier, "medium");
	const desktop = run("high");
	assert.equal(desktop.tier, "high");
	assert.equal(desktop.cached, true);
	assert.equal(run("medium").tier, "medium");
});

test("software GPU remains low when cached", () => {
	const { run } = setup("Google SwiftShader");
	assert.equal(run("high").tier, "low");
	assert.equal(run("high").tier, "low");
	assert.equal(run("medium").cached, true);
});

test("failed probe does not cache an unmeasured hardware tier", () => {
	// Missing WebGLRenderTarget simulates an exception during probe setup.
	const { run, cache } = setup("unknown GPU");
	assert.equal(run("medium").tier, "medium");
	assert.equal(cache.size, 0);
	assert.equal(run("high").cached, false);
});

test("forced tier and low hardware skip GPU caching", () => {
	const forced = setup("Google SwiftShader", "high");
	assert.equal(forced.run("low").tier, "high");
	assert.equal(forced.cache.size, 0);
	const low = setup("NVIDIA GeForce RTX 3070 Ti");
	assert.equal(low.run("low").tier, "low");
	assert.equal(low.cache.size, 0);
});
