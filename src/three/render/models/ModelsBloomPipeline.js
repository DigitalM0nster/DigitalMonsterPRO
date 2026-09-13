import * as THREE from "three";
import { getScenePixelRatio } from "../../renderer/renderResolution.js";
import { EffectComposer, EffectPass, RenderPass, BloomEffect, BlendFunction, KernelSize } from "postprocessing";
import { easing } from "maath";
import { getSiteBloomConfig, siteBloomArtDirection } from "./siteBloomConfig.js";
import { renderComposerToTexture } from "../composerUtils.js";
import { compileSceneChunked } from "../../renderer/compileSceneChunked.js";
import { attachFiniteLuminanceInput, createFiniteBloomInputEffect } from "./finiteBloomInput.js";

const BLOOM_RADIUS_MIN = 0.1;
const BLOOM_RADIUS_MAX = 1.2;

const inputScene = new THREE.Scene();
const inputCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

function createFiniteBloomInputMaterial() {
	return new THREE.ShaderMaterial({
		uniforms: {
			inputMap: { value: null },
		},
		vertexShader: /* glsl */ `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = vec4(position.xy, 0.0, 1.0);
}
`,
		fragmentShader: /* glsl */ `
uniform sampler2D inputMap;
varying vec2 vUv;

void main() {
	vec4 sampled = texture2D(inputMap, vUv);
	bvec4 isNan = notEqual(sampled, sampled);
	bvec4 outsideHalfFloat = greaterThan(abs(sampled), vec4(65504.0));
	if (any(isNan) || any(outsideHalfFloat)) {
		sampled = vec4(0.0);
	}
	// A non-finite HDR texel poisons the mip chain and appears as a black tile.
	// Keep bloom input finite before any downsample or blur pass can spread it.
	// Match the former NormalBlending over transparent black, while replacing
	// every texel directly. No destination read or clear is required.
	float alpha = clamp(sampled.a, 0.0, 1.0);
	gl_FragColor = vec4(clamp(sampled.rgb, vec3(0.0), vec3(64.0)) * alpha, alpha);
}
`,
		depthTest: false,
		depthWrite: false,
		toneMapped: false,
		blending: THREE.NoBlending,
	});
}

function mapBloomRadiusToKernelSize(radius) {
	const t = (radius - BLOOM_RADIUS_MIN) / (BLOOM_RADIUS_MAX - BLOOM_RADIUS_MIN);
	const index = Math.round(Math.max(0, Math.min(1, t)) * KernelSize.HUGE);
	return Math.max(KernelSize.VERY_SMALL, Math.min(KernelSize.HUGE, index));
}

function usesMipmapBloom(bloomConfig, gfx) {
	return bloomConfig.mipmapBlur ?? gfx.bloomMipmap;
}

function resolveBloomFrameBufferType(gfx) {
	return gfx?.bloomHdr === false ? THREE.UnsignedByteType : THREE.HalfFloatType;
}

/**
 * Один bloom на текстуру слоя моделей (после mix).
 */
export class ModelsBloomPipeline {
	constructor(renderer, gfx) {
		this.renderer = renderer;
		this.gfx = gfx;
		this.composer = new EffectComposer(renderer, {
			multisampling: 0,
			depthBuffer: false,
			stencilBuffer: false,
			frameBufferType: resolveBloomFrameBufferType(gfx),
		});
		this.inputMesh = new THREE.Mesh(
			new THREE.PlaneGeometry(2, 2),
			createFiniteBloomInputMaterial(),
		);
		inputScene.add(this.inputMesh);
		this.bloomEffect = null;
		this.effectPass = null;
		this.finiteInputEnabled = new THREE.Uniform(0);
		this.finiteInputEffect = null;
		this.finiteLuminanceState = null;
		this.lastBloomConfigKey = "";
		this.size = { w: 0, h: 0 };
		this.damped = {
			intensity: siteBloomArtDirection.intensity,
			threshold: siteBloomArtDirection.threshold,
			smoothing: siteBloomArtDirection.smoothing,
		};
	}

