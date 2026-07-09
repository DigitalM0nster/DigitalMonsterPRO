import * as THREE from "three";
import { applyScreenTextureColorSpace } from "../composerUtils.js";
import { createSceneTransitionMixMaterial } from "./sceneTransitionMixMaterial.js";

const mixScene = new THREE.Scene();
const mixCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

function createRenderTarget(width, height) {
	const target = new THREE.WebGLRenderTarget(width, height, {
		minFilter: THREE.LinearFilter,
		magFilter: THREE.LinearFilter,
		depthBuffer: true,
		stencilBuffer: false,
	});
	target.texture.colorSpace = THREE.SRGBColorSpace;
	return target;
}

/**
 * Reusable fullscreen pass: sceneA → RT A, sceneB → RT B, mix → экран.
 * progress 0 = textureA, 1 = textureB.
 */
export class SceneTransitionPass {
	constructor(renderer) {
		this.renderer = renderer;
		this.progress = 0;
		this.size = { w: 0, h: 0 };

		this.renderTargetA = null;
		this.renderTargetB = null;

		this.mixMaterial = createSceneTransitionMixMaterial();
		this.mixMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mixMaterial);
		mixScene.add(this.mixMesh);
	}

	setProgress(value) {
		this.progress = THREE.MathUtils.clamp(value, 0, 1);
		this.mixMaterial.uniforms.progress.value = this.progress;
	}

	getProgress() {
		return this.progress;
	}

	getRenderTargetA() {
		return this.renderTargetA;
	}

	getRenderTargetB() {
		return this.renderTargetB;
	}

	getTextureA() {
		return this.renderTargetA?.texture ?? null;
	}

	getTextureB() {
		return this.renderTargetB?.texture ?? null;
	}

	setSize(width, height) {
		if (width <= 0 || height <= 0) {
			return;
		}
		if (this.size.w === width && this.size.h === height) {
			return;
		}
		this.size = { w: width, h: height };

		this.renderTargetA?.dispose();
		this.renderTargetB?.dispose();

		const dpr = this.renderer.getPixelRatio();
		const w = Math.floor(width * dpr);
		const h = Math.floor(height * dpr);

		this.renderTargetA = createRenderTarget(w, h);
		this.renderTargetB = createRenderTarget(w, h);
	}

	renderSceneA(renderer, scene, camera) {
		this._renderSceneToTarget(renderer, scene, camera, this.renderTargetA);
	}

	renderSceneB(renderer, scene, camera) {
		this._renderSceneToTarget(renderer, scene, camera, this.renderTargetB);
	}

	renderSourceA(renderer, renderFn) {
		if (typeof renderFn === "function") {
			renderFn(renderer, this.renderTargetA);
		}
	}

	renderSourceB(renderer, renderFn) {
		if (typeof renderFn === "function") {
			renderFn(renderer, this.renderTargetB);
		}
	}

	_renderSceneToTarget(renderer, scene, camera, target) {
		if (!scene || !camera || !target) {
			return;
		}

		const prevTarget = renderer.getRenderTarget();
		const prevAutoClear = renderer.autoClear;

		renderer.setRenderTarget(target);
		renderer.autoClear = true;
		renderer.setClearColor(0x000000, 1);
		renderer.clear(true, true, true);
		renderer.render(scene, camera);

		renderer.setRenderTarget(prevTarget);
		renderer.autoClear = prevAutoClear;
	}

	renderToScreen(renderer = this.renderer) {
		if (!this.renderTargetA || !this.renderTargetB) {
			return;
		}

		const uniforms = this.mixMaterial.uniforms;
		uniforms.textureA.value = this.renderTargetA.texture;
		uniforms.textureB.value = this.renderTargetB.texture;
		uniforms.progress.value = this.progress;

		applyScreenTextureColorSpace(this.renderTargetA.texture, renderer);
		applyScreenTextureColorSpace(this.renderTargetB.texture, renderer);

		const prevTarget = renderer.getRenderTarget();
		renderer.setRenderTarget(null);
		renderer.autoClear = true;
		renderer.setClearColor(0x000000, 1);
		renderer.clear(true, true, true);
		renderer.render(mixScene, mixCamera);
		renderer.setRenderTarget(prevTarget);
		renderer.autoClear = false;
	}

	dispose() {
		this.renderTargetA?.dispose();
		this.renderTargetB?.dispose();
		this.renderTargetA = null;
		this.renderTargetB = null;
		this.mixMaterial.dispose();
		this.mixMesh.geometry.dispose();
	}
}
