/**
 * Shared hex-grid math for the models hex mix and case HUD overlay cut.
 * Keep formulas identical so wipe edges match.
 */
import * as THREE from "three";

/** Parameterized cell math — no material-specific uniforms. */
export const HEX_GRID_CUT_CORE_GLSL = /* glsl */ `
const vec2 HEX_CUT_BASIS = vec2(1.0, 1.7320508);

vec2 hexCutApplyFisheye(vec2 p, float strength) {
	if (abs(strength) < 1e-5) {
		return p;
	}
	float r2 = dot(p, p);
	return p * (1.0 + strength * r2);
}

float hexCutDistance(vec2 localUV) {
	vec2 p = abs(localUV);
	return max(dot(p, HEX_CUT_BASIS * 0.5), p.x);
}

vec4 hexCutCoordinates(vec2 gridUV) {
	vec4 hC = floor(vec4(gridUV, gridUV - vec2(0.5, 1.0)) / HEX_CUT_BASIS.xyxy) + 0.5;
	vec4 h = vec4(gridUV - hC.xy * HEX_CUT_BASIS, gridUV - (hC.zw + 0.5) * HEX_CUT_BASIS);
	return dot(h.xy, h.xy) < dot(h.zw, h.zw) ? vec4(h.xy, hC.xy) : vec4(h.zw, hC.zw + 0.5);
}

float hexCutHash21(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float hexCutCellScreenY(vec2 cellId, float scale) {
	return (cellId * HEX_CUT_BASIS).y / scale;
}

float hexCutPerCellRevealProgress(
	vec2 cellId,
	float globalProgress,
	float hexScale,
	float rowSoft,
	float rowRandom,
	float revealFromTop,
	float cellRevealSpan
) {
	float cellY = hexCutCellScreenY(cellId, hexScale);
	float rowIndex = clamp(cellY * 0.5 + 0.5, 0.0, 1.0);
	if (revealFromTop > 0.5) {
		rowIndex = 1.0 - rowIndex;
	}
	float jitterMix = sin(globalProgress * 3.14159265);
	float jitter = (hexCutHash21(cellId) - 0.5) * rowRandom * jitterMix;
	float threshold = clamp(rowIndex + jitter, 0.0, 1.0);
	float soft = max(rowSoft * cellRevealSpan, 0.002);
	return smoothstep(threshold - soft, threshold + soft, globalProgress);
}

float hexCutInnerTransitionT(float localProgress, float revealPower) {
	float p = smoothstep(0.0, 1.0, localProgress);
	if (revealPower > 0.001) {
		p = pow(p, revealPower);
	}
	return p;
}

float hexCutInnerRevealMask(
	float hexDist,
	float localProgress,
	float maxRadius,
	float minRadius,
	float softness,
	float revealPower
) {
	float p = hexCutInnerTransitionT(localProgress, revealPower);
	float radius = mix(maxRadius, minRadius, p);
	float soft = max(softness, 0.001);

	if (p <= 0.001) {
		return step(hexDist, 0.5 + soft * 0.5);
	}
	if (radius <= soft * 0.5) {
		return 0.0;
	}
	return smoothstep(radius + soft, radius - soft, hexDist);
}
`;

/** Uniform declarations for HUD overlay hex cut / warp. */
export const HEX_GRID_CUT_UNIFORMS_GLSL = /* glsl */ `
uniform vec2 uHexResolution;
uniform float uHexScale;
uniform float uHexFisheye;
uniform float uHexProgress;
uniform float uHexRevealFromTop;
uniform float uHexInnerMaxRadius;
uniform float uHexInnerMinRadius;
uniform float uHexInnerSoftness;
uniform float uHexInnerRevealPower;
uniform float uHexInnerTextureScale;
uniform float uHexInnerDistortStrength;
uniform float uHexSourceTextureEffectStrength;
uniform float uHexRowSoftness;
uniform float uHexRowRandomStrength;
uniform float uHexCellRevealSpan;
`;

/**
 * 1 = source still visible (draw HUD). 0 = hex revealed target (cut HUD).
 * Requires HEX_GRID_CUT_CORE_GLSL + HEX_GRID_CUT_UNIFORMS_GLSL.
 */
