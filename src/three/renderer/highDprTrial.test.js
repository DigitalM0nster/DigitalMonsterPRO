import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { shouldTrialHighDpr, measurePreparedHighDpr } from "./highDprTrial.js";

test("High from 980 CSS pixels and below native DPR2 earns a trial in production and local preview", () => {
	const eligible = { tier: "high", width: 980, baselineDpr: 1 };
	assert.equal(shouldTrialHighDpr(eligible), true);
	for (const values of [{ tier: "medium" }, { tier: "low" }, { width: 979 }, { width: NaN },
		{ width: 0 }, { baselineDpr: 2 }, { baselineDpr: NaN }]) {
		assert.equal(shouldTrialHighDpr({ ...eligible, ...values }), false, JSON.stringify(values));
	}
	assert.equal(shouldTrialHighDpr({ ...eligible, baselineDpr: 1.5 }), true);
	assert.equal(shouldTrialHighDpr({ ...eligible, width: 1920 }), true);
});

async function sample(intervals, overrides = {}) {
	let clock = 0;
	let waits = 0;
	const draws = [];
	const result = await measurePreparedHighDpr({
		sceneIds: ["home", "about", "contacts", "capabilities:syntheticCore"],
		frameCount: intervals.length,
		now: () => clock,
		nextFrame: async () => { if (waits++ > 0) clock += intervals[waits - 2]; },
		draw: id => { draws.push(id); },
		...overrides,
	});
	return { result, draws };
}

test("64 visible prepared frames at DPR2 must meet both measured FPS and p90", async () => {
	const { result, draws } = await sample(Array(64).fill(1000 / 60));
	assert.equal(result.accepted, true);
	assert.equal(result.frames, 64);
	assert.ok(Math.abs(result.fps - 60) < 1e-6);
	assert.equal(new Set(draws).size, 4);
	assert.equal(result.scenes.length, 4);
	assert.equal((await sample(Array(64).fill(20))).result.accepted, true, "50 FPS is inclusive");
	assert.equal((await sample(Array(64).fill(20.1))).result.accepted, false);
});

test("a fast average cannot mask bad p90 or a slow scene", async () => {
	const noisy = Array.from({ length: 64 }, (_, i) => i % 4 === 0 ? 26 : 12);
	const { result } = await sample(noisy);
	assert.ok(result.fps > 50);
	assert.equal(result.p90Ms, 26);
	assert.equal(result.accepted, false);
	const slowScene = [...Array(48).fill(10), ...Array(16).fill(21)];
	assert.equal((await sample(slowScene)).result.accepted, false);
});

test("clearly slow frames stop early and unavailable evidence never approves supersampling", async () => {
	const { result, draws } = await sample(Array(64).fill(40));
	assert.equal(result.accepted, false);
	assert.equal(result.reason, "slow");
	assert.equal(draws.length, 3);
	for (const [override, reason] of [[{ isVisible: () => false }, "hidden"],
		[{ cancelled: () => true }, "cancelled"], [{ isCurrentViewport: () => false }, "viewport-changed"],
		[{ draw: () => false }, "missing-frame"]]) {
		const { result: invalid } = await sample(Array(64).fill(16), override);
		assert.equal(invalid.accepted, false);
		assert.equal(invalid.reason, reason);
	}
});

test("viewport changes and visibility loss during a submitted frame invalidate its result", async () => {
	let viewport = true;
	const { result } = await sample(Array(64).fill(16), {
		draw: () => { viewport = false; }, isCurrentViewport: () => viewport,
	});
	assert.equal(result.reason, "viewport-changed");
	assert.equal(result.frames, 0);
	assert.equal(result.accepted, false);
});

function loadClass(path, className, context = {}) {
	const source = readFileSync(new URL(path, import.meta.url), "utf8")
		.replace(/^import[\s\S]*?;\s*$/gm, "")
		.replace(/import\.meta\.env\.DEV/g, "false")
		.replace(`export class ${className}`, `class ${className}`);
	return vm.runInNewContext(`${source}\n${className}`, { ...context });
}

