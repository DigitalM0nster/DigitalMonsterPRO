import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as THREE from "three";
import { getScenePixelRatio, setScenePixelRatio } from "../../renderer/renderResolution.js";

const source = readFileSync(new URL("./DigitalWhaleScene.js", import.meta.url), "utf8");
const oceanMethods = source.slice(source.indexOf("\t_getParticleRasterScale()"), source.indexOf("\n\t_syncFogMaterials()"));
const whaleMethod = source.slice(source.indexOf("\t_applyWhaleVisuals()"), source.indexOf("\n\tapplyConfig()"));
const config = { pointColor: "#4dbbff", gridColor: "#002aff", pointScale: 12, pointAlpha: 1.5, pointGlow: 12, gridAlpha: 3 };

function harness(tier) {
	const Scene = vm.runInNewContext(`class Scene { ${oceanMethods} ${whaleMethod} }\nScene`, {
		getGraphicsTier: () => tier, getScenePixelRatio,
		digitalWhaleConfig: { whale: { pointScale: 6 } },
		getUnderwaterGrainBlurRadius: () => 0,
		applyWhaleVisuals(particles, options) {
			particles.material.uniforms.uPointScale.value = options.pointScale;
		},
	});
	const scene = new Scene();
	// Final UI canvas DPR deliberately differs from the scene's DPR.
	scene._heroRenderer = { getPixelRatio: () => 2 };
	const uniforms = () => ({
		uColor: { value: new THREE.Color() },
		...Object.fromEntries(["uWaveAmp", "uRippleAmp", "uPointScale", "uAlphaMult", "uGlow", "uCompactSurface", "uSideFade", "uGridAlpha", "uRasterScale"].map(key => [key, { value: 1 }])),
	});
	scene.oceanMaterial = { uniforms: uniforms() };
	scene.oceanGridMaterial = { uniforms: uniforms() };
	scene.whaleParticles = { material: { uniforms: uniforms() } };
	scene.whaleReady = true;
	return scene;
}

test("High particles retain their DPR-2 CSS size across fractional DPR and repeated resize/config sync", () => {
	const scene = harness("high");
	const ocean = scene.oceanMaterial, whale = scene.whaleParticles.material;
	for (const ratio of [2, 1, 1.25, 1.5, 0.75, 2, 1]) {
		setScenePixelRatio(scene._heroRenderer, ratio);
		for (let sync = 0; sync < 3; sync++) {
			scene._applyOceanMaterialConfig(config);
			scene._applyWhaleVisuals();
			assert.equal(ocean.uniforms.uPointScale.value / ratio, 6);
			assert.equal(whale.uniforms.uPointScale.value * whale.uniforms.uRasterScale.value / ratio, 3);
			assert.equal(scene.oceanGridMaterial.uniforms.uGridAlpha.value / ratio, 1.5);
			assert.equal(ocean.uniforms.uAlphaMult.value, config.pointAlpha);
			assert.equal(scene.oceanMaterial, ocean);
			assert.equal(scene.whaleParticles.material, whale);
		}
	}
});

test("Medium and Low retain their independently authored DPR-1 particle sizes", () => {
	for (const tier of ["medium", "low"]) {
		const scene = harness(tier);
		for (const ratio of [1, 1.5, 2]) {
			setScenePixelRatio(scene._heroRenderer, ratio);
			scene._applyOceanMaterialConfig(config);
			scene._applyWhaleVisuals();
			assert.equal(scene.oceanMaterial.uniforms.uPointScale.value / ratio, 12);
			assert.equal(scene.whaleParticles.material.uniforms.uRasterScale.value / ratio, 1);
		}
	}
});
