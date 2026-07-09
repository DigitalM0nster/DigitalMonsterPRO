import * as THREE from "three";

import { hexGridOverlayDefaults } from "./hexGridOverlayConfig.js";

const vertexShader = /* glsl */ `
varying vec2 vUv;

void main() {
	vUv = uv;
	gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const fragmentShader = /* glsl */ `
uniform vec2 resolution;
uniform float hexScale;
uniform float fisheyeStrength;
uniform float progress;
uniform float innerMaxRadius;
uniform float innerMinRadius;
uniform float innerSoftness;
uniform float innerRevealPower;
uniform float innerTextureScale;
uniform float innerDistortStrength;
uniform float outerTextureScale;
uniform float outerDistortStrength;
uniform float rowSoftness;
uniform float rowRandomStrength;
/** Множитель длительности анимации одной ячейки в global progress (≈ 2×rowSoftness×span). */
uniform float cellRevealSpan;
uniform float lineWidth;
uniform float lineInset;
uniform vec3 lineColor;
uniform float lineOpacity;
uniform float lineGlowBoost;
uniform float lineRandomStrength;
uniform sampler2D textureA;
uniform sampler2D textureB;

varying vec2 vUv;

const vec2 HEX_BASIS = vec2(1.0, 1.7320508);

vec2 applyFisheye(vec2 p, float strength) {
	if (abs(strength) < 1e-5) {
		return p;
	}
	float r2 = dot(p, p);
	return p * (1.0 + strength * r2);
}

float hexDistance(vec2 localUV) {
	vec2 p = abs(localUV);
	return max(dot(p, HEX_BASIS * 0.5), p.x);
}

vec4 hexCoordinates(vec2 gridUV) {
	vec4 hC = floor(vec4(gridUV, gridUV - vec2(0.5, 1.0)) / HEX_BASIS.xyxy) + 0.5;
	vec4 h = vec4(gridUV - hC.xy * HEX_BASIS, gridUV - (hC.zw + 0.5) * HEX_BASIS);
	return dot(h.xy, h.xy) < dot(h.zw, h.zw) ? vec4(h.xy, hC.xy) : vec4(h.zw, hC.zw + 0.5);
}

