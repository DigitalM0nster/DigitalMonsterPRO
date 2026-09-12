import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

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

test("mobile limit, reduced motion and explicit tier remain authoritative", () => {
	assert.equal(setup({ ram: 8, width: 800 }).getGraphicsTier(), "medium");
	const reduced = setup({ ram: 8, reduced: true });
	assert.equal(reduced.getGraphicsTier(), "low");
	assert.equal(reduced.getGraphicsTierDiagnostics().tier, "low");
	assert.equal(setup({ cores: 2, ram: 2, reduced: true, search: "?tier=high" }).getGraphicsTier(), "high");
});
