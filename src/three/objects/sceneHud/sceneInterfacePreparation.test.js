import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { PreparationScheduler } from "../../app/preparationScheduler.js";

const source = readFileSync(new URL("./SceneCanvasInterface.js", import.meta.url), "utf8");
const start = source.indexOf("\tasync prepare(");
const prepare = vm.runInNewContext(`({${source.slice(start, source.indexOf("\n\tpaint(", start))}}).prepare`, {
	document: { fonts: { load: async () => {} } }, PreparationScheduler,
});

test("every label and locale is painted/uploaded before ready while small labels share the CPU budget", async () => {
	let frame = 0, time = 0, updated = false;
	const paints = [], uploads = [];
	const item = { paint() {}, values: { ru: "А", en: "A", zh: "字" }, textures: new Map() };
	const ui = { elements: new Map([["label", item]]),
		paint(item, key, value) { paints.push([key, value, frame]); item.textures.set(key, { key }); time += 2; },
		renderer: { initTexture(texture) { uploads.push(texture.key); } }, update() { updated = true; } };
	await prepare.call(ui, new PreparationScheduler({ now: () => time, nextFrame: async () => { frame++; } }));
	assert.deepEqual(paints, [["ru", "А", 0], ["en", "A", 0], ["zh", "字", 1]]);
	assert.deepEqual(uploads, ["ru", "en", "zh"]); assert.equal(updated, true);
});

test("disposing an interface during its yield does not upload another label", async () => {
	let paints = 0;
	const ui = { elements: new Map([["a", { paint() {}, values: { a: "A" }, textures: new Map() }]]),
		paint() { paints++; }, renderer: { initTexture() {} }, update() {} };
	const scheduler = new PreparationScheduler({ budgetMs: 0, nextFrame: async () => { ui.disposed = true; } });
	await prepare.call(ui, scheduler); assert.equal(paints, 0);
});
