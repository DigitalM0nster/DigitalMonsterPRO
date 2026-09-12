import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { Vector4 } from "three";
import { ContactsGpuTextMotion } from "./text/contactsGpuTextMotion.js";

test("GPU replacement pass sleeps at both endpoints, wakes for motion/preview and survives warm restore", () => {
	const layerSource = readFileSync(new URL("./text/ContactsGpuTextLayer.js", import.meta.url), "utf8")
		.replace(/^import[\s\S]*?;\s*$/gm, "").replace("export class", "class");
	const Layer = vm.runInNewContext(`${layerSource}\nContactsGpuTextLayer`, {
		GlitchCanvasTextLayer: class { updateLayerOpacity() {} },
	});
	const u = { uMode: { value: 0 }, uTime: { value: 0 }, uTiming: { value: new Vector4() }, uPreview: { value: 0 }, opacity: { value: 0.5 } };
	const layer = Object.create(Layer.prototype);
	Object.assign(layer, { mainMaterial: { uniforms: u }, snakeMaterial: { uniforms: u }, snakeMesh: { visible: true } });
	layer.motion = new ContactsGpuTextMotion(u, [], () => ({ letters: 75, symbols: 50, fade: 100, scale: 1, duration: 200, finish: 200 }), () => 1000);
	for (const mode of ["appear", "hover", "disappear"]) {
		layer.motion.setVisible(mode !== "appear");
		layer.updateLayerOpacity(1000); assert.equal(layer.snakeMesh.visible, false);
		layer.motion.run(mode);
		layer.updateLayerOpacity(1050); assert.equal(layer.snakeMesh.visible, true);
		layer.updateLayerOpacity(1400); assert.equal(layer.snakeMesh.visible, false);
	}
	u.uPreview.value = 1; layer.syncPassVisibility(); assert.equal(layer.snakeMesh.visible, true);
	u.uPreview.value = 0; layer.syncPassVisibility(); assert.equal(layer.snakeMesh.visible, false);
	const sceneSource = readFileSync(new URL("./ContactsScene.js", import.meta.url), "utf8")
		.replace(/^import[\s\S]*?;\s*$/gm, "").replace("export class", "class");
	const Scene = vm.runInNewContext(`${sceneSource}\nContactsScene`, {
		PortfolioHubScene: class { beginWarmupDraw() { return {}; } endWarmupDraw() {} }, ContactsGpuTextLayer: Layer,
	});
	const scene = Object.create(Scene.prototype);
	scene.plateProjectLabels = scene.plateDetailsButtons = { attachments: [] };
	scene.screenTitle = { root: { visible: false }, rightGroup: { visible: false }, projectsColumn: { layers: [layer] } };
	const before = JSON.stringify(u);
	const token = scene.beginWarmupDraw();
	try { assert.equal(layer.snakeMesh.visible, true); assert.equal(u.uMode.value, 3); }
	finally { scene.endWarmupDraw(token); }
	assert.equal(layer.snakeMesh.visible, false); assert.equal(JSON.stringify(u), before);
	assert.equal(scene.screenTitle.root.visible, false);
});

test("inactive details keep their bitmap until another painter changes its pixels", () => {
	const source = readFileSync(new URL("../portfolio/hub/hubPlateDetailsButton.js", import.meta.url), "utf8");
	const method = source.slice(source.indexOf("\tsetFocusReveal("), source.indexOf("\n\tdispose()", source.indexOf("\tsetFocusReveal(")));
	let paints = 0, clears = 0;
	const setFocusReveal = vm.runInNewContext(`({${method}}).setFocusReveal`, {
		portfolioHubPlatesConfig: {},
		updateDetailsTexture: texture => { texture.version++; paints++; },
		clearDetailsSnakeTexture: texture => { texture.version++; clears++; },
		applyDetailsSnakeOpacityToEntry() {},
		applyHubPlateLabelGlitchUniforms() {},
		applyHubPlateLabelRevealUniforms() {},
	});
	const material = { uniforms: { arrowOffsetUv: { value: 0.02 }, opacity: { value: 1 } } };
	const entry = { group: { visible: false }, texture: { version: 1 }, snakeTexture: { version: 1 }, materials: [material], snakeMaterials: [], planes: [] };
	const owner = { attachments: [{ projectIndex: 0, entry }], _getResolvedCfg: () => ({}) };
	for (let i = 0; i < 120; i++) setFocusReveal.call(owner, -1);
	assert.equal(paints, 1); assert.equal(clears, 1);
	assert.equal(material.uniforms.arrowOffsetUv.value, 0);
	// Locale/config painters own texture invalidation. The next inactive frame
	// restores clean content once, then stops painting again.
	entry.texture.version++; entry.glitchActive = true; entry.arrowHover = 1;
	for (let i = 0; i < 120; i++) setFocusReveal.call(owner, -1);
	assert.equal(paints, 2); assert.equal(clears, 2);
	assert.equal(entry.glitchActive, false); assert.equal(entry.arrowHover, 0);
	setFocusReveal.call(owner, 0, 1); assert.equal(entry.group.visible, true);
	entry.snakeTexture.version++;
	setFocusReveal.call(owner, -1); assert.equal(entry.group.visible, false);
	assert.equal(paints, 3); assert.equal(clears, 3);
});

