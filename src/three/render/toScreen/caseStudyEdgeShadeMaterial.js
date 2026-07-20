import * as THREE from "three";
import { resolveCaseStudyArcGeometry } from "@/portfolio/ui/CaseStudyCanvas/caseStudyArcGeometry.js";
import { caseStudyArcInternals } from "@/portfolio/ui/CaseStudyCanvas/caseStudyArcConfig.js";
import { caseStudyEdgeShadeConfig } from "./caseStudyEdgeShadeConfig.js";

/**
 * Case-page right-arc darkening over bg+models only (HUD/arc stay bright).
 */
const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const fragmentShader = /* glsl */ `
uniform float uOpacity;
uniform float uArcShadeEnabled;
uniform vec2 uViewportPx;
uniform vec2 uArcCenterPx;
uniform float uArcRadiusPx;
uniform float uArcShadeBandPx;
uniform float uArcStopSolid;
uniform float uArcStopMid;
uniform float uArcMidAlpha;
uniform float uArcStopFade;
varying vec2 vUv;

float alphaFromStops(float t, float stopSolid, float stopMid, float midAlpha, float stopFade) {
	float s0 = clamp(stopSolid, 0.0, 1.0);
	float s1 = clamp(max(stopMid, s0), 0.0, 1.0);
	float s2 = clamp(max(stopFade, s1), 0.0001, 1.0);
	float aMid = clamp(midAlpha, 0.0, 1.0);

	if (t <= s0) {
		return 1.0;
	}
	if (t <= s1) {
		float u = (t - s0) / max(s1 - s0, 0.0001);
		return mix(1.0, aMid, u);
	}
	if (t <= s2) {
		float u = (t - s1) / max(s2 - s1, 0.0001);
		return mix(aMid, 0.0, u);
	}
	return 0.0;
}

void main() {
	float alpha = 0.0;

	if (uArcShadeEnabled > 0.5 && uArcShadeBandPx > 0.5) {
		vec2 pos = vec2(vUv.x * uViewportPx.x, (1.0 - vUv.y) * uViewportPx.y);
		vec2 delta = pos - uArcCenterPx;
		float dist = length(delta);
		float outside = dist - uArcRadiusPx;
		if (outside > 0.0 && delta.x > 0.0) {
			float t = outside >= uArcShadeBandPx
				? 0.0
				: 1.0 - outside / uArcShadeBandPx;
			alpha = alphaFromStops(t, uArcStopSolid, uArcStopMid, uArcMidAlpha, uArcStopFade);
		}
	}

	alpha *= clamp(uOpacity, 0.0, 1.0);
	if (alpha <= 0.0001) {
		discard;
	}

	gl_FragColor = vec4(0.0, 0.0, 0.0, alpha);
}
`;

export function createCaseStudyEdgeShadeMaterial() {
	return new THREE.ShaderMaterial({
		uniforms: {
			uOpacity: { value: 0 },
			uArcShadeEnabled: { value: 0 },
			uViewportPx: { value: new THREE.Vector2(1, 1) },
			uArcCenterPx: { value: new THREE.Vector2(0, 0) },
			uArcRadiusPx: { value: 0 },
			uArcShadeBandPx: { value: 0 },
			uArcStopSolid: { value: 0.15 },
			uArcStopMid: { value: 0.55 },
			uArcMidAlpha: { value: 0.45 },
			uArcStopFade: { value: 1 },
		},
		vertexShader,
		fragmentShader,
		transparent: true,
		depthTest: false,
		depthWrite: false,
		toneMapped: false,
		blending: THREE.NormalBlending,
	});
}

/**
 * @param {number} viewportH
 */
function resolveArcVerticalBounds(viewportH) {
	const top = Math.min(116, Math.max(88, viewportH * 0.105));
	const bottom = Math.max(top + 120, viewportH * 0.88);
	return { top, bottom };
}

/**
 * @param {THREE.ShaderMaterial} material
 * @param {string} name
 * @param {number | THREE.Vector2} value
 */
function setUniform(material, name, value) {
	const uniform = material.uniforms?.[name];
	if (!uniform) {
		return;
	}
	if (value instanceof THREE.Vector2) {
		uniform.value.copy(value);
		return;
	}
	if (Number.isFinite(value)) {
		uniform.value = value;
	}
}

/**
 * @param {THREE.ShaderMaterial} material
 * @param {{ opacity: number, viewportW: number, viewportH: number, right?: boolean }} opts
 */
export function applyCaseStudyEdgeShadeUniforms(material, opts) {
	if (!material?.uniforms) {
		return;
	}
	const cfg = caseStudyEdgeShadeConfig;
	const viewportW = Math.max(1, opts.viewportW || 1);
	const viewportH = Math.max(1, opts.viewportH || 1);
	const right = opts.right !== false && cfg.rightEnabled !== false;

	setUniform(material, "uOpacity", Math.max(0, Math.min(1, opts.opacity ?? 0)));
	material.uniforms.uViewportPx?.value?.set(viewportW, viewportH);

	setUniform(material, "uArcStopSolid", cfg.arcStopSolid);
	setUniform(material, "uArcStopMid", cfg.arcStopMid);
	setUniform(material, "uArcMidAlpha", cfg.arcMidAlpha);
	setUniform(material, "uArcStopFade", cfg.arcStopFade);

	if (!right) {
		setUniform(material, "uArcShadeEnabled", 0);
		setUniform(material, "uArcShadeBandPx", 0);
		return;
	}

	const geo = resolveCaseStudyArcGeometry(
		viewportW,
		viewportH,
		caseStudyArcInternals.maxNavItems,
		false,
		resolveArcVerticalBounds(viewportH),
	);
	const rightClearance = Math.max(0, viewportW - (geo.centerX + geo.radius));
	const shadeBand = Math.max(
		rightClearance + Math.max(0, cfg.arcBandPadPx),
		Math.min(Math.max(8, cfg.arcBandMaxPx), viewportW * Math.max(0.02, cfg.arcBandVw)),
		geo.radius * 0.22,
	);

	setUniform(material, "uArcShadeEnabled", 1);
	material.uniforms.uArcCenterPx?.value?.set(geo.centerX, geo.centerY);
	setUniform(material, "uArcRadiusPx", Math.max(1, geo.radius + (cfg.arcRadiusInsetPx || 0)));
	setUniform(material, "uArcShadeBandPx", shadeBand);
}