export const HEX_GRID_CUT_SOURCE_VISIBLE_GLSL = /* glsl */ `
/**
 * Soft source-visible mask (0…1), same as models hex inner fill.
 * HUD must hard-threshold this — multiplying soft alpha into glyphs over a
 * bloomed scene reads as blue ghosting / smear.
 */
float hexCutSourceVisible(vec2 vUv) {
	float globalProgress = clamp(uHexProgress, 0.0, 1.0);
	if (globalProgress <= 0.001) {
		return 1.0;
	}
	if (globalProgress >= 0.999) {
		return 0.0;
	}
	// Unsynced / idle defaults — do not invent a grid over UI text.
	if (uHexResolution.x < 2.0 || uHexResolution.y < 2.0) {
		return 1.0;
	}

	vec2 screenUV = (vUv * uHexResolution - uHexResolution * 0.5) / max(uHexResolution.y, 1.0);
	screenUV = hexCutApplyFisheye(screenUV, uHexFisheye);

	vec4 coords = hexCutCoordinates(screenUV * uHexScale);
	vec2 localUV = coords.xy;
	vec2 cellId = coords.zw;
	float hexDist = hexCutDistance(localUV);

	float localProgress = hexCutPerCellRevealProgress(
		cellId,
		globalProgress,
		uHexScale,
		uHexRowSoftness,
		uHexRowRandomStrength,
		uHexRevealFromTop,
		uHexCellRevealSpan
	);

	return hexCutInnerRevealMask(
		hexDist,
		localProgress,
		uHexInnerMaxRadius,
		uHexInnerMinRadius,
		uHexInnerSoftness,
		uHexInnerRevealPower
	);
}

/**
 * Same UV shrink + wave as HexGridOverlayPass inner source sample.
 * Requires HEX_GRID_CUT_CORE_GLSL + HEX_GRID_CUT_UNIFORMS_GLSL.
 */
vec2 hexCutHudCellCenterUv(vec2 vUv, vec2 localUV) {
	vec2 deltaScreen = localUV / max(uHexScale, 0.0001);
	vec2 deltaUv = vec2(
		deltaScreen.x * uHexResolution.y / max(uHexResolution.x, 1.0),
		deltaScreen.y
	);
	return vUv - deltaUv;
}

vec2 hexCutHudScaledUv(vec2 vUv, vec2 localUV, float transitionT, float targetMul) {
	vec2 anchor = hexCutHudCellCenterUv(vUv, localUV);
	vec2 rel = vUv - anchor;
	float texScale = mix(1.0, targetMul, transitionT);
	return clamp(anchor + rel * texScale, 0.0, 1.0);
}

vec2 hexCutHudWaveDistort(vec2 uv, vec2 cellId, float amount, float strength) {
	if (amount < 0.001 || strength < 0.001) {
		return vec2(0.0);
	}
	float seedA = hexCutHash21(cellId + vec2(13.1, 7.9)) * 6.2831853;
	float seedB = hexCutHash21(cellId + vec2(41.7, 2.3)) * 6.2831853;
	float freq = mix(22.0, 52.0, hexCutHash21(cellId + vec2(5.5, 29.1)));
	vec2 wave;
	wave.x = sin(uv.y * freq + seedA) + sin((uv.x + uv.y) * freq * 0.65 + seedB);
	wave.y = cos(uv.x * freq + seedB) + sin((uv.x - uv.y) * freq * 0.55 + seedA);
	return wave * amount * strength * 0.05;
}

/**
 * HUD leave: source text → empty, same per-cell inner warp as models hex.
 * Returns vec3(sampleUv.xy, keep). keep < 0 → hex idle (use ordinary HUD path).
 * keep in 0…1 → warped sample mask (HUD must hard-threshold; do not multiply soft alpha).
 */
vec3 hexCutHudSourceWarpPack(vec2 vUv) {
	float globalProgress = clamp(uHexProgress, 0.0, 1.0);
	if (globalProgress <= 0.001) {
		return vec3(vUv, -1.0);
	}
	if (uHexResolution.x < 2.0 || uHexResolution.y < 2.0) {
		return vec3(vUv, -1.0);
	}
	if (globalProgress >= 0.999) {
		return vec3(vUv, 0.0);
	}

	vec2 screenUV = (vUv * uHexResolution - uHexResolution * 0.5) / max(uHexResolution.y, 1.0);
	screenUV = hexCutApplyFisheye(screenUV, uHexFisheye);
	vec4 coords = hexCutCoordinates(screenUV * uHexScale);
	vec2 localUV = coords.xy;
	vec2 cellId = coords.zw;
	float hexDist = hexCutDistance(localUV);
	float localProgress = hexCutPerCellRevealProgress(
		cellId,
		globalProgress,
		uHexScale,
		uHexRowSoftness,
		uHexRowRandomStrength,
		uHexRevealFromTop,
		uHexCellRevealSpan
	);

	if (localProgress <= 0.001) {
		return vec3(vUv, -1.0);
	}

	float transitionT = hexCutInnerTransitionT(localProgress, uHexInnerRevealPower);
	float effectT = transitionT * clamp(uHexSourceTextureEffectStrength, 0.0, 1.0);
	vec2 sampleUv = hexCutHudScaledUv(vUv, localUV, effectT, uHexInnerTextureScale);
	sampleUv += hexCutHudWaveDistort(vUv, cellId, effectT, uHexInnerDistortStrength);
	sampleUv = clamp(sampleUv, 0.0, 1.0);
	float keep = hexCutInnerRevealMask(
		hexDist,
		localProgress,
		uHexInnerMaxRadius,
		uHexInnerMinRadius,
		uHexInnerSoftness,
		uHexInnerRevealPower
	);
	return vec3(sampleUv, keep);
}
`;

