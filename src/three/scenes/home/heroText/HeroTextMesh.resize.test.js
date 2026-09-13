import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as THREE from "three";

const source = readFileSync(new URL("./HeroTextMesh.js", import.meta.url), "utf8")
	.replace(/^import[^;]+;\r?\n/gm, "").replace("export class HeroTextMesh", "class HeroTextMesh");
const fragmentSource = readFileSync(new URL("../../../shaders/heroText/heroTextFragment.glsl.js", import.meta.url), "utf8");
const sampleFunction = fragmentSource.match(/vec4 sampleTitleTexture\(vec2 uv\) \{[^]*?\n\}/)[0]
	.replace("vec4 sampleTitleTexture(vec2 uv)", "function sampleTitleTexture(uv)")
	.replace(/\b(?:float|vec4) (\w+) =/g, "let $1 =");

function sampleTitleUv(ratio, uv) {
	return vm.runInNewContext(`${sampleFunction}\nsampleTitleTexture(uv)`, {
		uTextureHeightRatio: ratio, uTexture: {}, uv, abs: Math.abs, max: Math.max,
		vec4: () => null, vec2: (x, y) => ({ x, y }), texture2D: (_, coords) => coords,
	});
}

function harness(tier = "high") {
	const viewport = { innerWidth: 390, innerHeight: 664, addEventListener() {}, removeEventListener() {} };
	const counts = { canvases: 0, paints: 0, fonts: 0 };
	const document = {
		fonts: { load() { counts.fonts++; return Promise.resolve(); } },
		createElement(type) {
			assert.equal(type, "canvas");
			counts.canvases++;
			const context = {
				measureText: () => ({ width: 42 }),
				fillText() { counts.paints++; },
			};
			let width = 0, height = 0;
			return {
				get width() { return width; }, set width(value) { width = Math.floor(value); },
				get height() { return height; }, set height(value) { height = Math.floor(value); },
				getContext: () => context,
			};
		},
	};
	class Reveal {
		setMaterials() {} prepareHidden() {} syncFromConfig() {}
	}
	const HeroTextMesh = vm.runInNewContext(`${source}\nHeroTextMesh`, {
		THREE, window: viewport, document, performance, console,
		getGraphicsTier: () => tier, getScenePixelRatio: () => tier === "high" ? 2 : 1,
		HeroTextRevealController: Reveal, heroTextShaderConfig: {}, heroTextGlitchConfig: {},
		createHeroTextRevealUniforms: () => ({ uRevealProgress: { value: 0.42 } }),
		applyHeroTitleShaderUniforms() {}, getHomeTextVisualSettings: () => ({}),
		heroTextVertexInstancedShader: "void main() {}",
	});
	const title = new HeroTextMesh({
		renderer: { capabilities: { getMaxAnisotropy: () => 8 } }, scene: new THREE.Scene(),
		canvasWidth: 2048, fragmentShader: "void main() {}", text: ["DIGITAL", "MONSTER"],
		offsetX: 0.06, offsetY: 0.25, fontFamily: "Jura", fontSize: 50, lineHeight: 58,
		fontWeight: 400, fontColor: "#ffffff", letterSpacing: 0.03,
		useInstancedLetters: true, shaderProfile: "title",
	});
	return { title, viewport, counts };
}

function glyphState(title, index) {
	const geometry = title.textMesh.geometry;
	const position = geometry.getAttribute("instancePosition");
	const scale = geometry.getAttribute("instanceScale");
	const uvOffset = geometry.getAttribute("instanceUvOffset");
	const uvScale = geometry.getAttribute("instanceUvScale");
	return {
		// Pixel distance from the title's top-left, independent of authored offset.
		top: (1 - position.getY(index) - scale.getY(index)) * title.height / 2,
		height: scale.getY(index) * title.height / 2,
		uv: sampleTitleUv(title._textureHeightRatio, {
			x: uvOffset.getX(index) + uvScale.getX(index) / 2,
			y: uvOffset.getY(index) + uvScale.getY(index) / 2,
		}),
	};
}