float hash21(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float cellScreenY(vec2 cellId, float scale) {
	return (cellId * HEX_BASIS).y / scale;
}

float perCellRowProgress(
	vec2 cellId,
	float globalProgress,
	float hexScale,
	float rowSoft,
	float rowRandom
) {
	float cellY = cellScreenY(cellId, hexScale);
	float rowIndex = clamp(cellY * 0.5 + 0.5, 0.0, 1.0);
	float jitterMix = sin(globalProgress * 3.14159265);
	float jitter = (hash21(cellId) - 0.5) * rowRandom * jitterMix;
	float threshold = clamp(rowIndex + jitter, 0.0, 1.0);
	float soft = max(rowSoft * cellRevealSpan, 0.002);
	return smoothstep(threshold - soft, threshold + soft, globalProgress);
}

/** Контур hex: яркое ядро + мягкий ореол (bloom подхватывает свечение). */
float hexBorderLineMask(float hexDist, float width, float inset) {
	float boundary = 0.5 - inset;
	float halfW = max(width * 0.5, 0.0008);
	float soft = max(halfW * 1.4, 0.001);
	float d = abs(hexDist - boundary);
	float core = 1.0 - smoothstep(halfW, halfW + soft * 0.3, d);
	float glow = 1.0 - smoothstep(halfW, halfW + soft * 2.8, d);
	return mix(glow * 0.4, 1.0, core);
}

/**
 * Линия на фронте ячейки: sin(localProgress·π), пик в середине раскрытия ячейки.
 * lineRandomStrength — не на всех ячейках (как в референсе).
 */
float hexBorderOpacityEnvelope(float localProgress, vec2 cellId) {
	float envelope = sin(localProgress * 3.14159265);

	if (envelope < 0.02) {
		return 0.0;
	}

	if (lineRandomStrength < 0.001) {
		return envelope;
	}

	float dice = hash21(cellId + vec2(41.3, 17.9));
	float keepChance = mix(0.0, 1.0 - lineRandomStrength * 0.88, envelope);
	float gateSoft = 0.04 + lineRandomStrength * 0.1;
	float keep = 1.0 - smoothstep(keepChance - gateSoft, keepChance + gateSoft, dice);

	if (keep < 0.001) {
		return 0.0;
	}

	float ampDice = hash21(cellId + vec2(17.3, 91.7));
	float amplitude = mix(0.55 + lineRandomStrength * 0.25, 1.0, ampDice);

	return envelope * keep * amplitude;
}

/** Аддитивное жёлто-оранжевое свечение поверх fill (HDR → bloom). */
vec3 applyHexCellBorder(vec3 fill, float hexDist, float borderOpacity) {
	float edge = hexBorderLineMask(hexDist, lineWidth, lineInset);
	float amount = edge * lineOpacity * borderOpacity;
	return fill + lineColor * amount * lineGlowBoost;
}

float innerTransitionT(float localProgress, float revealPower) {
	float p = smoothstep(0.0, 1.0, localProgress);
	if (revealPower > 0.001) {
		p = pow(p, revealPower);
	}
	return p;
}

/** Центр ячейки в UV (localUV — offset от центра в hex-пространстве). */
vec2 cellCenterUv(vec2 vUv, vec2 localUV, float scale, vec2 res) {
	vec2 deltaScreen = localUV / scale;
	vec2 deltaUv = vec2(deltaScreen.x * res.y / res.x, deltaScreen.y);
	return vUv - deltaUv;
}

/** UV× > 1 — текстура визуально меньше; UV× < 1 — лупа. */
vec2 scaledTextureUv(
	vec2 vUv,
	vec2 localUV,
	float hexScale,
	vec2 res,
	float transitionT,
	float targetMul
) {
	vec2 anchor = cellCenterUv(vUv, localUV, hexScale, res);
	vec2 rel = vUv - anchor;
	float texScale = mix(1.0, targetMul, transitionT);
	return clamp(anchor + rel * texScale, 0.0, 1.0);
}

/** Per-cell волновое искажение UV. */
vec2 textureWaveDistort(vec2 uv, vec2 cellId, float amount, float strength, vec2 seedOffset) {
	if (amount < 0.001 || strength < 0.001) {
		return vec2(0.0);
	}
	float seedA = hash21(cellId + seedOffset + vec2(13.1, 7.9)) * 6.2831853;
	float seedB = hash21(cellId + seedOffset + vec2(41.7, 2.3)) * 6.2831853;
	float freq = mix(22.0, 52.0, hash21(cellId + seedOffset + vec2(5.5, 29.1)));
	vec2 wave;
	wave.x = sin(uv.y * freq + seedA) + sin((uv.x + uv.y) * freq * 0.65 + seedB);
	wave.y = cos(uv.x * freq + seedB) + sin((uv.x - uv.y) * freq * 0.55 + seedA);
	return wave * amount * strength * 0.05;
}

vec2 innerTextureDistort(vec2 uv, vec2 cellId, float amount) {
	return textureWaveDistort(uv, cellId, amount, innerDistortStrength, vec2(0.0, 0.0));
}

vec2 outerTextureDistort(vec2 uv, vec2 cellId, float amount) {
	return textureWaveDistort(uv, cellId, amount, outerDistortStrength, vec2(53.2, 71.4));
}

/**
 * Сила outer-лупы/distort от ширины inner:
 * — inner макс. широкий (transitionT → 0) → 1.0
 * — inner макс. узкий   (transitionT → 1) → 0.5
 * — хвост ячейки (localProgress → 1)     → 0.5 → 0
 */
float outerEffectAmount(float localProgress, float transitionT) {
	float t = clamp(transitionT, 0.0, 1.0);
	float p = clamp(localProgress, 0.0, 1.0);

	float distortFromInnerWidth = mix(0.5, 1.0, 1.0 - t);

	float innerIsNarrow = smoothstep(0.88, 1.0, t);
	float cellExit = smoothstep(0.86, 1.0, p);
	float exitFade = 1.0 - innerIsNarrow * cellExit;

	return clamp(distortFromInnerWidth * exitFade, 0.0, 1.0);
}

vec2 outerTextureSampleUv(
	vec2 vUv,
	vec2 localUV,
	vec2 cellId,
	float hexScale,
	vec2 res,
	float outerAmount
) {
	vec2 uv = scaledTextureUv(vUv, localUV, hexScale, res, outerAmount, outerTextureScale);
	uv += outerTextureDistort(uv, cellId, outerAmount);
	return clamp(uv, 0.0, 1.0);
}

vec2 innerTextureSampleUv(
	vec2 vUv,
	vec2 localUV,
	vec2 cellId,
	float hexScale,
	vec2 res,
	float transitionT
) {
	vec2 uv = scaledTextureUv(vUv, localUV, hexScale, res, transitionT, innerTextureScale);
	uv += innerTextureDistort(vUv, cellId, transitionT);
	return clamp(uv, 0.0, 1.0);
}

float innerHexRevealMask(
	float hexDist,
	float localProgress,
	float maxRadius,
	float minRadius,
	float softness,
	float revealPower
) {
	float p = innerTransitionT(localProgress, revealPower);
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

/** Внутренний hex — shrink (UV×>1); внешний — лупа + distort (UV×<1). */
vec4 hexCellRevealFromTextures(
	vec2 vUv,
	vec2 localUV,
	vec2 cellId,
	float hexDist,
	float localProgress,
	sampler2D texEnd,
	sampler2D texStart,
	float maxRadius,
	float minRadius,
	float innerSoft,
	float revealPower,
	float hexScale
) {
	float transitionT = innerTransitionT(localProgress, revealPower);
	float innerMask = innerHexRevealMask(
		hexDist,
		localProgress,
		maxRadius,
		minRadius,
		innerSoft,
		revealPower
	);

	float outerAmount = outerEffectAmount(localProgress, transitionT);
	vec2 uvEnd = outerTextureSampleUv(vUv, localUV, cellId, hexScale, resolution, outerAmount);
	vec4 colorEnd = texture2D(texEnd, uvEnd);

	vec2 uvStart = innerTextureSampleUv(vUv, localUV, cellId, hexScale, resolution, transitionT);
	vec4 colorStart = texture2D(texStart, uvStart);

	vec4 fill = mix(colorEnd, colorStart, innerMask);
	float borderOpacity = hexBorderOpacityEnvelope(localProgress, cellId);
	vec3 rgb = applyHexCellBorder(fill.rgb, hexDist, borderOpacity);
	return vec4(rgb, fill.a);
}

vec4 hexRowRevealCompositeTextures(
	vec2 vUv,
	vec2 localUV,
	vec2 cellId,
	float hexDist,
	float globalProgress,
	sampler2D texEnd,
	sampler2D texStart,
	float maxRadius,
	float minRadius,
	float innerSoft,
	float revealPower,
	float hexScale,
	float rowSoft,
	float rowRandom
) {
	float localProgress = perCellRowProgress(cellId, globalProgress, hexScale, rowSoft, rowRandom);
	vec4 fill;

	if (globalProgress <= 0.001) {
		fill = texture2D(texStart, vUv);
	} else if (globalProgress >= 0.999) {
		fill = texture2D(texEnd, vUv);
	} else {
		fill = hexCellRevealFromTextures(
			vUv,
			localUV,
			cellId,
			hexDist,
			localProgress,
			texEnd,
			texStart,
			maxRadius,
			minRadius,
			innerSoft,
			revealPower,
			hexScale
		);
	}

	return fill;
}

void main() {
	vec2 screenUV = (vUv * resolution - resolution * 0.5) / resolution.y;
	screenUV = applyFisheye(screenUV, fisheyeStrength);

	vec4 coords = hexCoordinates(screenUV * hexScale);
	vec2 localUV = coords.xy;
	vec2 cellId = coords.zw;
	float hexDist = hexDistance(localUV);

	vec4 rgba = hexRowRevealCompositeTextures(
		vUv,
		localUV,
		cellId,
		hexDist,
		progress,
		textureB,
		textureA,
		innerMaxRadius,
		innerMinRadius,
		innerSoftness,
		innerRevealPower,
		hexScale,
		rowSoftness,
		rowRandomStrength
	);
	gl_FragColor = rgba;
}
`;

export function createHexGridOverlayMaterial() {
	const defaults = hexGridOverlayDefaults;

	return new THREE.ShaderMaterial({
		uniforms: {
			resolution: { value: new THREE.Vector2(1, 1) },
			hexScale: { value: defaults.hexScale },
			fisheyeStrength: { value: defaults.fisheyeStrength },
			progress: { value: defaults.progress ?? 0 },
			innerMaxRadius: { value: defaults.innerMaxRadius ?? 0.38 },
			innerMinRadius: { value: defaults.innerMinRadius ?? 0 },
			innerSoftness: { value: defaults.innerSoftness ?? 0.012 },
			innerRevealPower: { value: defaults.innerRevealPower ?? 1 },
			innerTextureScale: { value: defaults.innerTextureScale ?? 1.75 },
			innerDistortStrength: { value: defaults.innerDistortStrength ?? 0.12 },
			outerTextureScale: { value: defaults.outerTextureScale ?? 0.45 },
			outerDistortStrength: { value: defaults.outerDistortStrength ?? 0.12 },
			rowSoftness: { value: defaults.rowSoftness ?? 0.06 },
			rowRandomStrength: { value: defaults.rowRandomStrength ?? 0.1 },
			cellRevealSpan: { value: defaults.cellRevealSpan ?? 1 },
			lineWidth: { value: defaults.lineWidth ?? 0.032 },
			lineInset: { value: defaults.lineInset ?? 0.003 },
			lineColor: { value: new THREE.Color().fromArray(defaults.lineColor ?? [1, 0.82, 0.14]) },
			lineOpacity: { value: defaults.lineOpacity ?? 1 },
			lineGlowBoost: { value: defaults.lineGlowBoost ?? 2.2 },
			lineRandomStrength: { value: defaults.lineRandomStrength ?? 0.72 },
			textureA: { value: null },
			textureB: { value: null },
		},
		vertexShader,
		fragmentShader,
		transparent: false,
		depthTest: false,
		depthWrite: false,
		blending: THREE.NoBlending,
		toneMapped: false,
	});
}

/** Hex overlay всегда opaque (без alpha-blend). */
export function syncHexGridMaterialBlendMode(material) {
	material.transparent = false;
	material.blending = THREE.NoBlending;
	material.needsUpdate = true;
}
