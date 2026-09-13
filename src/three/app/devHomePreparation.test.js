import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("./DigitalMonsterThreeApp.js", import.meta.url), "utf8");
const start = source.indexOf("\tasync _prepareApplication()");
const method = source.slice(start, source.indexOf("\n\t_setPreparationProgress(", start));
const prepare = vm.runInNewContext(`({${method}})._prepareApplication`, { console: { error() {} } });
const deferred = () => {
	let resolve, reject;
	const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
	return { promise, resolve, reject };
};

function owner(home, tier = "low") {
	return {
		fullWarm: false, gfxTier: tier, ready: false, renderer: {}, preparationScheduler: {},
		sceneManager: { readyPromise: Promise.resolve(), getSceneById: () => home },
		_setPreparationProgress(value) { this.progress = value; },
	};
}

test("ordinary Low URL waits for hero and effect before Start and saved settings", async () => {
	const hero = deferred(), effect = deferred(), effectStarted = deferred();
	const app = owner({
		prepareHeroTextUnderCurtain: () => hero.promise,
		prepareResourcesUnderCurtain(renderer, scheduler) {
			assert.equal(renderer, app.renderer);
			assert.equal(scheduler, app.preparationScheduler);
			effectStarted.resolve();
			return effect.promise;
		},
	});
	let restored = false;
	const ready = prepare.call(app).then(result => { restored = true; return result; });
	await Promise.resolve();
	assert.equal(app.ready, false);
	hero.resolve();
	await effectStarted.promise;
	assert.equal(app.ready, false);
	assert.equal(restored, false);
	effect.resolve();
	assert.equal(await ready, true);
	assert.equal(app.ready, true);
	assert.equal(app.progress, 1);
});

test("failed or cancelled Low preparation cannot unlock Start", async () => {
	for (const cancelled of [false, true]) {
		const app = owner({ prepareResourcesUnderCurtain() {
			if (cancelled) app.disposed = true;
			else throw new Error("effect failed");
		} });
		assert.equal(await prepare.call(app), false);
		assert.equal(app.ready, false);
		if (!cancelled) assert.match(app.prepareError.message, /effect failed/);
	}
});

test("High and Medium retain their fast dev readiness", async () => {
	for (const tier of ["high", "medium"]) {
		const pending = deferred();
		const app = owner({ prepareHeroTextUnderCurtain: () => pending.promise }, tier);
		assert.equal(await prepare.call(app), true);
		assert.equal(app.ready, true);
		pending.resolve();
	}
});

test("full warm rejects an unusable shader but permits driver warnings", async () => {
	const fullPrepare = vm.runInNewContext(`({${method}})._prepareApplication`, {
		console: { error() {} }, yieldToNextPaint: async () => {},
		warmCasePanelHudUnderCurtain: async () => {}, warmAboutPanelHudUnderCurtain: async () => {},
		prepareSceneCanvasInterfaces: async () => {},
	});
	for (const runnable of [false, true, undefined]) {
		let draws = 0;
		const home = { readyPromise: Promise.resolve() };
		const app = {
			fullWarm: true, ready: false,
			renderer: { info: { programs: [{ name: "home", diagnostics: runnable === undefined ? undefined : { runnable } }] } },
			sceneManager: {
				scenes: new Map([["home", home]]), readyPromise: home.readyPromise,
				getSceneById: () => home, warmupRenderTargets() {}, warmupPrograms: async () => {},
			},
			backgroundPipeline: { readyPromise: Promise.resolve() },
			preparationScheduler: { run: async job => job() },
			_warmupScreenOverlays: async () => {}, _warmupRenderPipeline: async () => { draws++; },
			_setPreparationProgress(value) { this.progress = value; },
		};
		assert.equal(await fullPrepare.call(app), runnable !== false);
		assert.equal(draws, 1, "readiness still waits for real pipeline warm");
		assert.equal(app.ready, runnable !== false);
		if (runnable === false) {
			assert.match(app.prepareError.message, /home.*could not compile/);
			assert.ok(app.progress < 1);
		} else assert.equal(app.progress, 1);
	}
});
