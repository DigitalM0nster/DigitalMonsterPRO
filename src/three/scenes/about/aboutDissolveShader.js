import * as THREE from "three";

import { hexGridOverlayDefaults } from "@/three/render/overlay/hexGridOverlayConfig.js";

/**
 * Stage 1 (0.5→1.0) disappear variants for Front / OUTER_cell.
 * Switch via ABOUT_MATERIALS.stage2Dissolve.mode (0…5) or DEV HUD.
 *
 * Mode 0 mirrors site hexTransition (`hexGridOverlayMaterial`):
 * pointy hex tiling, per-row cell progress, inner-hex shrink, border glow.
 */
export const ABOUT_DISSOLVE_MODES = [
	{ id: "hex", label: "1 Hex transition", mode: 0 },
	{ id: "scan", label: "2 Scan wipe", mode: 1 },
	{ id: "glitch", label: "3 Glitch shatter", mode: 2 },
	{ id: "vapor", label: "4 Energy vapor", mode: 3 },
	{ id: "grid", label: "5 Grid unbuild", mode: 4 },
	{ id: "radial", label: "6 Radial out", mode: 5 },
];

const HEX_LINE = hexGridOverlayDefaults.lineColor ?? [0.141, 0.584, 1];

export function createAboutDissolveUniforms(cfg = {}) {
	const hex = { ...hexGridOverlayDefaults, ...(cfg.hex ?? {}) };
	return {
		uDissolve: { value: 0 },
		uDissolveMode: { value: Number(cfg.mode ?? 0) },
		uDissolveEdge: { value: cfg.edge ?? 0.08 },
		uDissolveGlow: { value: cfg.glow ?? 1.35 },
		uHexScale: { value: hex.hexScale ?? 18 },
		uHexFisheye: { value: hex.fisheyeStrength ?? 0.4 },
		uHexRowSoft: { value: hex.rowSoftness ?? 0.08 },
		uHexRowRandom: { value: hex.rowRandomStrength ?? 0.175 },
		uHexCellSpan: { value: hex.cellRevealSpan ?? 2 },
		uHexInnerMax: { value: hex.innerMaxRadius ?? 1 },
		uHexInnerMin: { value: hex.innerMinRadius ?? 0 },
		uHexInnerSoft: { value: hex.innerSoftness ?? 0.055 },
		uHexRevealPower: { value: hex.innerRevealPower ?? 2.5 },
		uHexLineWidth: { value: hex.lineWidth ?? 0.008 },
		uHexLineInset: { value: hex.lineInset ?? 0.033 },
		uHexLineOpacity: { value: hex.lineOpacity ?? 1 },
		uHexLineGlowBoost: { value: hex.lineGlowBoost ?? 5 },
		uHexLineRandom: { value: hex.lineRandomStrength ?? 0.7 },
		uHexLineColor: { value: new THREE.Color().fromArray(HEX_LINE) },
	};
}

export function applyAboutDissolveConfig(uniforms, cfg = {}) {
	if (!uniforms) return;
	if (cfg.mode != null) uniforms.uDissolveMode.value = Number(cfg.mode);
	if (cfg.edge != null) uniforms.uDissolveEdge.value = cfg.edge;
	if (cfg.glow != null) uniforms.uDissolveGlow.value = cfg.glow;
	const hex = cfg.hex;
	if (!hex) return;
	if (hex.hexScale != null) uniforms.uHexScale.value = hex.hexScale;
	if (hex.fisheyeStrength != null) uniforms.uHexFisheye.value = hex.fisheyeStrength;
	if (hex.rowSoftness != null) uniforms.uHexRowSoft.value = hex.rowSoftness;
	if (hex.rowRandomStrength != null) uniforms.uHexRowRandom.value = hex.rowRandomStrength;
	if (hex.cellRevealSpan != null) uniforms.uHexCellSpan.value = hex.cellRevealSpan;
	if (hex.innerMaxRadius != null) uniforms.uHexInnerMax.value = hex.innerMaxRadius;
	if (hex.innerMinRadius != null) uniforms.uHexInnerMin.value = hex.innerMinRadius;
	if (hex.innerSoftness != null) uniforms.uHexInnerSoft.value = hex.innerSoftness;
	if (hex.innerRevealPower != null) uniforms.uHexRevealPower.value = hex.innerRevealPower;
	if (hex.lineWidth != null) uniforms.uHexLineWidth.value = hex.lineWidth;
	if (hex.lineInset != null) uniforms.uHexLineInset.value = hex.lineInset;
	if (hex.lineOpacity != null) uniforms.uHexLineOpacity.value = hex.lineOpacity;
	if (hex.lineGlowBoost != null) uniforms.uHexLineGlowBoost.value = hex.lineGlowBoost;
	if (hex.lineRandomStrength != null) uniforms.uHexLineRandom.value = hex.lineRandomStrength;
	if (hex.lineColor != null) uniforms.uHexLineColor.value.fromArray(hex.lineColor);
}

