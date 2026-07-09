import * as THREE from "three";
import {
	applyHubPlateLabelBlurUniforms,
	applyHubPlateLabelGlitchUniforms,
	applyHubPlateLabelRevealUniforms,
} from "./hubPlateLabelMaterial.js";

const vertexShader = /* glsl */ `
varying vec2 vUv;

void main() {
	vUv = uv;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * Кнопка «Смотреть кейс»: canvas — плоский цвет без shadow,
 * HDR-bloom — в шейдере (как змейка списка проектов).
 */
const fragmentShader = /* glsl */ `
uniform sampler2D map;
uniform float opacity;
uniform float bloomBoost;
uniform float revealProgress;
uniform float revealLinear;
uniform float revealEnter;
uniform float partSize;
uniform float revealSeed;
uniform float shiftRatio;
uniform float dropMin;
uniform float dropMax;
uniform float sweepSpread;
uniform float usePartReveal;
uniform float blur;
uniform vec2 blurStep;
uniform float glitchProgress;
uniform float glitchTime;
uniform float glitchIntensity;
uniform float glitchSliceCount;
uniform float glitchRgbShift;
uniform vec3 glitchColor;

varying vec2 vUv;

float hash21(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}

float easeOutCubic(float t) {
	float c = clamp(t, 0.0, 1.0);
	return 1.0 - pow(1.0 - c, 3.0);
}

float easeInOutCubic(float t) {
	float c = clamp(t, 0.0, 1.0);
	return c < 0.5
		? 4.0 * c * c * c
		: 1.0 - pow(-2.0 * c + 2.0, 3.0) / 2.0;
}

vec4 sampleHudMap(vec2 uv) {
	if (blur < 0.001) {
		return texture2D(map, uv);
	}

	vec4 sum = vec4(0.0);
	float weightSum = 0.0;

	for (float x = -2.0; x <= 2.0; x += 1.0) {
		for (float y = -2.0; y <= 2.0; y += 1.0) {
			vec2 offset = vec2(x, y) * blurStep * blur;
			float weight = 1.0 - length(vec2(x, y)) * 0.12;
			sum += texture2D(map, uv + offset) * weight;
			weightSum += weight;
		}
	}

	return sum / max(weightSum, 0.0001);
}

