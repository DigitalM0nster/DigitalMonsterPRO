import * as THREE from "three";
import { EffectComposer, EffectPass, RenderPass, BloomEffect, BlendFunction, KernelSize } from "postprocessing";
import { easing } from "maath";
import { getSiteBloomConfig, siteBloomArtDirection } from "./siteBloomConfig.js";
import { configureModelsRenderPass, renderComposerToTexture } from "../composerUtils.js";

const BLOOM_RADIUS_MIN = 0.1;
const BLOOM_RADIUS_MAX = 1.2;

const inputScene = new THREE.Scene();
const inputCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

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
			stencilBuffer: false,
			frameBufferType: resolveBloomFrameBufferType(gfx),
		});
		this.inputMesh = new THREE.Mesh(
			new THREE.PlaneGeometry(2, 2),
			new THREE.MeshBasicMaterial({
				depthTest: false,
				depthWrite: false,
				toneMapped: false,
				transparent: true,
				// Семплируем linear HDR RT без повторного tone mapping.
				color: new THREE.Color(1, 1, 1),
			}),
		);
		inputScene.add(this.inputMesh);
		this.bloomEffect = null;
		this.lastBloomConfigKey = "";
		this.size = { w: 0, h: 0 };
		this.damped = {
			intensity: siteBloomArtDirection.intensity,
			threshold: siteBloomArtDirection.threshold,
			smoothing: siteBloomArtDirection.smoothing,
		};
	}

	_getBloomConfigKey(bloomConfig) {
		return `${bloomConfig.intensity}|${bloomConfig.threshold}|${bloomConfig.smoothing}|${bloomConfig.mipmapBlur}|${bloomConfig.levels}|${bloomConfig.radius}|${bloomConfig.resolutionScale}|${bloomConfig.kernelSize}`;
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
			this.composer.addPass(new RenderPass(inputScene, inputCamera));
			configureModelsRenderPass(this.composer);

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
			this.composer.addPass(new EffectPass(inputCamera, this.bloomEffect));
			this.composer.autoRenderToScreen = false;
			this.lastBloomConfigKey = configKey;
			return true;
		} catch (error) {
			console.warn("[ModelsBloomPipeline] build failed", error);
			this.bloomEffect = null;
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
		this.composer.setSize(width, height);
	}

	/**
	 * @param {THREE.Texture} inputTexture
	 * @param {number} delta
	 * @param {{ reveal?: number }} [options]
	 * @returns {THREE.Texture | null}
	 */
	render(inputTexture, delta, options = {}) {
		if (!inputTexture || this._isContextLost()) {
			return null;
		}

		const bloomConfig = getSiteBloomConfig(this.gfx);
		if (!this._buildBloomChain(bloomConfig) || !this.bloomEffect) {
			return null;
		}

		const material = this.inputMesh.material;
		if (material.map !== inputTexture) {
			material.map = inputTexture;
			material.needsUpdate = true;
		}

		const reveal = Math.max(0, Math.min(1, options.reveal ?? 1));

		easing.damp(this.damped, "intensity", bloomConfig.intensity, 0.12, delta);
		easing.damp(this.damped, "threshold", bloomConfig.threshold, 0.1, delta);
		easing.damp(this.damped, "smoothing", bloomConfig.smoothing, 0.1, delta);

		this.bloomEffect.intensity = this.damped.intensity * reveal;
		this.bloomEffect.luminanceMaterial.threshold = this.damped.threshold;
		this.bloomEffect.luminanceMaterial.smoothing = this.damped.smoothing;
		this._syncBloomBlurParams(bloomConfig);

		const texture = renderComposerToTexture(this.composer, delta, this.renderer);
		if (texture && this.gfx.bloomHdr !== false) {
			texture.colorSpace = THREE.LinearSRGBColorSpace;
		}
		return texture;
	}

	applyConfigFromDev() {
		this.lastBloomConfigKey = "";
	}

	dispose() {
		this.composer.dispose();
		this.bloomEffect = null;
		this.inputMesh.geometry.dispose();
		this.inputMesh.material.dispose();
	}
}
