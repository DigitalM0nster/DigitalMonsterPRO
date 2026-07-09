import * as THREE from "three";
import { applyScreenTextureColorSpace, blitTextureToRenderTarget } from "../composerUtils.js";
import { applyGrainBlurToBlitMaterial, createViewportMaskBlitMaterial } from "./viewportMask/blitMaterial.js";

const bgScene = new THREE.Scene();
const modelsScene = new THREE.Scene();
const screenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

function createLayerRenderTarget(width, height) {
	const target = new THREE.WebGLRenderTarget(width, height, {
		type: THREE.HalfFloatType,
		minFilter: THREE.LinearFilter,
		magFilter: THREE.LinearFilter,
		depthBuffer: false,
		stencilBuffer: false,
	});
	target.texture.colorSpace = THREE.LinearSRGBColorSpace;
	return target;
}

/**
 * Склеивает фон + модели и рисует на canvas (последний шаг кадра).
 */
export class ScreenCompositor {
	constructor() {
		this.size = { w: 0, h: 0 };
		this.bufferW = 0;
		this.bufferH = 0;
		this.layerTargets = { a: null, b: null };

		this.bgMesh = new THREE.Mesh(
			new THREE.PlaneGeometry(2, 2),
			new THREE.MeshBasicMaterial({
				depthTest: false,
				depthWrite: false,
				toneMapped: true,
			}),
		);
		bgScene.add(this.bgMesh);

		this.modelsMaskMaterial = createViewportMaskBlitMaterial();
		this.modelsMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.modelsMaskMaterial);
		modelsScene.add(this.modelsMesh);
	}

	_drawLayers(gl, bgTexture, modelsTexture, renderTarget, grainBlur, overlayTexture = null) {
		this.modelsMaskMaterial.uniforms.maskEnabled.value = 0;
		applyGrainBlurToBlitMaterial(this.modelsMaskMaterial, grainBlur);

		const prevTarget = gl.getRenderTarget();

		if (bgTexture) {
			blitTextureToRenderTarget(gl, bgTexture, renderTarget, bgScene, screenCamera, this.bgMesh);
		} else {
			gl.setRenderTarget(renderTarget);
			gl.autoClear = true;
			gl.setClearColor(0x000000, 1);
			gl.clear(true, true, true);
		}

		if (modelsTexture) {
			applyScreenTextureColorSpace(modelsTexture, gl);
			const uniforms = this.modelsMaskMaterial.uniforms;
			if (uniforms.map.value !== modelsTexture) {
				uniforms.map.value = modelsTexture;
			}

			gl.setRenderTarget(renderTarget);
			gl.autoClear = false;
			gl.clear(false, true, false);
			gl.render(modelsScene, screenCamera);
		}

		if (overlayTexture) {
			applyScreenTextureColorSpace(overlayTexture, gl);
			applyGrainBlurToBlitMaterial(this.modelsMaskMaterial, { enabled: false, radius: 0 });
			this.modelsMaskMaterial.uniforms.map.value = overlayTexture;
			gl.setRenderTarget(renderTarget);
			gl.autoClear = false;
			gl.render(modelsScene, screenCamera);
		}

		gl.setRenderTarget(prevTarget);
		gl.autoClear = false;
	}

	drawToScreen(gl, bgTexture, modelsTexture, grainBlur) {
		this._drawLayers(gl, bgTexture, modelsTexture, null, grainBlur);
	}

	/** Фон + модели в render target. */
	compositeToRenderTarget(gl, bgTexture, modelsTexture, renderTarget, grainBlur, overlayTexture = null) {
		if (!renderTarget) {
			return;
		}
		this._drawLayers(gl, bgTexture, modelsTexture, renderTarget, grainBlur, overlayTexture);
	}

	setSize(width, height, renderer) {
		if (width <= 0 || height <= 0) {
			return;
		}

		const dpr = renderer.getPixelRatio();
		const bufferW = Math.floor(width * dpr);
		const bufferH = Math.floor(height * dpr);

		if (this.bufferW === bufferW && this.bufferH === bufferH) {
			return;
		}

		this.size = { w: width, h: height };
		this.bufferW = bufferW;
		this.bufferH = bufferH;

		for (const key of ["a", "b"]) {
			this.layerTargets[key]?.dispose();
			this.layerTargets[key] = createLayerRenderTarget(bufferW, bufferH);
		}
	}

	/** Полный кадр (фон + модели) в слой a или b — для hex-transition. */
	compositeToLayerTarget(gl, layerKey, bgTexture, modelsTexture, grainBlur, overlayTexture = null) {
		const target = this.layerTargets[layerKey];
		if (!target) {
			return null;
		}
		this.compositeToRenderTarget(gl, bgTexture, modelsTexture, target, grainBlur, overlayTexture);
		return target.texture;
	}

	dispose() {
		this.layerTargets.a?.dispose();
		this.layerTargets.b?.dispose();
		this.layerTargets = { a: null, b: null };
		this.modelsMaskMaterial.dispose();
		this.bgMesh.geometry.dispose();
		this.bgMesh.material.dispose();
		this.modelsMesh.geometry.dispose();
	}
}