	/** Prepare the same RT shader variants used by the following real bloom draw. */
	async prepareProgramsUnderCurtain(scheduler) {
		const built = await scheduler.run(() => this._buildBloomChain(getSiteBloomConfig(this.gfx)));
		if (!built) throw new Error("Bloom warm chain is not prepared");
		const compilePass = (pass, target) => compileSceneChunked(this.renderer, pass.scene, pass.camera, scheduler, target);
		for (const pass of this.composer.passes) {
			pass.renderToScreen = false;
			await compilePass(pass, this.composer.inputBuffer);
		}
		const effect = this.bloomEffect;
		await compilePass(effect.luminancePass, effect.luminancePass.renderTarget);
		if (effect.mipmapBlurPass.enabled) {
			const pass = effect.mipmapBlurPass;
			const previousMaterial = pass.fullscreenMaterial;
			try {
				// The library creates its persistent fullscreen mesh through this setter.
				// Both materials otherwise compile together on the first bloom frame.
				pass.fullscreenMaterial = pass.downsamplingMaterial;
				await compilePass(pass, pass.downsamplingMipmaps[0]);
				pass.fullscreenMaterial = pass.upsamplingMaterial;
				await compilePass(pass, pass.upsamplingMipmaps[0]);
			} finally {
				pass.fullscreenMaterial = previousMaterial;
			}
		} else {
			await compilePass(effect.blurPass, effect.renderTarget);
		}
	}

	_getBloomConfigKey(bloomConfig) {
		// Intensity, threshold and smoothing update uniforms in render().
		return `${bloomConfig.mipmapBlur}|${bloomConfig.levels}|${bloomConfig.radius}|${bloomConfig.resolutionScale}|${bloomConfig.kernelSize}`;
	}

	_buildBloomChain(bloomConfig) {
		if (this._isContextLost()) {
			return false;
		}

		const configKey = this._getBloomConfigKey(bloomConfig);
		if (this.lastBloomConfigKey === configKey && this.bloomEffect) {
			return true;
		}

		try {
			this.composer.removeAllPasses();
			const inputPass = new RenderPass(inputScene, inputCamera);
			// The finite-input fullscreen shader overwrites RGBA without blending.
			inputPass.clearPass.enabled = false;
			this.composer.addPass(inputPass);

			this.bloomEffect = new BloomEffect({
				blendFunction: BlendFunction.SCREEN,
				mipmapBlur: usesMipmapBloom(bloomConfig, this.gfx),
				levels: bloomConfig.levels,
				radius: bloomConfig.radius,
				kernelSize: bloomConfig.kernelSize ?? KernelSize.VERY_SMALL,
				resolutionScale: bloomConfig.resolutionScale ?? 0.5,
				intensity: bloomConfig.intensity,
				luminanceThreshold: bloomConfig.threshold,
				luminanceSmoothing: bloomConfig.smoothing,
			});
			this.bloomEffect.blendMode.blendFunction = BlendFunction.SCREEN;

			this._syncBloomBlurParams(bloomConfig);
			this.finiteInputEffect = createFiniteBloomInputEffect(this.finiteInputEnabled);
			this.finiteLuminanceState = attachFiniteLuminanceInput(this.bloomEffect.luminanceMaterial, this.finiteInputEnabled);
			this.effectPass = new EffectPass(inputCamera, this.finiteInputEffect, this.bloomEffect);
			this.composer.addPass(this.effectPass);
			this._sizeSceneBuffers();
			this.composer.autoRenderToScreen = false;
			this.lastBloomConfigKey = configKey;
			return true;
		} catch (error) {
			console.warn("[ModelsBloomPipeline] build failed", error);
			this.bloomEffect = null;
			this.effectPass = null;
			this.lastBloomConfigKey = "";
			return false;
		}
	}

	_isContextLost() {
		const gl = this.renderer.getContext();
		return !gl || gl.isContextLost();
	}

	_syncBloomBlurParams(bloomConfig) {
		if (!this.bloomEffect) {
			return;
		}

		if (usesMipmapBloom(bloomConfig, this.gfx)) {
			this.bloomEffect.mipmapBlurPass.radius = bloomConfig.radius;
			this.bloomEffect.mipmapBlurPass.levels = Math.round(bloomConfig.levels);
			return;
		}

		this.bloomEffect.kernelSize = bloomConfig.kernelSize ?? mapBloomRadiusToKernelSize(bloomConfig.radius);
	}

	setSize(width, height) {
		if (width <= 0 || height <= 0) {
			return;
		}
		if (this.size.w === width && this.size.h === height) {
			return;
		}
		this.size = { w: width, h: height };
		this._sizeSceneBuffers();
	}

