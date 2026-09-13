import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { MobileHexLayers } from "./mobileHexLayers.js";

const source = readFileSync(new URL("./SceneManager.js", import.meta.url), "utf8");
const start = source.indexOf("\n\trenderCarouselMix(options = {}) {") + 2;
const end = source.indexOf("\n\t_getMobileHexLayerState", start);
const stateStart = end + 2;
const stateEnd = source.indexOf("\n\t/**", stateStart);
const rt = slot => ({ slot, width: 390, height: 700, texture: { slot } });

test("a clipped cached layer is refreshed before a reversed/jumping front reveals new pixels", () => {
	const targets = { a: rt("a"), b: rt("b") }, draws = [];
	const cache = new MobileHexLayers((id, target, band) => {
		draws.push({ id, band }); return target.texture;
	}, () => 1);
	const frame = bands => cache.render("home", "portfolioHub", targets, false, bands);
	frame({ source: { min: .55, max: 1 }, target: { min: 0, max: .45 } });
	draws.length = 0;
	frame({ source: { min: .53, max: 1 }, target: { min: 0, max: .47 } });
	assert.equal(draws.length, 1, "Small movement reuses the draw reserve");
	draws.length = 0;
	frame({ source: { min: .1, max: 1 }, target: { min: 0, max: .85 } });
	assert.equal(draws.length, 2, "A large jump refreshes both newly exposed bands");
	assert.ok(draws.find(d => d.id === "home").band.min <= .1);
	assert.ok(draws.find(d => d.id === "portfolioHub").band.max >= .85);
	draws.length = 0;
	cache.render("home", "portfolioHub", targets, true);
	assert.deepEqual(draws[0].band, { min: 0, max: 1 }, "Rest restores full coverage");
});

function fixture({ mobile = true, started = true, enabled = true } = {}) {
	const pair = { sourceId: "home", targetId: "portfolioHub" };
	let progress = 0;
	const subject = vm.runInNewContext(`({${source.slice(start, end)},${source.slice(stateStart, stateEnd)}})`, {
		getSceneCarousel: () => ({ getMixSourceTargetIds: () => pair }),
		getHexShaderProgress: () => progress,
		isMobileGraphicsDevice: () => mobile,
	});
	const draws = [], states = new Map(), finished = new Map();
	Object.assign(subject, {
		layerTargets: { a: rt("a"), b: rt("b") },
		routeState: { appStarted: started }, _mobileHexLayersEnabled: enabled,
		scenes: new Map(["home", "portfolioHub", "about", "contacts"].map(id => [id, { shouldRender: () => states.get(id) !== false }])),
		_getMixLayerRenderTarget(_id, slot) { return this.layerTargets[slot]; },
		_renderSceneLayer(id, target) {
			this._mobileHexLayers.invalidate(target);
			draws.push(`${id}:${target.slot}`);
			target.texture.sceneId = id;
			const texture = finished.get(id) ?? target.texture;
			texture.frame = draws.length;
			return texture;
		},
	});
	subject._mobileHexLayers = new MobileHexLayers((id, target) => subject._renderSceneLayer(id, target), id => subject._getMobileHexLayerState(id));
	return {
		subject, draws, states, finished,
		frame(p = progress, from = pair.sourceId, to = pair.targetId) {
			progress = p; pair.sourceId = from; pair.targetId = to;
			const previous = draws.length;
			const result = subject.renderCarouselMix();
			assert.equal(result.sourceModels.sceneId, from);
			assert.equal(result.targetModels.sceneId, p <= .0001 || from === to ? from : to);
			return { ...result, draws: draws.slice(previous) };
		},
	};
}

test("idle then positive mix draws incoming first and alternates one scene per frame", () => {
	const f = fixture();
	assert.deepEqual(f.frame(0).draws, ["home:a"]);
	assert.deepEqual(f.frame(.1).draws, ["portfolioHub:b"]);
	assert.deepEqual(f.frame(.2).draws, ["home:a"]);
	assert.deepEqual(f.frame(.3).draws, ["portfolioHub:b"]);
	for (let i = 0; i < 100; i++) assert.equal(f.frame(.4).draws.length, 1);
});

test("uncached initial pair draws both once instead of using another scene's pixels", () => {
	const f = fixture();
	assert.deepEqual(f.frame(.2).draws, ["home:a", "portfolioHub:b"]);
	assert.equal(f.frame(.3).draws.length, 1);
});

