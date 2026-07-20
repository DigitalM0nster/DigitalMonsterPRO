import * as THREE from "three";
import { applyScreenTextureColorSpace, blitTextureToRenderTarget } from "../composerUtils.js";
import { applyGrainBlurToBlitMaterial, createViewportMaskBlitMaterial } from "./viewportMask/blitMaterial.js";
import { applyCaseStudyEdgeShadeUniforms, createCaseStudyEdgeShadeMaterial } from "./caseStudyEdgeShadeMaterial.js";

const bgScene = new THREE.Scene();
const modelsScene = new THREE.Scene();
const overlayScene = new THREE.Scene();
const edgeShadeScene = new THREE.Scene();
const hexOverLiquidScene = new THREE.Scene();
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
 * Hex content sits on an opaque black plate (stable UV-distort). Near-black plate
 * pixels are replaced with clean liquid so the background is never hex-warped.
 *
 * Do NOT use this path for About (or home): About Front/Heart are intentionally
 * near-black and get keyed as empty plate. Those mixes bake liquid under models
 * in DigitalMonsterThreeApp._renderCarouselHexFrame instead.
 */
function createHexOverLiquidMaterial() {
	return new THREE.ShaderMaterial({
		uniforms: {
			hexMap: { value: null },
			liquidMap: { value: null },
			hasLiquid: { value: 0 },
		},
		vertexShader: /* glsl */ `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = vec4(position.xy, 0.0, 1.0);
}
`,
		fragmentShader: /* glsl */ `
uniform sampler2D hexMap;
uniform sampler2D liquidMap;
uniform float hasLiquid;
varying vec2 vUv;

void main() {
	vec4 h = texture2D(hexMap, vUv);
	float lum = max(h.r, max(h.g, h.b));
	// Soft key: plate black → liquid; models / hex lines stay.
	float plate = 1.0 - smoothstep(0.01, 0.085, lum);
	vec3 liquid = hasLiquid > 0.5 ? texture2D(liquidMap, vUv).rgb : vec3(0.0);
	vec3 color = mix(h.rgb, liquid, plate * hasLiquid);
	gl_FragColor = vec4(color, 1.0);
}
`,
		depthTest: false,
		depthWrite: false,
		toneMapped: true,
	});
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
		/** @type {{ enabled: boolean, opacity: number, right: boolean }} */
		this._caseEdgeShade = { enabled: false, opacity: 0, right: true };

		// UI canvases already contain display-referred sRGB colours. They must not
		// pass through the scene tone mapper, otherwise text becomes dull and its
		// antialiased edges lose contrast.
		this.overlayMaterial = createViewportMaskBlitMaterial();
		this.overlayMaterial.toneMapped = false;
		this.overlayMaterial.needsUpdate = true;
		this.overlayMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.overlayMaterial);
		overlayScene.add(this.overlayMesh);

		this.hexOverLiquidMaterial = createHexOverLiquidMaterial();
		this.hexOverLiquidMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.hexOverLiquidMaterial);
		hexOverLiquidScene.add(this.hexOverLiquidMesh);
	}

	/**
	 * Case pages: darken bg+models at the right arc. HUD overlays after and stay bright.
	 * @param {{ enabled?: boolean, right?: boolean, delta?: number }} opts
	 */
	setCaseStudyEdgeShade(opts = {}) {
		const enabled = Boolean(opts.enabled);
		this._caseEdgeShade.enabled = enabled;
		this._caseEdgeShade.right = opts.right !== false;
		const target = enabled ? 1 : 0;
		const delta = Number.isFinite(opts.delta) ? Math.max(0, opts.delta) : 1 / 60;
		// ~680ms ease-in to match former HTML caseStudyShadeIn.
		const k = 1 - Math.exp(-3.2 * delta);
		this._caseEdgeShade.opacity += (target - this._caseEdgeShade.opacity) * k;
		if (this._caseEdgeShade.opacity < 0.001 && !enabled) {
			this._caseEdgeShade.opacity = 0;
		}
	}

	_drawLayers(gl, bgTexture, modelsTexture, renderTarget, grainBlur, overlayTexture = null, options = {}) {
		this.modelsMaskMaterial.uniforms.maskEnabled.value = 0;
		this.modelsMaskMaterial.uniforms.mapRegionEnabled.value = 0;
		applyGrainBlurToBlitMaterial(this.modelsMaskMaterial, grainBlur);

		const prevTarget = gl.getRenderTarget();
		const transparentClear = options.transparentClear === true;

		if (bgTexture) {
			blitTextureToRenderTarget(gl, bgTexture, renderTarget, bgScene, screenCamera, this.bgMesh);
		} else {
			// Hex inputs: opaque black plate (stable distort). Idle/final: opaque black.
			// transparentClear kept for rare cutout paths; hex uses black plate + keyed liquid.
			gl.setRenderTarget(renderTarget);
			gl.autoClear = true;
			gl.setClearColor(0x000000, transparentClear ? 0 : 1);
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

		// Edge shade on content (with or without baked bg). Final drawToScreen(null, fullFrame) skips when no models.
		if (modelsTexture && this._caseEdgeShade.opacity > 0.001) {
			applyCaseStudyEdgeShadeUniforms(this.caseEdgeShadeMaterial, {
				opacity: this._caseEdgeShade.opacity,
				viewportW: this.size.w || 1,
				viewportH: this.size.h || 1,
				right: this._caseEdgeShade.right,
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
				overlayUniforms.mapRegion.value.set(x, y, region.width / region.viewportWidth, region.height / region.viewportHeight);
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
		this._drawLayers(gl, bgTexture, modelsTexture, null, grainBlur, null, { transparentClear: false });
	}

	/** Фон + модели в render target. */
	compositeToRenderTarget(gl, bgTexture, modelsTexture, renderTarget, grainBlur, overlayTexture = null, options = {}) {
		if (!renderTarget) {
			return;
		}
		this._drawLayers(gl, bgTexture, modelsTexture, renderTarget, grainBlur, overlayTexture, options);
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

	/**
	 * Кадр в слой a или b.
	 * @param {{ transparentClear?: boolean }} [options]
	 */
	compositeToLayerTarget(gl, layerKey, bgTexture, modelsTexture, grainBlur, overlayTexture = null, options = {}) {
		const target = this.layerTargets[layerKey];
		if (!target) {
			return null;
		}
		this.compositeToRenderTarget(gl, bgTexture, modelsTexture, target, grainBlur, overlayTexture, options);
		return target.texture;
	}

	/**
	 * After hex: replace black plate with clean liquid (screen-stable UVs). Models/lines stay.
	 * @returns {THREE.Texture | null}
	 */
	compositeHexOverLiquidToLayer(gl, layerKey, liquidTexture, hexTexture) {
		const target = this.layerTargets[layerKey];
		if (!target || !hexTexture) {
			return null;
		}

		applyScreenTextureColorSpace(hexTexture, gl);
		if (liquidTexture) {
			applyScreenTextureColorSpace(liquidTexture, gl);
		}

		const uniforms = this.hexOverLiquidMaterial.uniforms;
		uniforms.hexMap.value = hexTexture;
		uniforms.liquidMap.value = liquidTexture;
		uniforms.hasLiquid.value = liquidTexture ? 1 : 0;

		const prevTarget = gl.getRenderTarget();
		gl.setRenderTarget(target);
		gl.autoClear = true;
		gl.setClearColor(0x000000, 1);
		gl.clear(true, true, true);
		gl.render(hexOverLiquidScene, screenCamera);
		gl.setRenderTarget(prevTarget);
		gl.autoClear = false;

		return target.texture;
	}

	dispose() {
		this.layerTargets.a?.dispose();
		this.layerTargets.b?.dispose();
		this.layerTargets = { a: null, b: null };
		this.modelsMaskMaterial.dispose();
		this.caseEdgeShadeMaterial.dispose();
		this.overlayMaterial.dispose();
		this.hexOverLiquidMaterial.dispose();
		this.bgMesh.geometry.dispose();
		this.bgMesh.material.dispose();
		this.modelsMesh.geometry.dispose();
		this.caseEdgeShadeMesh.geometry.dispose();
		this.overlayMesh.geometry.dispose();
		this.hexOverLiquidMesh.geometry.dispose();
	}
}
