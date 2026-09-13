import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("./PortfolioFilmScene.js", import.meta.url), "utf8");
const start = source.indexOf("\tasync prepare(renderer)");
const prepare = vm.runInNewContext(`({${source.slice(start, source.indexOf("\n\tgetScene()", start))}}).prepare`, {
	getScenePixelRatio: () => 2, getGraphicsTier: () => "high",
	FilmScreen: class { frame = {}; uniforms = { uDpr: {} }; root = { add() {} }; },
});
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test("portfolio overlaps media and reading preparation but cannot become ready until both finish", async () => {
	for (const first of ["media", "reading"]) {
		const media = deferred(), reading = deferred(), begun = [], events = [];
		const scene = { media: { prepare() { begun.push("media"); return media.promise; } },
			infoTextures: { prepare() { begun.push("reading"); return reading.promise; } },
			transitionSound: { prepare: async () => {} },
			hud: { prepare: async () => events.push("hud") }, threeScene: { add: () => events.push("scene") } };
		const result = prepare.call(scene, {});
		assert.deepEqual(begun, ["media", "reading"]);
		(first === "media" ? media : reading).resolve();
		await Promise.resolve(); await Promise.resolve();
		assert.equal(scene.ready, undefined); assert.deepEqual(events, []);
		(first === "media" ? reading : media).resolve();
		assert.equal(await result, true); assert.equal(scene.ready, true);
		assert.deepEqual(events, ["hud", "scene"]);
	}
});

test("unmount while assets prepare never constructs the portfolio scene", async () => {
	const reading = deferred();
	const scene = { media: { prepare: async () => {} }, infoTextures: { prepare: () => reading.promise },
		transitionSound: { prepare: async () => {} }, hud: { prepare() { assert.fail("disposed HUD"); } } };
	const result = prepare.call(scene, {}); scene.disposed = true; reading.resolve();
	await result; assert.equal(scene.screen, undefined); assert.equal(scene.ready, undefined);
});