test("immediate pair reversal preserves source in B and draws incoming in A", () => {
	const f = fixture(); f.frame(0); f.frame(.3);
	assert.deepEqual(f.frame(.6, "portfolioHub", "home").draws, ["home:a"]);
	assert.deepEqual(f.frame(.7).draws, ["portfolioHub:b"]);
	assert.deepEqual(f.frame(.8).draws, ["home:a"]);
});

test("scroll cancellation and reverse target refresh do not leave stale ownership", () => {
	const f = fixture(); f.frame(0); f.frame(.3); f.frame(.2);
	assert.deepEqual(f.frame(0).draws, ["home:a"]);
	assert.deepEqual(f.frame(.1, "home", "contacts").draws, ["contacts:b"]);
	assert.deepEqual(f.frame(.2).draws, ["home:a"]);
});

test("new pair can reuse last incoming source, but cannot reuse unrelated old pixels", () => {
	const f = fixture(); f.frame(0); f.frame(.3);
	assert.deepEqual(f.frame(.2, "portfolioHub", "about").draws, ["about:a"]);
	assert.equal(f.frame(.3).draws.length, 1);
	assert.deepEqual(f.frame(.2, "contacts", "home").draws, ["contacts:a", "home:b"]);
});

test("resize/replacement invalidates both scene textures before reuse", () => {
	const f = fixture(); f.frame(0); f.frame(.2);
	f.subject.layerTargets.a.width = f.subject.layerTargets.b.width = 844;
	assert.equal(f.frame(.3).draws.length, 2);
	f.subject.layerTargets = { a: rt("a"), b: rt("b") };
	assert.equal(f.frame(.4).draws.length, 2);
	assert.equal(f.subject._mobileHexLayers.records.size, 2);
});

test("renderability and screen-to-models HUD changes refresh the affected source", () => {
	const f = fixture();
	f.subject.scenes.get("home").heroTitle = { getWarmupOverlays: () => [{ composeMode: "screen" }] };
	f.frame(0);
	f.subject.scenes.get("home").heroTitle = { getWarmupOverlays: () => [{ composeMode: "models" }] };
	assert.equal(f.frame(.1).draws.length, 2);
	f.states.set("home", false);
	assert.deepEqual(f.frame(.2).draws, ["home:a"]);
});

test("outside scene draws invalidate cached physical targets", () => {
	const f = fixture(); f.frame(0); f.frame(.2);
	f.subject._renderSceneLayer("contacts", f.subject.layerTargets.a);
	assert.deepEqual(f.frame(.3).draws, ["home:a"]);
});

test("About reading toggle refreshes the scene before its external HUD bake changes", () => {
	const f = fixture();
	const ui = { enabled: true, composeMode: "models", reading: false };
	f.subject.scenes.get("about").canvasInterface = ui;
	f.frame(0, "about", "contacts");
	f.frame(.1);
	f.frame(.2); // Source just drew; next frame would normally reuse it.
	ui.reading = true;
	assert.deepEqual(f.frame(.3).draws, ["about:a"]);
	f.frame(.4);
	f.frame(.5); // Source just drew again.
	ui.reading = false;
	assert.deepEqual(f.frame(.6).draws, ["about:a"]);
});

test("an old dormant target cannot be borrowed as the source after a long idle", () => {
	const f = fixture(); f.frame(0); f.frame(.2);
	for (let i = 0; i < 10; i++) f.frame(0);
	assert.equal(f.frame(.3, "portfolioHub", "contacts").draws.length, 2);
});

test("Low whale finish texture is reused, not the raw scene RT", () => {
	const f = fixture();
	const finished = { sceneId: "home", slot: "whaleBloomOutput" };
	f.finished.set("home", finished);
	assert.equal(f.frame(0).sourceModels, finished);
	assert.equal(f.frame(.1).sourceModels, finished);
	assert.equal(f.frame(.2).sourceModels, finished);
});

for (const [name, options] of [["desktop", { mobile: false }], ["full QA override", { enabled: false }], ["under-curtain preparation", { started: false }]]) {
	test(`${name} always draws both scenes during hex`, () => {
		const f = fixture(options);
		f.frame(0);
		for (let i = 0; i < 20; i++) assert.equal(f.frame(.4).draws.length, 2);
	});
}

test("same-scene/rest always renders its current pose every frame", () => {
	const f = fixture();
	for (let i = 0; i < 10; i++) assert.deepEqual(f.frame(.5, "about", "about").draws, ["about:a"]);
});