test("details hover and reversal move the prepared arrow without repainting text", () => {
	const source = readFileSync(new URL("../portfolio/hub/hubPlateDetailsButton.js", import.meta.url), "utf8");
	const start = source.indexOf("\tupdateHover(");
	const method = source.slice(start, source.indexOf("\n\t/**", start));
	const updateHover = vm.runInNewContext(`({${method}}).updateHover`, {
		portfolioHubPlatesConfig: {},
		getArrowHoverOffset: cfg => cfg.arrowHoverOffset ?? 8,
		updateDetailsTexture: () => assert.fail("hover must not repaint or upload the bitmap"),
	});
	const materials = Array.from({ length: 2 }, () => ({ uniforms: { arrowOffsetUv: { value: 0 } } }));
	const entry = {
		group: { visible: true }, plane: { position: { z: 0 } }, planes: [], hitArea: { position: {} },
		materials, canvasWidth: 305, arrowHover: 0, lastArrowOffsetPx: 0,
	};
	const cfg = { plateDetailsButton: { arrowHoverOffset: 8 } };
	const owner = {
		_getResolvedCfg: () => cfg, _getFocusedAttachment: () => ({ entry }),
		_updateFocusedGlitchTexture() {}, _detailsHover: 0, _detailsHoverTarget: 1,
	};
	for (const target of [1, 0, 1, 0]) {
		owner._detailsHoverTarget = target;
		for (let i = 0; i < 60; i++) updateHover.call(owner, 1 / 60);
		for (const material of materials) {
			assert.ok(Math.abs(material.uniforms.arrowOffsetUv.value * entry.canvasWidth - target * 8) <= 0.1);
			assert.equal(material.uniforms.arrowOffsetUv.value, entry.lastArrowOffsetPx / entry.canvasWidth);
		}
	}
	// Locale animation keeps the current arrow position; hover resumes afterwards.
	entry.localeSwitchController = {};
	owner._detailsHoverTarget = 1;
	const frozen = entry.lastArrowOffsetPx;
	for (let i = 0; i < 20; i++) updateHover.call(owner, 1 / 60);
	assert.equal(entry.lastArrowOffsetPx, frozen);
	entry.localeSwitchController = null;
	updateHover.call(owner, 1 / 60);
	assert.ok(entry.lastArrowOffsetPx > 7);
});

test("Contacts warms hidden plate nodes after update and restores their exact flags", () => {
	const source = readFileSync(new URL("./ContactsScene.js", import.meta.url), "utf8")
		.replace(/^import[\s\S]*?;\s*$/gm, "").replace("export class", "class");
	class Base {
		beginWarmupDraw() { return {}; }
		endWarmupDraw() {}
		update() { for (const owner of [this.plateProjectLabels, this.plateDetailsButtons]) for (const { entry } of owner.attachments) entry.group.visible = false; }
	}
	const Contacts = vm.runInNewContext(`${source}\nContactsScene`, { PortfolioHubScene: Base, ContactsGpuTextLayer: class {} });
	const scene = Object.create(Contacts.prototype);
	const child = { visible: false, frustumCulled: true };
	const group = { visible: true, frustumCulled: false, traverse(fn) { fn(this); fn(child); } };
	scene.plateProjectLabels = { attachments: [{ entry: { group } }] };
	scene.plateDetailsButtons = { attachments: [] };
	scene.screenTitle = { projectsColumn: { layers: [] } };
	const token = scene.beginWarmupDraw();
	try {
		scene.update(1 / 60, {});
		assert.equal(group.visible, true); assert.equal(child.visible, true);
		assert.equal(child.frustumCulled, false);
	} finally {
		scene.endWarmupDraw(token);
	}
	assert.equal(group.visible, true); assert.equal(group.frustumCulled, false);
	assert.equal(child.visible, false); assert.equal(child.frustumCulled, true);
	scene.update(1 / 60, {});
	assert.equal(group.visible, false); assert.equal(child.visible, false);
});