test("app fixes DPR once under the curtain; fallback reuses owners and never reloads assets", async () => {
	for (const accepted of [true, false]) {
		const events = [];
		const App = loadClass("../app/DigitalMonsterThreeApp.js", "DigitalMonsterThreeApp", {
			window: { innerWidth: 980, innerHeight: 800, devicePixelRatio: 1 },
			document: { visibilityState: "visible" },
			measurePreparedHighDpr: async options => {
				assert.equal(options.isCurrentViewport(), true);
				assert.equal(options.isVisible(), true);
				assert.equal(options.cancelled(), false);
				return { accepted };
			},
			getScenePixelRatio: () => 2,
			resolveRendererPixelRatio: (_tier, device) => Math.min(device, 2),
			requestSharedAnimationFrame: callback => callback(),
			warmCasePanelHudUnderCurtain: async () => events.push("case-hud"),
			warmAboutPanelHudUnderCurtain: async () => events.push("about-hud"),
		});
		const app = Object.assign(Object.create(App.prototype), {
			_highDprTrialPending: true, _baselinePixelRatio: 1, store: { graphicsDpr: 2 },
			defaultPixelRatio: 2,
			renderer: { getContext: () => ({ isContextLost: () => false }) },
			sceneManager: { getWarmupDrawSceneIds: () => ["home"] },
			setPixelRatio: ratio => events.push(`dpr:${ratio}`),
			_warmupScreenOverlays: async () => events.push("overlays"),
			_warmupRenderPipeline: async () => events.push("pipeline"),
			_renderFrame: () => events.push("restore-frame"),
			preparationScheduler: { run: async job => job() },
		});
		await app._calibratePreparedHighDpr();
		assert.equal(app.defaultPixelRatio, accepted ? 2 : 1);
		assert.equal(app.store.graphicsDpr, accepted ? 2 : 1);
		assert.deepEqual(events, accepted ? ["restore-frame"] : ["dpr:1", "overlays", "pipeline"]);
		const count = events.length;
		await app._calibratePreparedHighDpr();
		assert.equal(events.length, count, "no repeated trial/resize after decision");
	}
});

test("a High DPR probe temporarily shows the settled whale and restores the intro state", () => {
	const position = (x, y, z) => ({ x, y, z,
		set(a, b, c) { this.x = a; this.y = b; this.z = c; return this; },
		clone() { return position(this.x, this.y, this.z); },
		copy(value) { return this.set(value.x, value.y, value.z); },
	});
	const Home = loadClass("../scenes/home/DigitalWhaleScene.js", "DigitalWhaleScene", {
		digitalWhaleConfig: { whale: { posX: 6, posY: -4, posZ: -6 } },
	});
	let restores = 0;
	const home = Object.assign(Object.create(Home.prototype), {
		_whaleBasePos: position(38, -10, -33), _whaleEnterActive: true, _whaleEnterCompleted: false,
		_updateWhaleBodySway: () => restores++,
	});
	assert.equal(home.beginWarmupDraw(), null, "ordinary warm must preserve its previous behavior");
	const token = home.beginWarmupDraw({ performanceProbe: true });
	try {
		assert.equal(home._whaleBasePos.x, 6);
		assert.equal(home._whaleEnterActive, false);
		assert.equal(home._whaleEnterCompleted, true);
	} finally { home.endWarmupDraw(token); }
	assert.equal(home._whaleBasePos.x, 38);
	assert.equal(home._whaleEnterActive, true);
	assert.equal(home._whaleEnterCompleted, false);
	assert.equal(restores, 1);
});

test("earned DPR2 follows the 980px lower boundary only during a normal viewport resize", () => {
	let width = 980, ratio = 2;
	const sizes = [];
	const App = loadClass("../app/DigitalMonsterThreeApp.js", "DigitalMonsterThreeApp", {
		window: { devicePixelRatio: 1, location: { search: "" } },
		syncVisibleViewport: () => ({ width, height: 650 }),
		getScenePixelRatio: () => ratio,
		setScenePixelRatio: (_renderer, value) => { ratio = value; },
		resolveRendererPixelRatio: (_tier, native) => Math.min(native, 2),
		publishSceneViewportResize() {},
	});
	const pipeline = { setSize() {} };
	const app = Object.assign(Object.create(App.prototype), {
		highDprCalibration: { accepted: true }, gfxTier: "high", store: {}, _renderSize: {},
		renderer: { getContext: () => ({}), setDrawingBufferSize: (w, h, dpr) => sizes.push([w, h, dpr]) },
		camera: { updateProjectionMatrix() {} },
		backgroundPipeline: pipeline, sceneManager: pipeline, modelsPostProcess: pipeline,
		hexGridOverlay: pipeline, screenCompositor: pipeline, _logRendererPixelRatio() {},
	});
	for (const next of [980, 970, 1200]) { width = next; app.onResize(); }
	assert.deepEqual(sizes, [[980, 650, 2], [970, 650, 1], [1200, 650, 2]]);
	app.onResize();
	assert.equal(sizes.length, 3, "unchanged viewport does not allocate again");
});
