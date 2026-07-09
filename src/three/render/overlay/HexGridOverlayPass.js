import * as THREE from "three";
import { applyScreenTextureColorSpace } from "../composerUtils.js";
import { createHexGridOverlayMaterial, syncHexGridMaterialBlendMode } from "./hexGridOverlayMaterial.js";
import { hexGridOverlayDefaults } from "./hexGridOverlayConfig.js";

const overlayScene = new THREE.Scene();
const overlayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

/** Scene mix-pass: texture A/B → hex RT → bloom. */
export class HexGridOverlayPass {
	constructor(renderer) {
		this.renderer = renderer;
		this.size = { w: 0, h: 0 };
		this.material = createHexGridOverlayMaterial();
		this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
		overlayScene.add(this.mesh);
		this.modelsMixTarget = null;

		this.setOptions(hexGridOverlayDefaults);
	}

	setTextures(textureA, textureB) {
		this.material.uniforms.textureA.value = textureA;
		this.material.uniforms.textureB.value = textureB;
	}

	setOptions({
		hexScale,
		hexCellSize,
		fisheyeStrength,
		progress,
		innerMaxRadius,
		innerMinRadius,
		innerSoftness,
		innerRevealPower,
		innerTextureScale,
		innerDistortStrength,
		outerTextureScale,
		outerDistortStrength,
		rowSoftness,
		rowRandomStrength,
		cellRevealSpan,
		lineWidth,
		lineInset,
		lineColor,
		lineOpacity,
		lineGlowBoost,
		lineRandomStrength,
	} = {}) {
		const uniforms = this.material.uniforms;

		const scale = hexScale ?? (hexCellSize !== undefined ? 1 / Math.max(hexCellSize, 1e-5) : undefined);
		if (scale !== undefined) {
			uniforms.hexScale.value = scale;
		}

		if (fisheyeStrength !== undefined) {
			uniforms.fisheyeStrength.value = fisheyeStrength;
		}

		if (progress !== undefined) {
			uniforms.progress.value = progress;
		}

		if (innerMaxRadius !== undefined) {
			uniforms.innerMaxRadius.value = innerMaxRadius;
		}

		if (innerMinRadius !== undefined) {
			uniforms.innerMinRadius.value = innerMinRadius;
		}

		if (innerSoftness !== undefined) {
			uniforms.innerSoftness.value = innerSoftness;
		}

		if (innerRevealPower !== undefined) {
			uniforms.innerRevealPower.value = innerRevealPower;
		}

		if (innerTextureScale !== undefined) {
			uniforms.innerTextureScale.value = innerTextureScale;
		}

		if (innerDistortStrength !== undefined) {
			uniforms.innerDistortStrength.value = innerDistortStrength;
		}

		if (outerTextureScale !== undefined) {
			uniforms.outerTextureScale.value = outerTextureScale;
		}

		if (outerDistortStrength !== undefined) {
			uniforms.outerDistortStrength.value = outerDistortStrength;
		}

		if (rowSoftness !== undefined) {
			uniforms.rowSoftness.value = rowSoftness;
		}

		if (rowRandomStrength !== undefined) {
			uniforms.rowRandomStrength.value = rowRandomStrength;
		}

		if (cellRevealSpan !== undefined) {
			uniforms.cellRevealSpan.value = cellRevealSpan;
		}

		if (lineWidth !== undefined) {
			uniforms.lineWidth.value = lineWidth;
		}

		if (lineInset !== undefined) {
			uniforms.lineInset.value = lineInset;
		}

		if (lineColor !== undefined) {
			const rgb = Array.isArray(lineColor) ? lineColor : [lineColor.r, lineColor.g, lineColor.b];
			uniforms.lineColor.value.set(rgb[0], rgb[1], rgb[2]);
		}

		if (lineOpacity !== undefined) {
			uniforms.lineOpacity.value = lineOpacity;
		}

		if (lineGlowBoost !== undefined) {
			uniforms.lineGlowBoost.value = lineGlowBoost;
		}

		if (lineRandomStrength !== undefined) {
			uniforms.lineRandomStrength.value = lineRandomStrength;
		}
	}

	setSize(width, height) {
		if (width <= 0 || height <= 0) {
			return;
		}
		if (this.size.w === width && this.size.h === height) {
			return;
		}
		this.size = { w: width, h: height };
		this._updateResolution();

		const dpr = this.renderer.getPixelRatio();
		const w = Math.floor(width * dpr);
		const h = Math.floor(height * dpr);

		this.modelsMixTarget?.dispose();
		this.modelsMixTarget = new THREE.WebGLRenderTarget(w, h, {
			type: THREE.HalfFloatType,
			minFilter: THREE.LinearFilter,
			magFilter: THREE.LinearFilter,
			depthBuffer: false,
			stencilBuffer: false,
		});
		this.modelsMixTarget.texture.colorSpace = THREE.LinearSRGBColorSpace;
	}

	_updateResolution() {
		const dpr = this.renderer.getPixelRatio();
		this.material.uniforms.resolution.value.set(this.size.w * dpr, this.size.h * dpr);
	}

	_applyInputTextureColorSpace(texture, renderer) {
		if (!texture) {
			return;
		}
		if (texture.colorSpace === THREE.LinearSRGBColorSpace) {
			return;
		}
		applyScreenTextureColorSpace(texture, renderer);
	}

	/** Hex-mix двух RT (полный кадр или только модели) → одна текстура (без bloom). */
	renderModelsMixToTexture(renderer = this.renderer) {
		if (!this.modelsMixTarget) {
			return null;
		}

		const texA = this.material.uniforms.textureA.value;
		const texB = this.material.uniforms.textureB.value;
		if (!texA || !texB) {
			return null;
		}

		this._updateResolution();
		this._applyInputTextureColorSpace(texA, renderer);
		this._applyInputTextureColorSpace(texB, renderer);

		const prevTarget = renderer.getRenderTarget();
		const prevAutoClear = renderer.autoClear;

		this.material.transparent = true;
		this.material.blending = THREE.NormalBlending;
		this.material.needsUpdate = true;

		renderer.setRenderTarget(this.modelsMixTarget);
		renderer.autoClear = true;
		renderer.setClearColor(0x000000, 0);
		renderer.clear(true, true, true);
		renderer.render(overlayScene, overlayCamera);

		this.material.transparent = false;
		this.material.blending = THREE.NoBlending;
		this.material.needsUpdate = true;

		renderer.setRenderTarget(prevTarget);
		renderer.autoClear = prevAutoClear;

		return this.modelsMixTarget.texture;
	}

	renderToScreen(renderer = this.renderer) {
		this._updateResolution();

		const texA = this.material.uniforms.textureA.value;
		const texB = this.material.uniforms.textureB.value;
		if (!texA || !texB) {
			return;
		}
		this._applyInputTextureColorSpace(texA, renderer);
		this._applyInputTextureColorSpace(texB, renderer);

		const prevTarget = renderer.getRenderTarget();
		const prevAutoClear = renderer.autoClear;

		syncHexGridMaterialBlendMode(this.material);

		renderer.setRenderTarget(null);
		renderer.autoClear = true;
		renderer.setClearColor(0x000000, 1);
		renderer.clear(true, true, true);
		renderer.render(overlayScene, overlayCamera);

		renderer.setRenderTarget(prevTarget);
		renderer.autoClear = prevAutoClear;
	}

	dispose() {
		this.modelsMixTarget?.dispose();
		this.modelsMixTarget = null;
		this.material.dispose();
		this.mesh.geometry.dispose();
	}
}
