import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const appSource = readFileSync(new URL("./DigitalMonsterThreeApp.js", import.meta.url), "utf8");
const start = appSource.indexOf("\t_resolveRenderFpsCap()");
const resolve = vm.runInNewContext(`({${appSource.slice(start, appSource.indexOf("\n\t/**", start))}})._resolveRenderFpsCap`, {
	isPortfolioCasePath: path => path.startsWith("/portfolio/"),
});
const configSource = readFileSync(new URL("../../functions/getGraphicsTier.js", import.meta.url), "utf8").replace(/export /g, "");
const gfx = vm.runInNewContext(`${configSource}\ngetGraphicsConfig("low")`);
const skipSource = readFileSync(new URL("../render/adaptiveFrameSkip.js", import.meta.url), "utf8").replace("export class", "class");

function harness() {
	let now = 0;
	const Skipper = vm.runInNewContext(`${skipSource}\nAdaptiveFrameSkipper`, {
		performance: { now: () => now }, window: { innerWidth: 1920 },
	});
	const skipper = new Skipper();
	return { tick(ms, cap) { now += ms; return !skipper.shouldSkipRender({ tier: "low", renderFpsCap: cap }); } };
}

test("Low keeps display cadence across home, ring pages and static/animated cases", () => {
	for (const hz of [60, 75]) for (const [page, id] of [
		["/", "home"], ["/portfolio", "portfolioHub"], ["/about", "about"],
		["/contacts", "contacts"], ["/capabilities", "capabilities"], ["/portfolio/nipigas", "case1"],
	]) for (const continuous of [false, true]) {
		const cap = resolve.call({ gfx, currentPage: page,
			sceneManager: { getActiveSceneId: () => id, requiresContinuousRender: () => continuous },
		});
		const frames = harness();
		let draws = 0;
		for (let i = 0; i < hz; i++) draws += Number(frames.tick(1000 / hz, cap));
		assert.equal(draws, hz, `${page} at ${hz} Hz (continuous=${continuous})`);
	}
});

test("Low still uses its approved adaptive skip when actual cadence falls", () => {
	const frames = harness();
	for (let i = 0; i < 70; i++) frames.tick(100, gfx.renderFpsCap);
	let draws = 0;
	for (let i = 0; i < 7; i++) draws += Number(frames.tick(100, gfx.renderFpsCap));
	assert.equal(draws, 1);
});