	_sizeSceneBuffers() {
		if (!this.size.w || !this.size.h) return;
		const ratio = getScenePixelRatio(this.renderer);
		const width = Math.floor(this.size.w * ratio), height = Math.floor(this.size.h * ratio);
		// EffectComposer.setSize/addPass use the final drawing buffer's size.
		// Size only the public offscreen buffers/passes; never resize the canvas.
		this.composer.inputBuffer.setSize(width, height);
		this.composer.outputBuffer.setSize(width, height);
		for (const pass of this.composer.passes) pass.setSize(width, height);
	}

	/**
	 * @param {THREE.Texture} inputTexture
	 * @param {number} delta
	 * @param {{ reveal?: number }} [options]
	 * @returns {THREE.Texture | null}
	 */
	_prepareFrame(inputTexture, delta, options = {}) {
		if (!inputTexture || this._isContextLost()) {
			return null;
		}

		const bloomConfig = getSiteBloomConfig(this.gfx);
		if (!this._buildBloomChain(bloomConfig) || !this.bloomEffect) {
			return null;
		}

		const inputUniform = this.inputMesh.material.uniforms.inputMap;
		if (inputUniform.value !== inputTexture) {
			inputUniform.value = inputTexture;
		}

		const reveal = Math.max(0, Math.min(1, options.reveal ?? 1));

		easing.damp(this.damped, "intensity", bloomConfig.intensity, 0.12, delta);
		easing.damp(this.damped, "threshold", bloomConfig.threshold, 0.1, delta);
		easing.damp(this.damped, "smoothing", bloomConfig.smoothing, 0.1, delta);

		this.bloomEffect.intensity = this.damped.intensity * reveal;
		this.bloomEffect.luminanceMaterial.threshold = this.damped.threshold;
		this.bloomEffect.luminanceMaterial.smoothing = this.damped.smoothing;
		this._syncBloomBlurParams(bloomConfig);
		return true;
	}

	render(inputTexture, delta, options = {}) {
		this.finiteInputEnabled.value = 0;
		if (!this._prepareFrame(inputTexture, delta, options)) return null;
		const texture = renderComposerToTexture(this.composer, delta, this.renderer);
		if (texture && this.gfx.bloomHdr !== false) {
			texture.colorSpace = THREE.LinearSRGBColorSpace;
		}
		return texture;
	}

	/** Full-resolution consumers can sanitize the same raw HDR texels without an input copy. */
	canRenderPreparedTarget(target) {
		const output = this.composer.outputBuffer;
		const luminance = this.bloomEffect?.luminancePass;
		return this.gfx.bloomHdr !== false && this.effectPass && output
			&& this.finiteLuminanceState?.ready && luminance?.enabled !== false
			&& this.effectPass.effects[0] === this.finiteInputEffect
			&& target?.texture?.type === THREE.HalfFloatType
			&& target.texture.colorSpace === THREE.LinearSRGBColorSpace
			&& output.texture.type === THREE.HalfFloatType
			&& target !== output && target.texture !== output.texture
			&& target.width === output.width && target.height === output.height
			&& luminance?.renderTarget?.width === target.width && luminance.renderTarget.height === target.height;
	}

	/** Caller guarantees a completed raw hex draw; public pass API, no composer swaps. */
	renderPreparedTarget(target, delta, options = {}) {
		if (!this.canRenderPreparedTarget(target)) return this.render(target?.texture, delta, options);
		if (!this._prepareFrame(target.texture, delta, options)) return null;
		// A dev configuration can rebuild the chain in _prepareFrame; recheck its output.
		if (!this.canRenderPreparedTarget(target)) return this.render(target.texture, delta, options);
		const renderer = this.renderer, output = this.composer.outputBuffer;
		const previousTarget = renderer.getRenderTarget(), previousAutoClear = renderer.autoClear;
		const pass = this.effectPass, previousRenderToScreen = pass.renderToScreen;
		try {
			renderer.autoClear = false;
			this.finiteInputEnabled.value = 1;
			pass.renderToScreen = false;
			pass.render(renderer, target, output, delta, false);
			output.texture.colorSpace = THREE.LinearSRGBColorSpace;
			return output.texture;
		} finally {
			this.finiteInputEnabled.value = 0;
			pass.renderToScreen = previousRenderToScreen;
			renderer.setRenderTarget(previousTarget);
			renderer.autoClear = previousAutoClear;
		}
	}

	applyConfigFromDev() {
		this.lastBloomConfigKey = "";
	}

	dispose() {
		this.composer.dispose();
		this.bloomEffect = null;
		this.effectPass = null;
		this.finiteInputEffect = null;
		this.finiteLuminanceState = null;
		this.inputMesh.geometry.dispose();
		this.inputMesh.material.dispose();
	}
}