export function setAboutDissolveProgress(uniforms, progress) {
	if (!uniforms?.uDissolve) return;
	uniforms.uDissolve.value = THREE.MathUtils.clamp(Number(progress) || 0, 0, 1);
}

/**
 * GLSL: expects hash21 already defined in the host shader.
 * Returns vec2(visibility 0..1, edgeGlow 0..1).
 *
 * Mode 0 reuses the same cell math as hexGridOverlayMaterial
 * (without A/B texture mix — surface shrinks away like textureA).
 */
export const ABOUT_DISSOLVE_GLSL = /* glsl */ `
	uniform float uDissolve;
	uniform float uDissolveMode;
	uniform float uDissolveEdge;
	uniform float uDissolveGlow;
	uniform float uHexScale;
	uniform float uHexFisheye;
	uniform float uHexRowSoft;
	uniform float uHexRowRandom;
	uniform float uHexCellSpan;
	uniform float uHexInnerMax;
	uniform float uHexInnerMin;
	uniform float uHexInnerSoft;
	uniform float uHexRevealPower;
	uniform float uHexLineWidth;
	uniform float uHexLineInset;
	uniform float uHexLineOpacity;
	uniform float uHexLineGlowBoost;
	uniform float uHexLineRandom;
	uniform vec3 uHexLineColor;

	const vec2 ABOUT_HEX_BASIS = vec2(1.0, 1.7320508);

	/** Same hash as hexGridOverlayMaterial — not the host material hash21. */
	float aboutHexHash21(vec2 p) {
		return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
	}

	vec2 aboutHexApplyFisheye(vec2 p, float strength) {
		if (abs(strength) < 1e-5) return p;
		float r2 = dot(p, p);
		return p * (1.0 + strength * r2);
	}

	float aboutHexDistance(vec2 localUV) {
		vec2 p = abs(localUV);
		return max(dot(p, ABOUT_HEX_BASIS * 0.5), p.x);
	}

	vec4 aboutHexCoordinates(vec2 gridUV) {
		vec4 hC = floor(vec4(gridUV, gridUV - vec2(0.5, 1.0)) / ABOUT_HEX_BASIS.xyxy) + 0.5;
		vec4 h = vec4(gridUV - hC.xy * ABOUT_HEX_BASIS, gridUV - (hC.zw + 0.5) * ABOUT_HEX_BASIS);
		return dot(h.xy, h.xy) < dot(h.zw, h.zw) ? vec4(h.xy, hC.xy) : vec4(h.zw, hC.zw + 0.5);
	}

	float aboutHexCellScreenY(vec2 cellId, float scale) {
		return (cellId * ABOUT_HEX_BASIS).y / scale;
	}

	float aboutHexPerCellRowProgress(
		vec2 cellId,
		float globalProgress,
		float hexScale,
		float rowSoft,
		float rowRandom
	) {
		float cellY = aboutHexCellScreenY(cellId, hexScale);
		float rowIndex = clamp(cellY * 0.5 + 0.5, 0.0, 1.0);
		float jitterMix = sin(globalProgress * 3.14159265);
		float jitter = (aboutHexHash21(cellId) - 0.5) * rowRandom * jitterMix;
		float threshold = clamp(rowIndex + jitter, 0.0, 1.0);
		float soft = max(rowSoft * uHexCellSpan, 0.002);
		return smoothstep(threshold - soft, threshold + soft, globalProgress);
	}

	float aboutHexInnerTransitionT(float localProgress, float revealPower) {
		float p = smoothstep(0.0, 1.0, localProgress);
		if (revealPower > 0.001) {
			p = pow(p, revealPower);
		}
		return p;
	}

	float aboutHexInnerRevealMask(
		float hexDist,
		float localProgress,
		float maxRadius,
		float minRadius,
		float softness,
		float revealPower
	) {
		float p = aboutHexInnerTransitionT(localProgress, revealPower);
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

	float aboutHexBorderLineMask(float hexDist, float width, float inset) {
		float boundary = 0.5 - inset;
		float halfW = max(width * 0.5, 0.0008);
		float soft = max(halfW * 1.4, 0.001);
		float d = abs(hexDist - boundary);
		float core = 1.0 - smoothstep(halfW, halfW + soft * 0.3, d);
		float glow = 1.0 - smoothstep(halfW, halfW + soft * 2.8, d);
		return mix(glow * 0.4, 1.0, core);
	}

	float aboutHexBorderOpacityEnvelope(float localProgress, vec2 cellId) {
		float envelope = sin(localProgress * 3.14159265);
		if (envelope < 0.02) return 0.0;
		if (uHexLineRandom < 0.001) return envelope;

		float dice = aboutHexHash21(cellId + vec2(41.3, 17.9));
		float keepChance = mix(0.0, 1.0 - uHexLineRandom * 0.88, envelope);
		float gateSoft = 0.04 + uHexLineRandom * 0.1;
		float keep = 1.0 - smoothstep(keepChance - gateSoft, keepChance + gateSoft, dice);
		if (keep < 0.001) return 0.0;

		float ampDice = aboutHexHash21(cellId + vec2(17.3, 91.7));
		float amplitude = mix(0.55 + uHexLineRandom * 0.25, 1.0, ampDice);
		return envelope * keep * amplitude;
	}

	/**
	 * d = 0 → fully visible; d = 1 → gone.
	 * Visibility rule: pixel survives while field > cut (rising cut eats the surface),
	 * except mode 0 which uses hexTransition inner-hex shrink.
	 */
	vec2 aboutDissolveSample(vec2 uv, vec3 localPos, float time) {
		float d = clamp(uDissolve, 0.0, 1.0);
		if (d <= 1e-5) return vec2(1.0, 0.0);
		if (d >= 0.999) return vec2(0.0, 0.0);

		float mode = floor(uDissolveMode + 0.5);
		float edge = max(0.02, uDissolveEdge);
		float field = 0.0;
		float cut = 0.0;
		float band = 0.0;
		float vis = 1.0;

		if (mode < 0.5) {
			/**
			 * 0 — same hexTransition cell reveal as hexGridOverlayMaterial:
			 * row wave + per-cell inner hex shrink + border envelope.
			 */
			vec2 screenUV = uv - 0.5;
			screenUV = aboutHexApplyFisheye(screenUV, uHexFisheye);
			vec4 coords = aboutHexCoordinates(screenUV * uHexScale);
			vec2 localUV = coords.xy;
			vec2 cellId = coords.zw;
			float hexDist = aboutHexDistance(localUV);
			float localProgress = aboutHexPerCellRowProgress(
				cellId,
				d,
				uHexScale,
				uHexRowSoft,
				uHexRowRandom
			);
			vis = aboutHexInnerRevealMask(
				hexDist,
				localProgress,
				uHexInnerMax,
				uHexInnerMin,
				uHexInnerSoft,
				uHexRevealPower
			);
			float borderEnv = aboutHexBorderOpacityEnvelope(localProgress, cellId);
			float line = aboutHexBorderLineMask(hexDist, uHexLineWidth, uHexLineInset);
			band = line * uHexLineOpacity * borderEnv;
			return vec2(vis, band);
		}

		if (mode < 1.5) {
			/** 1 Scan wipe — line rises, everything below is gone */
			float n = hash21(floor(uv * vec2(40.0, 8.0)) + floor(time * 12.0));
			field = uv.y + n * 0.06;
			cut = d * 1.12;
			vis = smoothstep(cut - edge, cut + edge * 0.25, field);
			band = exp(-abs(field - cut) * 28.0) * d;
			return vec2(vis, band);
		}

		if (mode < 2.5) {
			/** 2 Glitch shatter */
			float row = floor(uv.y * 48.0);
			float col = floor(uv.x * 32.0 + hash21(vec2(row, 3.1)) * 6.0);
			float slice = step(0.55, hash21(vec2(row, floor(time * 20.0))));
			field = hash21(vec2(col, row)) + slice * 0.25 * hash21(vec2(row, 9.0));
			cut = d * 1.15;
			vis = smoothstep(cut - edge * 0.5, cut + edge * 0.2, field);
			band = (1.0 - vis) * step(cut - 0.14, field) * (0.45 + slice) * d;
			return vec2(vis, band);
		}

		if (mode < 3.5) {
			/**
			 * 3 Energy vapor — ease-in through mid, fully clear by d≈0.8
			 * (no leftover blocky squares that hard-pop at 1.0).
			 */
			float n = hash21(floor(uv * 32.0 + time * 0.4));
			float n2 = hash21(floor(uv.yx * 22.0 - time * 0.25));
			field = mix(n, n2, 0.45) + uv.y * 0.14;
			float t = clamp(d / 0.8, 0.0, 1.0);
			/** Ease-in: still readable at 0.7, gone at 0.8 */
			float dV = t * t;
			cut = dV * 1.25;
			vis = smoothstep(cut - edge * 1.1, cut + edge * 0.4, field);
			vis *= 1.0 - smoothstep(0.74, 0.82, d);
			band = exp(-abs(field - cut) * 16.0) * (0.55 + n2) * d
				* (1.0 - smoothstep(0.76, 0.84, d));
			return vec2(vis, band);
		}

		if (mode < 4.5) {
			/** 4 Grid unbuild — fill first, lines last */
			vec2 g = abs(fract(uv * 22.0) - 0.5);
			float line = max(step(g.x, 0.03), step(g.y, 0.03));
			float fill = hash21(floor(uv * 22.0));
			float fillCut = smoothstep(0.0, 0.55, d) * 1.05;
			float lineGone = smoothstep(0.35, 1.0, d);
			float visFill = smoothstep(fillCut - 0.04, fillCut + 0.02, fill);
			float visLine = (1.0 - lineGone) * line;
			vis = max(visFill * (1.0 - line * 0.85), visLine);
			band = line * smoothstep(0.25, 0.9, d) * (1.0 - lineGone);
			return vec2(vis, band);
		}

		/** 5 Radial out — hole grows from center */
		vec2 c = uv - 0.5;
		field = length(c) * 1.45 + hash21(floor(c * 40.0 + 2.0)) * 0.08;
		cut = d * 1.25;
		vis = smoothstep(cut - edge, cut + edge * 0.25, field);
		band = exp(-abs(field - cut) * 22.0) * d;
		return vec2(vis, band);
	}

	vec3 aboutDissolveGlow(vec3 rimColor, float band) {
		float mode = floor(uDissolveMode + 0.5);
		if (mode < 0.5) {
			/** Match hexTransition border: lineColor × amount × lineGlowBoost. */
			return uHexLineColor * band * uHexLineGlowBoost;
		}
		return rimColor * band * uDissolveGlow * (1.2 + band);
	}
`;
