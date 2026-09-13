import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { syncVisibleViewport } from "./syncVisibleViewport.js";

function environment(width, height, visualHeight = height) {
	const properties = new Map();
	const writes = [];
	return {
		innerWidth: width, innerHeight: height,
		visualViewport: { width, height: visualHeight, scale: 1 },
		document: { documentElement: { clientWidth: width, clientHeight: 844, style: {
			getPropertyValue: name => properties.get(name) ?? "",
			setProperty: (name, value) => { properties.set(name, value); writes.push([name, value]); },
		} } },
		properties, writes,
	};
}

test("Safari expanded 100vh and visible innerHeight produce the same host and scene size", () => {
	const env = environment(390, 664);
	assert.deepEqual(syncVisibleViewport(env), { width: 390, height: 664 });
	assert.equal(env.properties.get("--site-viewport-height"), "664px");
	assert.equal(env.properties.get("--site-viewport-width"), "390px");
	assert.equal(env.document.documentElement.clientHeight, 844, "layout viewport does not drive the renderer");
	assert.deepEqual(syncVisibleViewport(env), { width: 390, height: 664 });
	assert.equal(env.writes.length, 2, "unchanged size does not invalidate layout again");
});

test("browser bars and rotation use logical dimensions; pinch visual dimensions never rescale scenes", () => {
	const env = environment(390, 664);
	syncVisibleViewport(env);
	env.innerHeight = 751;
	assert.deepEqual(syncVisibleViewport(env), { width: 390, height: 751 });
	env.visualViewport = { width: 195, height: 375.5, scale: 2 };
	assert.deepEqual(syncVisibleViewport(env), { width: 390, height: 751 });
	env.innerWidth = 844; env.innerHeight = 390;
	assert.deepEqual(syncVisibleViewport(env), { width: 844, height: 390 });
});

test("desktop size is unchanged and a transient zero viewport cannot collapse the buffers", () => {
	const env = environment(1920, 945);
	assert.deepEqual(syncVisibleViewport(env), { width: 1920, height: 945 });
	env.innerHeight = 0;
	assert.equal(syncVisibleViewport(env), null);
	assert.equal(env.properties.get("--site-viewport-height"), "945px");
});

const appSource = readFileSync(new URL("../app/DigitalMonsterThreeApp.js", import.meta.url), "utf8");
function appMethod(name, next, globals) {
	const start = appSource.indexOf(`\t${name}()`);
	const method = appSource.slice(start, appSource.indexOf(`\n\t${next}()`, start)).replaceAll("import.meta.env.DEV", "false");
	return vm.runInNewContext(`({${method}}).${name}`, globals);
}

test("the actual renderer resize ignores a larger Safari host and keeps camera, buffers and all scenes consistent", () => {
	const env = environment(390, 664);
	env.devicePixelRatio = 3;
	const sizes = [];
	const pipeline = { setSize: (w, h) => sizes.push([w, h]) };
	const app = {
		container: { clientWidth: 390, clientHeight: 844 }, _renderSize: {}, gfxTier: "medium",
		renderer: { getContext: () => ({}), setDrawingBufferSize: (w, h, dpr) => sizes.push([w, h, dpr]) },
		camera: { updateProjectionMatrix() {} }, backgroundPipeline: pipeline, sceneManager: pipeline,
		modelsPostProcess: pipeline, hexGridOverlay: pipeline, screenCompositor: pipeline,
		_logRendererPixelRatio() {},
	};
	const resize = appMethod("onResize", "_notifyRenderedOnce", {
		window: env, syncVisibleViewport: () => syncVisibleViewport(env),
		getScenePixelRatio: () => 1, resolveOutputPixelRatio: () => 2,
		publishSceneViewportResize() {},
	});
	resize.call(app);
	assert.equal(app.camera.aspect, 390 / 664);
	assert.deepEqual(sizes, [[390, 664, 2], ...Array.from({ length: 5 }, () => [390, 664])]);
	resize.call(app);
	assert.equal(sizes.length, 6, "duplicate notifications do not recreate render targets");
});

test("window, visualViewport and observer notifications share one pending resize and cancel on dispose", () => {
	const callbacks = [];
	const schedule = appMethod("_scheduleResize", "onResize", {
		requestSharedAnimationFrame: callback => callbacks.push(callback),
		clearTimeout() {},
	});
	let resized = 0;
	const app = { _resizeFrame: null, onResize: () => resized++ };
	for (let i = 0; i < 3; i++) schedule.call(app);
	assert.equal(callbacks.length, 1);
	callbacks[0]();
	assert.equal(resized, 1);
	schedule.call(app);
	app.disposed = true;
	callbacks[1]();
	assert.equal(resized, 1);
	schedule.call(app);
	assert.equal(callbacks.length, 2);
});

test("mobile height animation commits once; rotation cancels the delayed height", () => {
	const frames = new Map(), timers = new Map();
	let id = 0, resized = 0;
	const window = { innerWidth: 390, innerHeight: 664 };
	const schedule = appMethod("_scheduleResize", "onResize", {
		window, isMobileGraphicsDevice: () => true,
		requestSharedAnimationFrame: fn => { frames.set(++id, fn); return id; },
		cancelSharedAnimationFrame: key => frames.delete(key),
		setTimeout: (fn, delay) => { assert.equal(delay, 200); timers.set(++id, fn); return id; },
		clearTimeout: key => timers.delete(key),
	});
	const app = { store: { appStarted: true }, _renderSize: { w: 390, h: 664 },
		_resizeFrame: null, _resizeTimer: null, onResize: () => resized++ };
	for (let h = 669; h <= 724; h += 5) { window.innerHeight = h; schedule.call(app); }
	assert.equal(timers.size, 1);
	assert.equal(frames.size, 0);
	const run = queue => { for (const [key, fn] of [...queue]) { queue.delete(key); fn(); } };
	run(timers); run(frames);
	assert.equal(resized, 1);
	window.innerHeight = 740; schedule.call(app);
	window.innerWidth = 844; window.innerHeight = 390; schedule.call(app);
	assert.equal(timers.size, 0, "orientation does not wait for the browser-bar debounce");
	run(frames);
	assert.equal(resized, 2);
	window.innerWidth = 390; window.innerHeight = 720; schedule.call(app);
	app.disposed = true; run(timers); run(frames);
	assert.equal(resized, 2, "a queued callback cannot resize a disposed app");
});
