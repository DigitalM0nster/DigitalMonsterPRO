import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as THREE from "three";

const stripImports = (source) => source.replace(/^import[\s\S]*?;\s*$/gm, "");
const config = stripImports(readFileSync(new URL("./aboutEpicTextConfig.js", import.meta.url), "utf8"))
	.replaceAll("export ", "");
const source = stripImports(readFileSync(new URL("./AboutEpicTextController.js", import.meta.url), "utf8"))
	.replace("export class", "class").replaceAll("import.meta.env.DEV", "false");

function fixture() {
	const tune = vm.runInNewContext(`${config}\naboutEpicTextTune`, { ABOUT_MATERIALS: { neon: { color: "#00b3ff" } } });
	const { Controller, uniforms } = vm.runInNewContext(`${source}\n({ Controller: AboutEpicTextController, uniforms: makeUniforms })`, {
		THREE, aboutEpicTextTune: tune, getGraphicsTier: () => "low",
	});
	const controller = new Controller();
	let parses = 0, builds = 0, visuals = 0;
	for (const locale of ["ru", "en", "zh"]) {
		const variant = {};
		for (const key of ["fillMat", "strokeMat"]) {
			const u = uniforms(new THREE.Vector4(), 0);
			for (const name of ["uTint", "uCore", "uOutline"]) {
				const color = u[name].value;
				color.set = (value) => { parses++; return THREE.Color.prototype.set.call(color, value); };
			}
			variant[key] = { uniforms: u };
		}
		controller._variants.set(locale, variant);
	}
	controller._buildStroke = () => { builds++; };
	controller._applyLocaleVisuals = () => { visuals++; };
	return { controller, tune, counts: () => ({ parses, builds, visuals }) };
}

test("unchanged appearance avoids colour parsing and rebuilds but keeps locale animation live", () => {
	const { controller, counts } = fixture();
	controller.syncTuneFromDev();
	const initial = counts();
	for (let i = 0; i < 600; i++) controller.syncTuneFromDev();
	assert.deepEqual(counts(), { ...initial, visuals: initial.visuals + 600 });
});

test("live edits update every prepared locale and outline edits still rebuild once", () => {
	const { controller, tune, counts } = fixture();
	controller.syncTuneFromDev();
	tune.tint = "#ff0000";
	tune.intensity = 7;
	controller.syncTuneFromDev();
	for (const variant of controller._variants.values()) {
		for (const material of [variant.fillMat, variant.strokeMat]) {
			assert.equal(material.uniforms.uTint.value.getHex(), 0xff0000);
			assert.equal(material.uniforms.uIntensity.value, 7);
		}
	}
	assert.equal(counts().builds, 3);
	tune.outlineWidth *= 2;
	controller.syncTuneFromDev();
	controller.syncTuneFromDev();
	assert.equal(counts().builds, 6);
});

test("compact resize applies and reverses Low brightness without changing settings", () => {
	const { controller, tune } = fixture();
	controller.syncTuneFromDev();
	const u = controller._variants.get("ru").fillMat.uniforms;
	controller.setCompactViewport(330, 568);
	controller.syncTuneFromDev();
	assert.equal(u.uIntensity.value, tune.intensity * 2);
	assert.equal(u.uFillDark.value, Math.max(.9, tune.fillDark));
	controller.setCompactViewport(1920, 1080);
	controller.syncTuneFromDev();
	assert.equal(u.uIntensity.value, tune.intensity);
	assert.equal(u.uFillDark.value, tune.fillDark);
});
