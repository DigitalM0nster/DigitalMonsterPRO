import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

// Exercise the real cache/lifecycle module; Canvas rasterization is compared in
// the browser against the unchanged painter, including intermediate snake slots.
function setup() {
	const frames = new Map(), fonts = new Map(), instances = [];
	const counters = { draw: 0, measure: 0, copy: 0 };
	let nextFrame = 1;
	const makeCanvas = () => ({ width: 240, height: 64, style: {}, getContext: () => ({
		setTransform() {}, clearRect() {}, drawImage() { counters.copy++; },
	}) });
	class Glitch {
		constructor(options) {
			this.options = { ...options }; this.pixelRatio = options.pixelRatio;
			this.canvas = makeCanvas(); this.ctx = {}; this.slots = [];
			instances.push(this); this.drawInPlace();
		}
		getDrawStyle() { return { ...this.options }; }
		getMeasureStyle() { return { ...this.options }; }
		ensureCanvasSize() { this.canvas.width = 240 * this.pixelRatio; this.canvas.height = 64 * this.pixelRatio; }
		drawInPlace() { counters.draw++; this.options.onRedraw(); }
		setPixelRatio(value) { if (this.pixelRatio !== value) { this.pixelRatio = value; this.ensureCanvasSize(); this.drawInPlace(); } }
		setText(text) { this.options.text = text; this.drawInPlace(); }
		clearHoverPassed() {}
		dispose() {}
	}
	const source = readFileSync(new URL("./siteArcNavSnake.js", import.meta.url), "utf8")
		.replace(/^import[\s\S]*?;\s*$/gm, "").replace(/export /g, "");
	const store = { graphicsTier: "high" };
	const api = vm.runInNewContext(`${source}\n({paintSiteArcNavSnakeDomLabel,registerSiteArcNavSnakeRepaint,disposeSiteArcNavSnake})`, {
		CanvasGlitchText: Glitch, store, SITE_ARC_DISPLAY_FONT: "TestFont",
		siteArcConfig: { snakeGlowStrength: 1, snakeGlowBlur: 5, snakeGlowAlpha: 1, snakePassedLetterAlpha: 0 },
		resolveSiteArcCanvasPixelRatio: tier => tier === "high" ? 2 : 1,
		measureCanvasGlitchTextSize: (_ctx, _slots, style) => { counters.measure++; return { width: style.text.length * style.fontSize + 20 }; },
		shouldAnimateSiteLocaleForCaseChrome: () => false,
		requestAnimationFrame: fn => { const id = nextFrame++; frames.set(id, fn); return id; },
		cancelAnimationFrame: id => frames.delete(id),
		document: { fonts: { addEventListener: (type, fn) => fonts.set(type, fn), removeEventListener: type => fonts.delete(type) } },
		window: { clearTimeout() {} }, queueMicrotask, playGlitchTextSound() {},
	});
	const canvas = makeCanvas(), style = { fontSize: 9, color: "white", fontFamily: "TestFont" };
	const paint = (text = "Home", nextStyle = style, target = canvas) => api.paintSiteArcNavSnakeDomLabel(target, "home::0", text, nextStyle);
	const flush = () => { const batch = [...frames.values()]; frames.clear(); batch.forEach(fn => fn()); };
	return { api, canvas, style, paint, flush, counters, instances, frames, fonts, store };
}

test("unchanged text neither measures, redraws nor requests its next repaint", () => {
	const t = setup(); t.api.registerSiteArcNavSnakeRepaint(t.paint); t.paint();
	const before = { ...t.counters };
	for (let i = 0; i < 120; i++) t.paint();
	assert.deepEqual(t.counters, before);
	assert.equal(t.frames.size, 0);
});

test("an engine bitmap change schedules one copy, without creating a repaint loop", () => {
	const t = setup(); t.api.registerSiteArcNavSnakeRepaint(t.paint); t.paint();
	const before = { ...t.counters }; t.instances[0].drawInPlace();
	assert.equal(t.frames.size, 1); t.flush();
	assert.equal(t.counters.copy, before.copy + 1);
	assert.equal(t.counters.draw, before.draw + 1);
	assert.equal(t.frames.size, 0);
});

test("cached style values still invalidate opacity, glow and removed options", () => {
	const t = setup(); t.paint();
	for (const [key, value] of [["mainOpacity", 0.5], ["replacementFullOpacity", true], ["replacementGlowPreview", true]]) {
		const before = { ...t.counters };
		t.instances[0].options[key] = value;
		t.paint();
		assert.equal(t.counters.draw, before.draw + 1);
		assert.equal(t.counters.measure, before.measure);
		t.paint(); assert.equal(t.counters.draw, before.draw + 1);
	}
	const draws = t.counters.draw;
	delete t.instances[0].options.replacementGlowPreview;
	t.paint(); assert.equal(t.counters.draw, draws + 1);
});

test("colour, copy, font load, DPR and a cleared destination invalidate the right caches", () => {
	const t = setup(); const unregister = t.api.registerSiteArcNavSnakeRepaint(t.paint); t.paint();
	const before = { ...t.counters };
	t.paint("Home", { ...t.style, color: "cyan" });
	assert.equal(t.counters.measure, before.measure);
	assert.equal(t.counters.draw, before.draw + 1);
	t.paint("Contacts"); assert.equal(t.counters.measure, before.measure + 1);
	t.store.graphicsTier = "low"; t.paint("Contacts");
	assert.equal(t.counters.measure, before.measure + 2);
	const copies = t.counters.copy; t.canvas.width = t.canvas.height = 1; t.paint("Contacts");
	assert.equal(t.counters.copy, copies + 1);
	const measured = t.counters.measure; t.fonts.get("loadingdone")(); t.paint("Contacts");
	assert.equal(t.counters.measure, measured + 1);
	unregister(); assert.equal(t.fonts.size, 0); t.api.disposeSiteArcNavSnake();
	assert.equal(t.frames.size, 0);
});

test("pending letter changes are drawn before presenting; disposed layers cannot schedule work", () => {
	const t = setup(); t.api.registerSiteArcNavSnakeRepaint(t.paint); t.paint();
	const before = { ...t.counters }; t.instances[0]._pendingDrawLayer = "both"; t.paint();
	assert.equal(t.counters.draw, before.draw + 1);
	assert.equal(t.counters.copy, before.copy + 1);
	t.api.disposeSiteArcNavSnake(); t.instances[0].drawInPlace();
	assert.equal(t.frames.size, 0);
});