for (const tier of ["high", "medium", "low"]) {
	test(`${tier}: Safari height changes retain the title atlas, geometry and CSS glyph size`, async () => {
		const { title, viewport, counts } = harness(tier);
		await title.readyPromise;
		const texture = title._textTexture, geometry = title.textMesh.geometry;
		const materials = [title.textMaterial, title.fillMaterial];
		const versions = [texture.version, geometry.getAttribute("instancePosition").version];
		const beforeCounts = { ...counts };
		const before = Array.from({ length: title.textMesh.count }, (_, i) => glyphState(title, i));
		for (const height of [751, 590, 710, 664, 751, 590]) {
			viewport.innerHeight = height;
			title.resize(0.09);
			assert.equal(title._textTexture, texture);
			assert.equal(title.textMesh.geometry, geometry);
			assert.equal(title.fillMesh.geometry, geometry);
			assert.equal(texture.version, versions[0], "Retained pixels must not be uploaded again");
			assert.deepEqual(counts, beforeCounts, "No font wait, Canvas allocation or repaint");
			for (let i = 0; i < before.length; i++) {
				const after = glyphState(title, i);
				assert.ok(Math.abs(after.top - before[i].top) < 0.001);
				assert.ok(Math.abs(after.height - before[i].height) < 0.001);
				assert.ok(Math.abs(after.uv.y - before[i].uv.y) < 0.000001);
			}
			materials.forEach((material, i) => {
				assert.equal(i === 0 ? title.textMaterial : title.fillMaterial, material);
				assert.equal(material.uniforms.uRevealProgress.value, 0.42);
				assert.equal(material.uniforms.uResolution.value.y, height);
				assert.equal(material.uniforms.uPositionOffset.value.x, 0.09);
			});
		}
		assert.ok(geometry.getAttribute("instancePosition").version > versions[1]);
		const layoutVersion = geometry.getAttribute("instancePosition").version;
		title.offsetY = 0.31;
		title.resize(0.1);
		assert.equal(geometry.getAttribute("instancePosition").version, layoutVersion, "Movement needs uniforms only");
		assert.equal(title.textMaterial.uniforms.uPositionOffset.value.y, 0.31);
		assert.deepEqual(counts, beforeCounts);
	});
}

test("Changing font, viewport width, spacing or copy rebuilds the title raster", async () => {
	for (const change of [
		({ title }) => { title.fontSize *= 0.8; title.lineHeight *= 0.8; },
		({ title }) => { title.fontFamily = "Jura CJK"; },
		({ title }) => { title.fontWeight = 600; },
		({ title }) => { title.letterSpacing = 0.08; },
		({ title }) => { title.text = ["DIGITAL", "MONSTRE"]; },
		({ viewport }) => { viewport.innerWidth = 844; },
	]) {
		const state = harness("medium");
		const { title, counts } = state;
		await title.readyPromise;
		const texture = title._textTexture, geometry = title.textMesh.geometry;
		change(state);
		title.resize();
		await title.readyPromise;
		assert.equal(counts.canvases, 2);
		assert.notEqual(title._textTexture, texture);
		assert.notEqual(title.textMesh.geometry, geometry);
		assert.equal(title.textMaterial.uniforms.uRevealProgress.value, 0.42);
	}
});

test("Height reuse does not interrupt a pending genuine raster rebuild", async () => {
	const { title, viewport, counts } = harness();
	await title.readyPromise;
	title.fontSize = 42;
	title.resize();
	viewport.innerHeight = 751;
	title.resize();
	await title.readyPromise;
	const texture = title._textTexture;
	viewport.innerHeight = 700;
	title.resize();
	assert.equal(title._textTexture, texture);
	assert.equal(counts.canvases, 3);
	assert.equal(title.height, 700);
});

test("A title clipped by an exceptionally short initial canvas is rerasterized when space returns", async () => {
	const { title, viewport, counts } = harness("low");
	await title.readyPromise;
	viewport.innerHeight = 100;
	title.fontSize = 60;
	title.resize();
	await title.readyPromise;
	assert.equal(title._preparedRasterCoversTitle, false);
	const clippedTexture = title._textTexture;
	viewport.innerHeight = 664;
	title.resize();
	await title.readyPromise;
	assert.notEqual(title._textTexture, clippedTexture);
	assert.equal(title._preparedRasterCoversTitle, true);
	assert.equal(counts.canvases, 3);
});
