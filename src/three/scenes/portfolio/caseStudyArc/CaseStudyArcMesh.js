import * as THREE from "three";
import { SITE_MAIN_RGB } from "@/constants/siteMainColor.js";
import {
	CASE_STUDY_ARC_MAX_NODES,
	caseStudyArcFragmentShader,
	caseStudyArcVertexShader,
} from "./caseStudyArcShader.js";

/**
 * After-bloom screen overlay: procedural right-arc track / nodes / glow.
 * Shared chrome for all cases — never hex-cut.
 * Additive blending matches Canvas2D `lighter` bloom.
 * Typography stays on Canvas2D (labels + hit).
 */
export class CaseStudyArcMesh {
	constructor() {
		this.visible = false;
		this.composeMode = "screen";

		this.overlayScene = new THREE.Scene();
		this.overlayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

		const nodeAngles = new Float32Array(CASE_STUDY_ARC_MAX_NODES);
		const nodeHighlight = new Float32Array(CASE_STUDY_ARC_MAX_NODES);

		this.material = new THREE.ShaderMaterial({
			uniforms: {
				uResolution: { value: new THREE.Vector2(1920, 1080) },
				uCenterPx: { value: new THREE.Vector2(0, 0) },
				uRadiusPx: { value: 400 },
				uAngleStart: { value: 0 },
				uAngleEnd: { value: 0 },
				uNoFadeMin: { value: 0 },
				uNoFadeMax: { value: 0 },
				uFadeInset: { value: 0 },
				uFadePower: { value: 0.85 },
				uFadeTailDeg: { value: 75 },
				uTrackWidthPx: { value: 1 },
				uTrackOpacity: { value: 0.15 },
				uTrackColor: { value: new THREE.Color(1, 1, 1) },
				uActiveColor: {
					value: new THREE.Color(
						SITE_MAIN_RGB.r / 255,
						SITE_MAIN_RGB.g / 255,
						SITE_MAIN_RGB.b / 255,
					),
				},
				uGlowAngle: { value: 0 },
				uGlowStrength: { value: 0 },
				uGlowHalfSpan: { value: 0.15 },
				uGlowBloomBlur: { value: 5 },
				uGlowBloomStrength: { value: 1.7 },
				uGlowOpacityBoost: { value: 0.07 },
				uNodeRadiusPx: { value: 20 },
				uNodeMidRadiusPx: { value: 8 },
				uNodeInnerRadiusPx: { value: 3 },
				uNodeMidOpacity: { value: 0.32 },
				uActiveOpacity: { value: 0.5 },
				uOuterBloomBlur: { value: 4 },
				uOuterBloomStrength: { value: 2 },
				uInnerBloomBlur: { value: 4 },
				uInnerBloomStrength: { value: 2 },
				uIntroOpacity: { value: 1 },
				uNodeCount: { value: 0 },
				uNodeAngles: { value: nodeAngles },
				uNodeHighlight: { value: nodeHighlight },
			},
			vertexShader: caseStudyArcVertexShader,
			fragmentShader: caseStudyArcFragmentShader,
			transparent: true,
			depthTest: false,
			depthWrite: false,
			toneMapped: false,
			blending: THREE.CustomBlending,
			blendEquation: THREE.AddEquation,
			blendSrc: THREE.OneFactor,
			blendDst: THREE.OneFactor,
			blendSrcAlpha: THREE.ZeroFactor,
			blendDstAlpha: THREE.OneFactor,
		});

		this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
		this.mesh.frustumCulled = false;
		this.overlayScene.add(this.mesh);
		this.mesh.visible = false;
	}

	setVisible(visible) {
		this.visible = Boolean(visible);
		this.mesh.visible = this.visible;
	}

	setComposeMode(mode) {
		this.composeMode = mode === "screen" ? "screen" : "models";
	}

