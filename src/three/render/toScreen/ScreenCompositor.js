import * as THREE from "three";
import { applyScreenTextureColorSpace, blitTextureToRenderTarget } from "../composerUtils.js";
import { applyGrainBlurToBlitMaterial, createViewportMaskBlitMaterial } from "./viewportMask/blitMaterial.js";
import {
	applyCaseStudyEdgeShadeUniforms,
	createCaseStudyEdgeShadeMaterial,
} from "./caseStudyEdgeShadeMaterial.js";

const bgScene = new THREE.Scene();
const modelsScene = new THREE.Scene();
const overlayScene = new THREE.Scene();
const edgeShadeScene = new THREE.Scene();
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

		this.caseEdgeShadeMaterial = createCaseStudyEdgeShadeMaterial();
		this.caseEdgeShadeMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.caseEdgeShadeMaterial);
		edgeShadeScene.add(this.caseEdgeShadeMesh);
		/** @type {{ enabled: boolean, opacity: number, right: boolean, bottom: boolean }} */
		this._caseEdgeShade = { enabled: false, opacity: 0, right: true, bottom: true, delta: 1 / 60 };

		// UI canvases already contain display-referred sRGB colours. They must not
		// pass through the scene tone mapper, otherwise text becomes dull and its
		// antialiased edges lose contrast.
		this.overlayMaterial = createViewportMaskBlitMaterial();
		this.overlayMaterial.toneMapped = false;
		this.overlayMaterial.needsUpdate = true;
		this.overlayMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.overlayMaterial);
		overlayScene.add(this.overlayMesh);
	}

	/**
	 * Case pages: darken bg+models at right/bottom. HUD overlays after and stay bright.
	 * @param {{ enabled?: boolean, right?: boolean, bottom?: boolean, delta?: number }} opts
	 */
	setCaseStudyEdgeShade(opts = {}) {
		const enabled = Boolean(opts.enabled);
		this._caseEdgeShade.enabled = enabled;
		this._caseEdgeShade.right = opts.right !== false;
		this._caseEdgeShade.bottom = opts.bottom !== false;
		const target = enabled ? 1 : 0;
		const delta = Number.isFinite(opts.delta) ? Math.max(0, opts.delta) : 1 / 60;
		this._caseEdgeShade.delta = delta;
		// ~680ms ease-in to match former HTML caseStudyShadeIn.
		const k = 1 - Math.exp(-3.2 * delta);
		this._caseEdgeShade.opacity += (target - this._caseEdgeShade.opacity) * k;
		if (this._caseEdgeShade.opacity < 0.001 && !enabled) {
			this._caseEdgeShade.opacity = 0;
		}
	}

	_drawLayers(gl, bgTexture, modelsTexture, renderTarget, grainBlur, overlayTexture = null) {
		this.modelsMaskMaterial.uniforms.maskEnabled.value = 0;
		this.modelsMaskMaterial.uniforms.mapRegionEnabled.value = 0;
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

		// Only on true bg+models composite. Final drawToScreen(null, fullFrame) must not re-shade.
		if (bgTexture && modelsTexture && this._caseEdgeShade.opacity > 0.001) {
			applyCaseStudyEdgeShadeUniforms(this.caseEdgeShadeMaterial, {
				opacity: this._caseEdgeShade.opacity,
				viewportW: this.size.w || 1,
				viewportH: this.size.h || 1,
				right: this._caseEdgeShade.right,
				bottom: this._caseEdgeShade.bottom,
				delta: this._caseEdgeShade.delta,
			});
			gl.setRenderTarget(renderTarget);
			gl.autoClear = false;
			gl.render(edgeShadeScene, screenCamera);
		}

		if (overlayTexture) {
			applyScreenTextureColorSpace(overlayTexture, gl);
			const overlayUniforms = this.overlayMaterial.uniforms;
			overlayUniforms.maskEnabled.value = 0;
			const region = overlayTexture.userData?.screenRegion;
			if (region?.viewportWidth > 0 && region?.viewportHeight > 0) {
				const x = region.x / region.viewportWidth;
				const y = 1 - (region.y + region.height) / region.viewportHeight;
				overlayUniforms.mapRegion.value.set(
					x,
					y,
					region.width / region.viewportWidth,
					region.height / region.viewportHeight,
				);
				overlayUniforms.mapRegionEnabled.value = 1;
			} else {
				overlayUniforms.mapRegionEnabled.value = 0;
			}
			applyGrainBlurToBlitMaterial(this.overlayMaterial, { enabled: false, radius: 0 });
			overlayUniforms.map.value = overlayTexture;
			gl.setRenderTarget(renderTarget);
			gl.autoClear = false;
			gl.render(overlayScene, screenCamera);
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
		this.caseEdgeShadeMaterial.dispose();
		this.overlayMaterial.dispose();
		this.bgMesh.geometry.dispose();
		this.bgMesh.material.dispose();
		this.modelsMesh.geometry.dispose();
		this.caseEdgeShadeMesh.geometry.dispose();
		this.overlayMesh.geometry.dispose();
	}
}
