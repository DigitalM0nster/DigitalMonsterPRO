import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const read = file => readFileSync(new URL(file, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const runtime = read("./aboutExperienceRuntime.js");
const story = read("./aboutPanelHudStory.js");
const casePainter = read("../portfolio/ui/CaseStudyCanvas/CaseStudyPanelHudPainter.jsx");
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

function runtimeFixture() {
	const start = runtime.indexOf("\tconst onViewportResize =");
	const end = runtime.indexOf("\n\tliveStoryStepHandler", start);
	const requests = [], publications = [];
	let owns = true;
	const disposeStart = runtime.indexOf("\n\t\tdisposed = true;", end);
	const disposeEnd = runtime.indexOf("\n\t\tunregisterNavigationOwner", disposeStart);
	const subject = vm.runInNewContext(`let disposed = false, viewportPaintGeneration = 0;
		${runtime.slice(start, end)}
		({ resize: onViewportResize, dispose() { ${runtime.slice(disposeStart, disposeEnd)} } })`, {
		ownsInput: () => owns,
		ensureAboutPanelHudCanvases: opts => new Promise(resolve => requests.push({ opts, resolve })),
		republishHudAfterRepaint: () => publications.push(true),
	});
	return { subject, requests, publications, setOwner(value) { owns = value; } };
}

test("About paints the committed dimensions and only publishes the latest completed request", async () => {
	const f = runtimeFixture();
	f.subject.resize({ width: 390, height: 700 });
	f.subject.resize({ width: 390, height: 740 });
	assert.equal(f.requests[0].opts.viewportW, 390);
	assert.equal(f.requests[0].opts.viewportH, 700);
	assert.equal(f.requests[0].opts.shouldCommit(), false);
	f.requests[1].resolve(true); await settle();
	f.requests[0].resolve(true); await settle();
	assert.equal(f.publications.length, 1);
});

test("route loss, a later inactive request, and cleanup all invalidate pending About publishes", async () => {
	for (const invalidate of [
		f => f.setOwner(false),
		f => { f.setOwner(false); f.subject.resize({ width: 390, height: 740 }); f.setOwner(true); },
		f => f.subject.dispose(),
	]) {
		const f = runtimeFixture();
		f.subject.resize({ width: 390, height: 700 });
		invalidate(f);
		assert.equal(f.requests[0].opts.shouldCommit(), false);
		f.requests[0].resolve(true); await settle();
		assert.equal(f.publications.length, 0);
	}
});

function paintFixture() {
	const start = story.indexOf("export function ensureAboutPanelHudCanvases");
	const end = story.indexOf("\n/** Session paint buffers", start);
	const frames = [], paints = [], crops = [], committed = [], preparedLocales = new Map();
	const code = story.slice(start, end).replace(/^export /gm, "");
	const canvas = () => ({ width: 390, height: 700, getContext: () => ({ clearRect() {} }) });
	const subject = vm.runInNewContext(`let preparedViewport = ""; ${code}; ({ensure: ensureAboutPanelHudCanvases})`, {
		window: { innerWidth: 999, innerHeight: 999 }, document: { createElement: canvas },
		store: { siteLocale: "ru" }, normalizeSiteLocale: locale => locale,
		pendingLocalePaints: new Map(), preparedLocales,
		selectPreparedAboutPanelHudLocale(locale, width, height) {
			const key = `${locale}|${width}x${height}`;
			if (!preparedLocales.has(key)) return false;
			committed.push(key); return true;
		},
		ensureCaseStudyCanvasFonts: async () => {},
		resolveCaseProjectCanvasNavigationLayout: () => null,
		estimateVerticalZone: () => null, ABOUT_HUD_PROJECT: {},
		resolveAboutResponsiveLayout: () => true,
		paintAboutCompactHud(args) { paints.push(args); return { mosaicBounds: { x: 0, y: 0, width: 100, height: paints.length * 100 } }; },
		paintCaseStudyPanelHudFrame: () => { throw new Error("unexpected desktop painter"); },
		buildFrame: id => ({ id }), buildMosaic: (_canvas, bounds) => ({ bounds }),
		nextPaint: () => new Promise(resolve => frames.push(resolve)),
		cropAboutCanvas(source, bounds, width, height) { crops.push({ width, height }); return source; },
	});
	return { ...subject, frames, paints, crops, committed, preparedLocales,
		async frame() { assert.ok(frames.length); frames.shift()(); await settle(); },
		async drain() { for (let i = 0; i < 30; i++) { await settle(); if (!frames.length) return; frames.shift()(); } throw new Error("paint did not settle"); },
	};
}

test("cancellation at the next paint frame avoids the remaining heavy panel paints", async () => {
	const f = paintFixture(); let live = true;
	const job = f.ensure({ viewportW: 390, viewportH: 700, shouldCommit: () => live });
	await settle(); assert.equal(f.paints.length, 1);
	live = false; await f.frame();
	assert.equal(await job, false);
	assert.equal(f.paints.length, 1);
	assert.equal(f.committed.length, 0);
});

test("compact stage mosaic includes the tallest prepared copy after cropping", async () => {
	const f = paintFixture();
	const job = f.ensure({ viewportW: 390, viewportH: 700 });
	await f.drain();
	assert.equal(await job, true);
	const { mosaic } = f.preparedLocales.get("ru|390x700");
	assert.equal(mosaic.bounds.height, 300);
	assert.equal(mosaic.bounds.viewportH, 700);
});

test("cancellation in the final crop frame cannot replace session buffers", async () => {
	const f = paintFixture(); let live = true;
	const job = f.ensure({ viewportW: 390, viewportH: 700, shouldCommit: () => live });
	await settle();
	for (let i = 0; i < 5; i++) await f.frame();
	assert.equal(f.paints.length, 3); assert.equal(f.crops.length, 3);
	live = false; await f.frame();
	assert.equal(await job, false);
	assert.equal(f.crops.length, 3);
	assert.equal(f.preparedLocales.size, 0);
	assert.equal(f.committed.length, 0);
});

test("a live About job paints and commits all four buffers at the requested viewport", async () => {
	const f = paintFixture();
	const job = f.ensure({ viewportW: 390, viewportH: 700, shouldCommit: () => true });
	await f.drain(); assert.equal(await job, true);
	assert.equal(f.paints.length, 3); assert.equal(f.crops.length, 4);
	assert.ok(f.paints.every(p => p.viewportW === 390 && p.viewportH === 700));
	assert.deepEqual(f.committed, ["ru|390x700"]);
});

test("A → B → A retries the cancelled pending size once and commits only the current size", async () => {
	const f = paintFixture(); let generation = 1;
	const a = f.ensure({ viewportW: 390, viewportH: 700, shouldCommit: () => generation === 1 });
	await settle(); generation++;
	const b = f.ensure({ viewportW: 390, viewportH: 740, shouldCommit: () => generation === 2 });
	await settle(); generation++;
	const latest = f.ensure({ viewportW: 390, viewportH: 700, shouldCommit: () => generation === 3 });
	await f.drain();
	assert.equal(await a, false); assert.equal(await b, false); assert.equal(await latest, true);
	assert.deepEqual(f.committed, ["ru|390x700"]);
	assert.equal(f.paints.length, 5, "two abandoned first panels plus three latest panels");
});

test("unguarded warm callers continue to share their pending job", async () => {
	const f = paintFixture();
	const a = f.ensure({ viewportW: 390, viewportH: 700 });
	const b = f.ensure({ viewportW: 390, viewportH: 700 });
	assert.equal(a, b);
	await f.drain(); assert.equal(await a, true); assert.equal(f.paints.length, 3);
});

test("case HUD listens to committed viewport events, retains menu observation and initial paint, and unsubscribes", () => {
	const start = casePainter.indexOf("\t\tconst onResize =");
	const end = casePainter.indexOf("\n\t\treturn () =>", start);
	const cleanup = casePainter.match(/\t\t\tstopViewportResize\(\);\n\t\t\tresizeObserver\?\.disconnect\(\);/)[0];
	const requests = []; let viewportListener, menuListener, disconnected = false;
	const menu = {};
	const dispose = vm.runInNewContext(`(() => { ${casePainter.slice(start, end)}; return () => { ${cleanup} }; })()`, {
		requestPaintRef: { current: force => requests.push(force) }, LEFT_MENU_SELECTOR: "menu",
		document: { querySelector: () => menu },
		subscribeSceneViewportResize(callback) { viewportListener = callback; return () => { viewportListener = null; }; },
		ResizeObserver: class {
			constructor(callback) { menuListener = callback; }
			observe(element) { assert.equal(element, menu); }
			disconnect() { disconnected = true; }
		},
	});
	assert.deepEqual(requests, [true]);
	viewportListener({ width: 390, height: 700 }); menuListener();
	assert.deepEqual(requests, [true, true, true]);
	dispose(); assert.equal(viewportListener, null); assert.equal(disconnected, true);
});
