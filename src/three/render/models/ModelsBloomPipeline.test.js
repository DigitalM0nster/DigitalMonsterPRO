import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

function fixture() {
	const source = readFileSync(new URL("./ModelsBloomPipeline.js", import.meta.url), "utf8")
		.replace(/^import .*;\r?\n/gm, "").replace("export class", "class");
	const config = { mipmapBlur: true, levels: 4, radius: 0.7, resolutionScale: 0.5, intensity: 1, threshold: 0.8, smoothing: 0.2 };
	class Resource { dispose() { this.disposed = true; } }
	class Material extends Resource { constructor(options) { super(); Object.assign(this, options); } }
	class Composer extends Resource {
		constructor(renderer, options) { super(); this.options = options; this.passes = []; this.texture = {}; this.draws = 0; }
		removeAllPasses() { this.passes = []; }
		addPass(pass) { this.passes.push(pass); }
	}
	const Pipeline = vm.runInNewContext(`${source}\nModelsBloomPipeline`, {
		THREE: { Scene: class { add() {} }, OrthographicCamera: class {}, PlaneGeometry: Resource,
			Mesh: class { constructor(geometry, material) { Object.assign(this, { geometry, material }); } },
			ShaderMaterial: Material, NoBlending: 0, HalfFloatType: 1016, UnsignedByteType: 1009, LinearSRGBColorSpace: "linear" },
		EffectComposer: Composer,
		RenderPass: class { constructor() { this.clearPass = { enabled: true }; } },
		EffectPass: class {},
		BloomEffect: class { constructor(options) { this.options = options; this.blendMode = {}; this.mipmapBlurPass = {}; this.luminanceMaterial = {}; } },
		BlendFunction: { SCREEN: 1 }, KernelSize: { VERY_SMALL: 0, HUGE: 5 },
		siteBloomArtDirection: config, getSiteBloomConfig: () => config,
		easing: { damp(object, key, value) { object[key] = value; } },
		renderComposerToTexture(composer) { composer.draws++; return composer.texture; },
	});
	const pipeline = new Pipeline({ getContext: () => ({ isContextLost: () => false }) }, { bloomHdr: true });
	return { pipeline, config };
}

test("bloom input uses a depth-free HDR composer and replaces pixels without a clear", () => {
	const { pipeline, config } = fixture();
	assert.equal(pipeline.composer.options.depthBuffer, false);
	assert.equal(pipeline.composer.options.frameBufferType, 1016);
	assert.equal(pipeline.inputMesh.material.blending, 0);
	assert.equal(pipeline.inputMesh.material.depthTest, false);
	assert.equal(pipeline.inputMesh.material.depthWrite, false);
	assert.equal(pipeline._buildBloomChain(config), true);
	assert.equal(pipeline.composer.passes[0].clearPass.enabled, false);
	assert.equal(pipeline.bloomEffect.options.radius, config.radius);
	assert.equal(pipeline.bloomEffect.options.resolutionScale, config.resolutionScale);
});

test("ordinary bloom frames reuse the prepared passes and only update input and uniforms", () => {
	const { pipeline, config } = fixture();
	pipeline._buildBloomChain(config);
	const passes = pipeline.composer.passes.slice(), effect = pipeline.bloomEffect;
	const textures = [{}, {}];
	for (let i = 0; i < 20; i++) {
		assert.equal(pipeline.render(textures[i % 2], 1 / 60, { reveal: 0.5 }), pipeline.composer.texture);
		assert.equal(pipeline.bloomEffect, effect);
		assert.deepEqual(pipeline.composer.passes, passes);
	}
	assert.equal(pipeline.composer.draws, 20);
	assert.equal(effect.intensity, config.intensity * 0.5);
	assert.equal(pipeline.inputMesh.material.uniforms.inputMap.value, textures[1]);
	pipeline.dispose();
	assert.equal(pipeline.composer.disposed, true);
	assert.equal(pipeline.inputMesh.material.disposed, true);
	assert.equal(pipeline.inputMesh.geometry.disposed, true);
});