/** @returns {Record<string, { value: unknown }>} */
export function createHexGridCutUniforms() {
	return {
		uHexResolution: { value: new THREE.Vector2(1, 1) },
		uHexScale: { value: 1 },
		uHexFisheye: { value: 0 },
		uHexProgress: { value: 0 },
		uHexRevealFromTop: { value: 0 },
		uHexInnerMaxRadius: { value: 0.38 },
		uHexInnerMinRadius: { value: 0 },
		uHexInnerSoftness: { value: 0.012 },
		uHexInnerRevealPower: { value: 1 },
		uHexInnerTextureScale: { value: 2.75 },
		uHexInnerDistortStrength: { value: 0.4 },
		uHexSourceTextureEffectStrength: { value: 1 },
		uHexRowSoftness: { value: 0.06 },
		uHexRowRandomStrength: { value: 0.1 },
		uHexCellRevealSpan: { value: 1 },
	};
}

/**
 * Copy live hex-pass uniforms into a HUD material's hex-cut uniforms.
 * @param {THREE.ShaderMaterial} hudMaterial
 * @param {THREE.ShaderMaterial | null | undefined} hexMaterial
 * @param {number} [progressAbs]
 * @param {boolean} [revealFromTop]
 */
export function syncHexGridCutFromHexMaterial(hudMaterial, hexMaterial, progressAbs, revealFromTop) {
	if (!hudMaterial?.uniforms || !hexMaterial?.uniforms) {
		return;
	}
	const src = hexMaterial.uniforms;
	const dst = hudMaterial.uniforms;
	const res = src.resolution?.value;
	if (res && dst.uHexResolution?.value) {
		dst.uHexResolution.value.set(res.x, res.y);
	}
	if (dst.uHexScale) dst.uHexScale.value = src.hexScale?.value ?? dst.uHexScale.value;
	if (dst.uHexFisheye) dst.uHexFisheye.value = src.fisheyeStrength?.value ?? 0;
	if (dst.uHexProgress) {
		dst.uHexProgress.value = progressAbs != null
			? Math.max(0, Math.min(1, progressAbs))
			: Math.abs(src.progress?.value ?? 0);
	}
	if (dst.uHexRevealFromTop) {
		dst.uHexRevealFromTop.value = revealFromTop != null
			? (revealFromTop ? 1 : 0)
			: (src.revealFromTop?.value ?? 0);
	}
	if (dst.uHexInnerMaxRadius) dst.uHexInnerMaxRadius.value = src.innerMaxRadius?.value ?? 0.38;
	if (dst.uHexInnerMinRadius) dst.uHexInnerMinRadius.value = src.innerMinRadius?.value ?? 0;
	if (dst.uHexInnerSoftness) dst.uHexInnerSoftness.value = src.innerSoftness?.value ?? 0.012;
	if (dst.uHexInnerRevealPower) dst.uHexInnerRevealPower.value = src.innerRevealPower?.value ?? 1;
	if (dst.uHexInnerTextureScale) {
		dst.uHexInnerTextureScale.value = src.innerTextureScale?.value ?? 2.75;
	}
	if (dst.uHexInnerDistortStrength) {
		dst.uHexInnerDistortStrength.value = src.innerDistortStrength?.value ?? 0.4;
	}
	if (dst.uHexSourceTextureEffectStrength) {
		dst.uHexSourceTextureEffectStrength.value = src.sourceTextureEffectStrength?.value ?? 1;
	}
	if (dst.uHexRowSoftness) dst.uHexRowSoftness.value = src.rowSoftness?.value ?? 0.06;
	if (dst.uHexRowRandomStrength) dst.uHexRowRandomStrength.value = src.rowRandomStrength?.value ?? 0.1;
	if (dst.uHexCellRevealSpan) dst.uHexCellRevealSpan.value = src.cellRevealSpan?.value ?? 1;
}
