import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as THREE from "three";

const source = readFileSync(new URL("./sceneHudAtlas.js", import.meta.url), "utf8")
	.replace(/^import .*;\s*$/gm, "").replaceAll("export ", "");
function setup() {
	const paints = []; let measurements = 0, textures = 0, time = 0;
	const api = vm.runInNewContext(source + ";({createSceneHudAtlas,createSceneHudAtlasChunked})", {
		Uint8Array,
		THREE: { ...THREE, CanvasTexture: class extends THREE.CanvasTexture {
			constructor(canvas) { super(canvas); textures++; }
		} },
		performance: { now: () => ++time },
		document: { createElement: () => ({ getContext: () => ({
			scale() {}, save() {}, restore() {}, translate() {},
			measureText(char) { measurements++; return { width: char === "A" ? 7 : 9 }; },
			fillText(...args) { paints.push([this.font,this.fillStyle,...args]); },
		}) }) },
	});
	return { ...api, paints, counts: () => ({ measurements,textures }) };
}
const states = Array.from({ length: 3 }, () => [[
	{ text: "AB ABA", x: 90, y: 30, size: 14, color: "#ffffff", row: 0, align: "right" },
	{ text: "BA AB", x: 10, y: 60, size: 10, color: "#00a9ff", row: 1 },
]]);

test("chunked atlas retains paint order and letter metadata, reuses font metrics", async () => {
	const sync = setup(), chunked = setup(); let frames = 0;
	const expected = sync.createSceneHudAtlas(1,states,"test");
	const actual = await chunked.createSceneHudAtlasChunked(1,states,"test",undefined,()=>false,async()=>{ frames++; });
	assert.ok(frames > 0);
	assert.deepEqual(chunked.paints,sync.paints);
	assert.deepEqual(actual.orderTexture.image.data,expected.orderTexture.image.data);
	assert.equal(chunked.counts().measurements,4);
	assert.equal(actual.texture.minFilter,THREE.NearestFilter);
	assert.equal(actual.texture.generateMipmaps,false);
	for (const atlas of [actual,expected]) for (const key of ["texture","orderTexture","glyphTexture"]) atlas[key].dispose();
});

test("cancellation at a paint boundary never creates incomplete textures", async () => {
	const api = setup(); let cancelled = false;
	const atlas = await api.createSceneHudAtlasChunked(1,states,"test",undefined,()=>cancelled,async()=>{ cancelled=true; });
	assert.equal(atlas,null);
	assert.equal(api.counts().textures,0);
});