void main() {
	if (revealProgress <= 0.0) {
		discard;
	}

	vec2 sampleUv = vUv;
	float buildT = easeInOutCubic(revealLinear);
	float alphaT = revealEnter > 0.5 ? buildT : revealProgress;

	if (usePartReveal > 0.5) {
		float cellW = partSize;
		float cellH = partSize;
		vec2 cellId = vec2(floor(vUv.x / cellW), floor(vUv.y / cellH));
		vec2 gridCount = vec2(ceil(1.0 / cellW), ceil(1.0 / cellH));
		float order = (cellId.x / max(gridCount.x - 1.0, 1.0) + cellId.y / max(gridCount.y - 1.0, 1.0) * 0.22);
		float localT = clamp((buildT - order * sweepSpread) / max(1.0 - sweepSpread, 0.001), 0.0, 1.0);
		float riseT = easeOutCubic(localT);
		alphaT = revealEnter > 0.5 ? localT : revealProgress * localT;

		vec2 seedOffset = vec2(revealSeed, revealSeed * 1.37);
		float shiftRoll = hash21(cellId + seedOffset);
		if (shiftRoll < shiftRatio) {
			float dropRoll = hash21(cellId + seedOffset * 2.11 + vec2(5.1, 9.3));
			float dropUv = mix(dropMin, dropMax, dropRoll);
			sampleUv.y += dropUv * (1.0 - riseT);
		}
	}

	if (sampleUv.x < 0.0 || sampleUv.x > 1.0 || sampleUv.y < 0.0 || sampleUv.y > 1.0) {
		discard;
	}

	float glitchBand = 0.0;
	vec2 glitchUv = sampleUv;

	if (glitchProgress > 0.001) {
		float sliceId = floor(vUv.y * max(glitchSliceCount, 1.0));
		float bandNoise = hash21(vec2(sliceId, floor(glitchTime * 42.0) + revealSeed));
		float bandPulse = step(0.42, bandNoise);
		float bandWave = sin(glitchTime * 52.0 + sliceId * 2.37);
		float bandOffset = (bandNoise - 0.5) * 2.0 * glitchIntensity * glitchProgress;

		glitchBand = bandPulse * glitchProgress;
		glitchUv.x += bandOffset * bandPulse + bandWave * glitchIntensity * 0.16 * glitchProgress;
	}

	if (glitchUv.x < 0.0 || glitchUv.x > 1.0 || glitchUv.y < 0.0 || glitchUv.y > 1.0) {
		discard;
	}

	vec4 tex = sampleHudMap(glitchUv);
	if (tex.a < 0.001) {
		discard;
	}

	if (glitchProgress > 0.001) {
		vec2 rgbOffset = vec2(glitchRgbShift * glitchProgress, 0.0);
		float red = sampleHudMap(clamp(glitchUv + rgbOffset, vec2(0.0), vec2(1.0))).r;
		float blue = sampleHudMap(clamp(glitchUv - rgbOffset, vec2(0.0), vec2(1.0))).b;
		tex.rgb = mix(tex.rgb, vec3(red, tex.g, blue), glitchProgress);
		tex.rgb = mix(tex.rgb, glitchColor, glitchBand * tex.a * 0.55);
	}

	float alpha = tex.a * opacity * alphaT;
	if (alpha < 0.0001) {
		discard;
	}

	vec3 rgb = tex.rgb * bloomBoost;
	gl_FragColor = vec4(rgb, alpha);
}
`;

export function createHubPlateDetailsTextMaterial(texture, options = {}) {
	const reveal = options.reveal ?? {};

	return new THREE.ShaderMaterial({
		name: "HubPlateDetailsTextMaterial",
		uniforms: {
			map: { value: texture },
			opacity: { value: options.opacity ?? 1 },
			bloomBoost: { value: options.bloomBoost ?? 4 },
			revealProgress: { value: 0 },
			revealLinear: { value: 0 },
			revealEnter: { value: 0 },
			partSize: { value: reveal.partSize ?? 0.035 },
			revealSeed: { value: options.revealSeed ?? 0 },
			shiftRatio: { value: reveal.shiftRatio ?? 0.42 },
			dropMin: { value: reveal.dropMin ?? 0.18 },
			dropMax: { value: reveal.dropMax ?? 0.42 },
			sweepSpread: { value: reveal.sweepSpread ?? 0.55 },
			usePartReveal: { value: reveal.enabled !== false ? 1 : 0 },
			blur: { value: options.blur ?? 0 },
			blurStep: { value: options.blurStep ?? new THREE.Vector2(1, 1) },
			glitchProgress: { value: 0 },
			glitchTime: { value: 0 },
			glitchIntensity: { value: options.glitch?.intensity ?? 0.031 },
			glitchSliceCount: { value: options.glitch?.sliceCount ?? 13 },
			glitchRgbShift: { value: options.glitch?.rgbShift ?? 0 },
			glitchColor: { value: new THREE.Color(options.glitch?.color ?? "#ffffff") },
		},
		vertexShader,
		fragmentShader,
		transparent: true,
		depthTest: true,
		depthWrite: false,
		toneMapped: false,
		side: THREE.FrontSide,
	});
}

export function applyHubPlateDetailsBloomUniforms(material, bloomBoost = 4) {
	const uniforms = material?.uniforms;
	if (!uniforms?.bloomBoost) {
		return;
	}

	uniforms.bloomBoost.value = bloomBoost;
}

export {
	applyHubPlateLabelBlurUniforms,
	applyHubPlateLabelGlitchUniforms,
	applyHubPlateLabelRevealUniforms,
};