	/**
	 * @param {{
	 *   viewportW: number,
	 *   viewportH: number,
	 *   centerX: number,
	 *   centerY: number,
	 *   radius: number,
	 *   angleStart: number,
	 *   angleEnd: number,
	 *   noFadeMin: number,
	 *   noFadeMax: number,
	 *   fadeInsetRad: number,
	 *   fadePower: number,
	 *   fadeTailDeg: number,
	 *   trackWidth: number,
	 *   trackOpacity: number,
	 *   trackColor: string,
	 *   activeColor: string,
	 *   glowAngle: number | null,
	 *   glowStrength: number,
	 *   glowHalfSpanRad: number,
	 *   glowBloomBlur: number,
	 *   glowBloomStrength: number,
	 *   glowOpacityBoost: number,
	 *   nodeRadius: number,
	 *   nodeMidRadius: number,
	 *   nodeInnerRadius: number,
	 *   nodeMidOpacity: number,
	 *   activeOpacity: number,
	 *   outerBloomBlur: number,
	 *   outerBloomStrength: number,
	 *   innerBloomBlur: number,
	 *   innerBloomStrength: number,
	 *   introOpacity: number,
	 *   nodeAngles: number[],
	 *   nodeHighlights: number[],
	 * }} state
	 */
	syncState(state) {
		const u = this.material.uniforms;
		u.uResolution.value.set(state.viewportW, state.viewportH);
		u.uCenterPx.value.set(state.centerX, state.viewportH - state.centerY);
		u.uRadiusPx.value = state.radius;
		const flip = (a) => -a;
		u.uAngleStart.value = flip(state.angleEnd);
		u.uAngleEnd.value = flip(state.angleStart);
		u.uNoFadeMin.value = flip(state.noFadeMax);
		u.uNoFadeMax.value = flip(state.noFadeMin);
		u.uFadeInset.value = state.fadeInsetRad;
		u.uFadePower.value = state.fadePower;
		u.uFadeTailDeg.value = state.fadeTailDeg;
		u.uTrackWidthPx.value = state.trackWidth;
		u.uTrackOpacity.value = state.trackOpacity;
		u.uTrackColor.value.setStyle(state.trackColor);
		u.uActiveColor.value.setStyle(state.activeColor);
		u.uGlowAngle.value = state.glowAngle == null ? 0 : flip(state.glowAngle);
		u.uGlowStrength.value = state.glowStrength;
		u.uGlowHalfSpan.value = state.glowHalfSpanRad;
		u.uGlowBloomBlur.value = state.glowBloomBlur;
		u.uGlowBloomStrength.value = state.glowBloomStrength;
		u.uGlowOpacityBoost.value = state.glowOpacityBoost;
		u.uNodeRadiusPx.value = state.nodeRadius;
		u.uNodeMidRadiusPx.value = state.nodeMidRadius;
		u.uNodeInnerRadiusPx.value = state.nodeInnerRadius;
		u.uNodeMidOpacity.value = state.nodeMidOpacity;
		u.uActiveOpacity.value = state.activeOpacity;
		u.uOuterBloomBlur.value = state.outerBloomBlur;
		u.uOuterBloomStrength.value = state.outerBloomStrength;
		u.uInnerBloomBlur.value = state.innerBloomBlur;
		u.uInnerBloomStrength.value = state.innerBloomStrength;
		u.uIntroOpacity.value = state.introOpacity;

		const angles = u.uNodeAngles.value;
		const highlights = u.uNodeHighlight.value;
		angles.fill(0);
		highlights.fill(0);
		const n = Math.min(CASE_STUDY_ARC_MAX_NODES, state.nodeAngles.length);
		for (let i = 0; i < n; i += 1) {
			angles[i] = flip(state.nodeAngles[i]);
			highlights[i] = state.nodeHighlights[i] ?? 0;
		}
		u.uNodeCount.value = n;
	}

	/** @param {THREE.WebGLRenderer} renderer */
	renderScreenOverlay(renderer) {
		if (this.composeMode !== "screen" || !this.visible || !this.mesh.visible) {
			return;
		}
		const prevAutoClear = renderer.autoClear;
		renderer.autoClear = false;
		renderer.render(this.overlayScene, this.overlayCamera);
		renderer.autoClear = prevAutoClear;
	}

	dispose() {
		this.mesh.removeFromParent();
		this.mesh.geometry.dispose();
		this.material.dispose();
	}
}
