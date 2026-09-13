import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

function finiteHelpers() {
	const source = readFileSync(new URL("./finiteBloomInput.js", import.meta.url), "utf8")
		.replace(/^import .*;\r?\n/gm, "").replaceAll("export function", "function");
	return vm.runInNewContext(`${source}\n({ attachFiniteLuminanceInput, createFiniteBloomInputEffect })`, {
		Effect: class { constructor(name, fragmentShader, options) { Object.assign(this, { name, fragmentShader }, options); } },
		BlendFunction: { SRC: "src" },
	});
}

function warmLuminance(pipeline) {
	const material = pipeline.bloomEffect.luminanceMaterial;
	material.onBeforeCompile({ fragmentShader: material.fragmentShader, uniforms: {} }, pipeline.renderer);
}

function fixture() {
	const source = readFileSync(new URL("./ModelsBloomPipeline.js", import.meta.url), "utf8")
		.replace(/^import .*;\r?\n/gm, "").replace("export class", "class");
	const config = { mipmapBlur: true, levels: 4, radius: 0.7, resolutionScale: 0.5, intensity: 1, threshold: 0.8, smoothing: 0.2 };
	class Resource { dispose() { this.disposed = true; } }
	class Material extends Resource { constructor(options) { super(); Object.assign(this, options); } }
	class Composer extends Resource {
		constructor(renderer, options) {
			super(); this.options = options; this.passes = []; this.texture = {}; this.draws = 0;
			this.inputBuffer = { width: 256, height: 128, texture: { type: 1016 } };
			this.outputBuffer = { width: 256, height: 128, texture: { type: 1016 } };
		}
		removeAllPasses() { this.passes = []; }
		addPass(pass) { this.passes.push(pass); }
	}
	const Pipeline = vm.runInNewContext(`${source}\nModelsBloomPipeline`, {
		THREE: { Scene: class { add() {} }, OrthographicCamera: class {}, PlaneGeometry: Resource,
			Uniform: class { constructor(value) { this.value = value; } },
			Mesh: class { constructor(geometry, material) { Object.assign(this, { geometry, material }); } },
			ShaderMaterial: Material, NoBlending: 0, HalfFloatType: 1016, UnsignedByteType: 1009, LinearSRGBColorSpace: "linear" },
		EffectComposer: Composer,
		RenderPass: class { constructor() { this.clearPass = { enabled: true }; } },
		EffectPass: class {
			constructor(camera, ...effects) { this.renderToScreen = true; this.draws = 0; this.effects = effects; }
			render(renderer, input, output, delta) {
				this.draws++; this.last = { input, output, delta, autoClear: renderer.autoClear, renderToScreen: this.renderToScreen,
					finiteEnabled: this.effects[0].uniforms.get("finiteInputEnabled").value };
				renderer.setRenderTarget(output);
				if (this.fail) throw new Error("draw failed");
			}
		},
		BloomEffect: class { constructor(options) {
			this.options = options; this.blendMode = {}; this.mipmapBlurPass = {};
			this.luminanceMaterial = { fragmentShader: "void main(){vec4 texel=texture2D(inputBuffer,vUv);}", onBeforeCompile() {}, customProgramCacheKey() { return "luma"; } };
			this.luminancePass = { enabled: true, renderTarget: { width: 256, height: 128 } };
		} },
		...finiteHelpers(),
		BlendFunction: { SCREEN: 1 }, KernelSize: { VERY_SMALL: 0, HUGE: 5 },
		siteBloomArtDirection: config, getSiteBloomConfig: () => config,
		easing: { damp(object, key, value) { object[key] = value; } },
		renderComposerToTexture(composer) { composer.draws++; return composer.texture; },
	});
	const renderer = { autoClear: true, target: { name: "previous" }, getContext: () => ({ isContextLost: () => false }),
		getRenderTarget() { return this.target; }, setRenderTarget(target) { this.target = target; } };
	const pipeline = new Pipeline(renderer, { bloomHdr: true });
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

function preparedTarget(width = 256, height = 128) {
	return { width, height, texture: { type: 1016, colorSpace: "linear" } };
}

test("prepared hex input skips copy, retains composer buffers/pass, and restores render state", () => {
	const { pipeline, config } = fixture();
	pipeline._buildBloomChain(config);
	warmLuminance(pipeline);
	const pass = pipeline.effectPass, input = pipeline.composer.inputBuffer, output = pipeline.composer.outputBuffer;
	const previous = pipeline.renderer.target;
	for (const reveal of [0, .4, 1, .4]) {
		const source = preparedTarget();
		assert.equal(pipeline.renderPreparedTarget(source, 1 / 60, { reveal }), output.texture);
		assert.equal(pass.last.input, source); assert.equal(pass.last.output, output);
		assert.equal(pass.last.autoClear, false); assert.equal(pass.last.renderToScreen, false);
		assert.equal(pass.last.finiteEnabled, 1); assert.equal(pipeline.finiteInputEnabled.value, 0);
		assert.equal(pass.renderToScreen, true); assert.equal(pipeline.renderer.autoClear, true);
		assert.equal(pipeline.renderer.target, previous);
		assert.equal(pipeline.bloomEffect.intensity, config.intensity * reveal);
		assert.equal(pipeline.composer.inputBuffer, input); assert.equal(pipeline.composer.outputBuffer, output);
		assert.equal(pipeline.effectPass, pass);
	}
	assert.equal(pass.draws, 4); assert.equal(pipeline.composer.draws, 0);
	assert.equal(output.texture.colorSpace, "linear");
});

test("prepared input rejects dimension/HDR/color-space mismatch and target or texture alias", () => {
	const { pipeline, config } = fixture(); pipeline._buildBloomChain(config);
	assert.ok(!pipeline.canRenderPreparedTarget(preparedTarget()), "uncompiled luminance must retain legacy copy");
	warmLuminance(pipeline);
	const invalid = [preparedTarget(255), preparedTarget(256, 127),
		{ ...preparedTarget(), texture: { type: 1009, colorSpace: "linear" } },
		{ ...preparedTarget(), texture: { type: 1016, colorSpace: "srgb" } },
		pipeline.composer.outputBuffer,
		{ ...preparedTarget(), texture: pipeline.composer.outputBuffer.texture }];
	for (const target of invalid) {
		assert.ok(!pipeline.canRenderPreparedTarget(target));
		assert.equal(pipeline.renderPreparedTarget(target, 1 / 60), pipeline.composer.texture);
	}
	pipeline.gfx.bloomHdr = false;
	assert.ok(!pipeline.canRenderPreparedTarget(preparedTarget()));
	assert.equal(pipeline.renderPreparedTarget(preparedTarget(), 1 / 60), pipeline.composer.texture);
	assert.equal(pipeline.effectPass.draws, 0); assert.equal(pipeline.composer.draws, invalid.length + 1);
});

test("a failed direct effect restores caller target, clear mode and pass output mode", () => {
	const { pipeline, config } = fixture(); pipeline._buildBloomChain(config);
	warmLuminance(pipeline);
	const target = pipeline.renderer.target;
	pipeline.effectPass.fail = true;
	assert.throws(() => pipeline.renderPreparedTarget(preparedTarget(), 1 / 60), /draw failed/);
	assert.equal(pipeline.renderer.target, target); assert.equal(pipeline.renderer.autoClear, true);
	assert.equal(pipeline.effectPass.renderToScreen, true);
	assert.equal(pipeline.finiteInputEnabled.value, 0);
});

test("direct input refuses downsampled/disabled luminance or changed effect order", () => {
	const { pipeline, config } = fixture(); pipeline._buildBloomChain(config); warmLuminance(pipeline);
	const target = preparedTarget(); assert.ok(pipeline.canRenderPreparedTarget(target));
	pipeline.bloomEffect.luminancePass.renderTarget.width = 128;
	assert.ok(!pipeline.canRenderPreparedTarget(target));
	pipeline.bloomEffect.luminancePass.renderTarget.width = 256;
	pipeline.bloomEffect.luminancePass.enabled = false;
	assert.ok(!pipeline.canRenderPreparedTarget(target));
	pipeline.bloomEffect.luminancePass.enabled = true;
	pipeline.effectPass.effects.reverse(); assert.ok(!pipeline.canRenderPreparedTarget(target));
});

test("finite luminance hook validates source, retains prior hook, and enables only after actual injection", () => {
	const { attachFiniteLuminanceInput, createFiniteBloomInputEffect } = finiteHelpers();
	const enabled = { value: 0 }; let calls = 0;
	const fragmentShader = "void main(){vec4 texel = texture2D(inputBuffer, vUv);gl_FragColor=texel;}";
	const material = { fragmentShader, onBeforeCompile(shader) { calls++; shader.previousCalled = true; }, customProgramCacheKey() { return "original"; } };
	const state = attachFiniteLuminanceInput(material, enabled);
	assert.equal(state.ready, false); assert.equal(material.customProgramCacheKey(), "original|finite-bloom-input-v1");
	const shader = { fragmentShader, uniforms: {} }; material.onBeforeCompile(shader, {});
	assert.equal(calls, 1); assert.equal(shader.previousCalled, true); assert.equal(state.ready, true);
	assert.equal(shader.uniforms.dmFiniteInputEnabled, enabled);
	assert.match(shader.fragmentShader, /texel=dmFiniteBloomInput\(texel\)/);
	material.onBeforeCompile({ fragmentShader: "void main(){}", uniforms: {} }, {});
	assert.equal(state.ready, false, "unexpected later compile retains legacy path");
	const badMaterial = { ...material, fragmentShader: "void main(){}" }, originalHook = badMaterial.onBeforeCompile;
	assert.equal(attachFiniteLuminanceInput(badMaterial, enabled).ready, false);
	assert.equal(badMaterial.onBeforeCompile, originalHook);
	const effect = createFiniteBloomInputEffect(enabled);
	assert.equal(effect.blendFunction, "src"); assert.equal(effect.uniforms.get("finiteInputEnabled"), enabled);
	assert.match(effect.fragmentShader, /greaterThan\(abs\(sampled\), vec4\(65504\.0\)\)/);
	assert.doesNotMatch(effect.fragmentShader, /65520/);
});

test("direct eligibility uses the same effective reveal bypass as ordinary bloom", () => {
	const source = readFileSync(new URL("./ModelsPostProcessPipeline.js", import.meta.url), "utf8")
		.replace(/^import .*;\r?\n/gm, "").replace("export class", "class");
	const Wrapper = vm.runInNewContext(`${source}\nModelsPostProcessPipeline`, {
		THREE: { MathUtils: { smoothstep(value, min, max) {
			const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
			return t * t * (3 - 2 * t);
		} } },
		ModelsBloomPipeline: class {
			canRenderPreparedTarget() { return true; }
			render() { return "old bloom"; }
			renderPreparedTarget() { return "direct bloom"; }
		},
	});
	const wrapper = new Wrapper({}, {}), target = { texture: {} };
	for (const reveal of [0, .000101, .000105, .0002, .4, 1]) {
		const oldResult = wrapper.applyBloom(target.texture, 0, reveal);
		assert.equal(wrapper.canApplyBloomFromPreparedTarget(target, reveal), oldResult !== target.texture);
		assert.equal(wrapper.applyBloomFromPreparedTarget(target, 0, reveal) === target.texture, oldResult === target.texture);
	}
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
