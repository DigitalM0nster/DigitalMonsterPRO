import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as THREE from "three";

const withoutImports = code => code.replace(/^import[^;]+;\r?\n/gm, "").replace(/export \{[^}]+\};/g, "").replace(/export /g, "");
const revealConfigSource = withoutImports(readFileSync(new URL("./heroTextRevealConfig.js", import.meta.url), "utf8"));
const revealSource = withoutImports(readFileSync(new URL("./heroTextReveal.js", import.meta.url), "utf8"));
const { HeroTextRevealController, createHeroTextRevealUniforms } = vm.runInNewContext(
	`${revealConfigSource}\n${revealSource}\n({HeroTextRevealController, createHeroTextRevealUniforms})`,
	{ THREE, performance, LOADER_CURTAIN_HIDE_MS: 0 },
);

const source = readFileSync(new URL("./HeroTextMesh.js", import.meta.url), "utf8");
const methodNames = ["_buildInstancedMesh", "_buildSplitInstancedMeshes", "_buildSingleInstancedMesh", "_bindRevealMaterials", "_completeTextRebuild"];
const methods = methodNames.map(name => source.match(new RegExp(`^\\t${name}\\([^]*?^\\t}`, "m"))[0]).join("\n");
const TextBuilder = vm.runInNewContext(`(class { ${methods} })`, {
	THREE, getGraphicsTier: () => "low", applyHeroTitleShaderUniforms() {}, heroTextVertexInstancedShader: "",
});

test("Resizing title layout keeps compiled materials and a partially revealed title", () => {
	for (const split of [true, false]) {
		const oldTexture = new THREE.Texture(), nextTexture = new THREE.Texture();
		const oldGeometry = new THREE.BufferGeometry();
		let disposedGeometry = 0, disposedTexture = 0;
		oldGeometry.addEventListener("dispose", () => disposedGeometry++);
		oldTexture.addEventListener("dispose", () => disposedTexture++);
		const materials = Array.from({ length: split ? 2 : 1 }, () => ({ uniforms: {
			uTexture: { value: oldTexture }, uTextureHeightRatio: { value: 1 }, uCharWidthNDC: {}, uCharHeightNDC: {},
			uVirtualCursor1: {}, uVirtualCursor2: {}, uVirtualCursor3: {},
			uRevealProgress: { value: 0.42 },
		} }));
		const mesh = { count: 14, geometry: oldGeometry };
		const text = Object.assign(new TextBuilder(), {
			canvasWidth: 2048, canvasHeight: 1152, letterSpacing: 0, _textureHeightRatio: 0.25,
			textMesh: mesh, textMaterial: materials[0], fillMesh: split ? { geometry: oldGeometry } : null,
			uVirtualCursor1: new THREE.Vector2(), uVirtualCursor2: new THREE.Vector2(), uVirtualCursor3: new THREE.Vector2(),
			_getMaterials: () => materials, _syncFrameUniforms() {},
		});
		text._buildInstancedMesh({ measureText: () => ({ width: 100 }) }, ["DIGITAL", "MONSTER"], 108, 120, nextTexture);
		assert.equal(text.textMesh, mesh);
		assert.equal(text.textMaterial, materials[0]);
		assert.notEqual(mesh.geometry, oldGeometry);
		if (split) assert.equal(text.fillMesh.geometry, mesh.geometry);
		assert.equal(disposedGeometry, 1);
		assert.equal(disposedTexture, 1);
		for (const material of materials) {
			assert.equal(material.uniforms.uTexture.value, nextTexture);
			assert.equal(material.uniforms.uTextureHeightRatio.value, 0.25);
			assert.equal(material.uniforms.uRevealProgress.value, 0.42);
		}
		mesh.geometry.dispose(); nextTexture.dispose();
	}
});

test("Home viewport resize retains the prepared hero instead of replaying its intro", () => {
	const sceneSource = readFileSync(new URL("../DigitalWhaleScene.js", import.meta.url), "utf8");
	const method = sceneSource.match(/^\tonViewportResize\([^]*?^\t}/m)[0];
	const scene = vm.runInNewContext(`({${method}})`);
	let resizes = 0;
	const hero = { resize() { resizes++; }, dispose() { assert.fail("Hero must survive viewport resize"); }, show() { assert.fail("Reveal must not restart"); } };
	Object.assign(scene, { heroTitle: hero, _heroRenderer: {}, _appStarted: true, _updateWhaleViewportLayout() {}, _updateWhaleBodySway() {} });
	scene.onViewportResize();
	assert.equal(scene.heroTitle, hero);
	assert.equal(resizes, 1);
});

test("Font completion after show keeps the deferred title reveal running", () => {
	for (const splitBloomLayers of [true, false]) {
		const reveal = new HeroTextRevealController();
		let completions = 0;
		const text = Object.assign(new TextBuilder(), {
			canvasWidth: 2048, canvasHeight: 2730, letterSpacing: 0, splitBloomLayers,
			fragmentShader: "", scene: new THREE.Scene(), reveal,
			uVirtualCursor1: new THREE.Vector2(), uVirtualCursor2: new THREE.Vector2(), uVirtualCursor3: new THREE.Vector2(),
			_pendingReveal: { intent: "enter", durationMs: 1 },
			_textRebuildResolve: () => { completions += 1; },
			_createInstancedUniforms: () => ({ ...createHeroTextRevealUniforms(), uProgress: { value: 1 }, uIsAppearing: { value: 1 } }),
			_getMaterials() { return [this.textMaterial, this.fillMaterial].filter(Boolean); },
			setComposeMode() {}, _flushPendingProgressAnim() {},
		});
		text._buildInstancedMesh({ measureText: () => ({ width: 100 }) }, ["DIGITAL", "MONSTER"], 240, 267, null);
		assert.ok(reveal._anim, "Rebinding must not cancel the pending enter");
		assert.equal(completions, 1);
		assert.equal(reveal.materials.length, splitBloomLayers ? 2 : 1);
		reveal._anim.startedAt -= 10;
		reveal.update(0.016);
		for (const material of reveal.materials) {
			assert.equal(material.uniforms.uRevealLinear.value, 1);
			assert.equal(material.uniforms.uRevealProgress.value, 1);
		}
	}
});
