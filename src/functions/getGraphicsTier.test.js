import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { resolveRendererPixelRatio } from "./getGraphicsTier.js";

test("Medium and High follow device DPR without supersampling standard displays", () => {
	for (const tier of ["medium", "high"]) {
		for (const [device, expected] of [[0.75, 0.75], [1, 1], [1.25, 1.25], [1.5, 1.5], [2, 2], [3, 2], [4, 2]]) {
			assert.equal(resolveRendererPixelRatio(tier, device), expected, `${tier}, device DPR ${device}`);
		}
	}
});

test("Low retains its pixel budget and invalid device ratios fall back safely", () => {
	for (const device of [1, 1.5, 2, 3]) assert.equal(resolveRendererPixelRatio("low", device), 1);
	for (const tier of ["low", "medium", "high"]) {
		for (const device of [NaN, Infinity, 0, -1]) assert.equal(resolveRendererPixelRatio(tier, device), 1);
	}
});

test("mobile scene buffers retain tier DPR caps", () => {
	for (const tier of ["low", "medium", "high"]) {
		const cap = tier === "low" ? 1 : 2;
		for (const device of [1, 2, 3, 4, 5, 6]) {
			assert.equal(resolveRendererPixelRatio(tier, device, true), Math.min(device, cap), `${tier}, mobile DPR ${device}`);
		}
		for (const device of [NaN, Infinity, 0, -1]) {
			assert.equal(resolveRendererPixelRatio(tier, device, true), 1);
		}
	}
});

function setup({ cores = 8, ram, width = 1920, reduced = false, search = "" } = {}) {
	const source = readFileSync(new URL("./getGraphicsTier.js", import.meta.url), "utf8").replace(/export /g, "");
	return vm.runInNewContext(`${source}\n({ getGraphicsTier, getGraphicsTierDiagnostics })`, {
		URLSearchParams,
		navigator: { hardwareConcurrency: cores, deviceMemory: ram },
		window: { innerWidth: width, location: { search }, matchMedia: (query) => ({ matches: query.includes("reduced-motion") && reduced }) },
	});
}

test("CPU threads and reported RAM impose independent limits", () => {
	for (const [cores, ram, expected] of [
		[2, 8, "low"], [16, 2, "low"], [4, 4, "low"],
		[4, 8, "medium"], [16, 4, "medium"], [8, 8, "high"],
	]) assert.equal(setup({ cores, ram }).getGraphicsTier(), expected, `${cores} threads / ${ram} GB`);
});

test("unavailable RAM stays unknown without duplicating CPU score", () => {
	const api = setup({ cores: 8 });
	assert.equal(api.getGraphicsTier(), "high");
	assert.equal(api.getGraphicsTierDiagnostics().memoryGb, null);
	assert.equal(api.getGraphicsTierDiagnostics().score, 2);
	assert.equal(setup({ cores: 4 }).getGraphicsTier(), "medium");
	assert.equal(setup({ cores: 2 }).getGraphicsTier(), "low");
	assert.equal(setup({ ram: NaN }).getGraphicsTierDiagnostics().memoryGb, null);
});

test("mobile High eligibility retains CPU/RAM limits and does not assume unknown RAM is small", () => {
	assert.equal(setup({ cores: 6, width: 390 }).getGraphicsTier(), "high");
	assert.equal(setup({ cores: 8, ram: 8, width: 800 }).getGraphicsTier(), "high");
	assert.equal(setup({ cores: 6, ram: 4, width: 390 }).getGraphicsTier(), "low");
	assert.equal(setup({ cores: 8, ram: 4, width: 390 }).getGraphicsTier(), "medium");
	assert.equal(setup({ cores: 4, width: 390 }).getGraphicsTier(), "medium");
	assert.equal(setup({ cores: 2, width: 390 }).getGraphicsTier(), "low");
	assert.equal(setup({ cores: 6, width: 1920 }).getGraphicsTier(), "medium");
});

test("reduced motion and explicit tier remain authoritative", () => {
	const reduced = setup({ ram: 8, reduced: true });
	assert.equal(reduced.getGraphicsTier(), "low");
	assert.equal(reduced.getGraphicsTierDiagnostics().tier, "low");
	assert.equal(setup({ cores: 2, ram: 2, reduced: true, search: "?tier=high" }).getGraphicsTier(), "high");
});
