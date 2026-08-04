import * as THREE from "three";
import { getPortfolioHubGlitchConfig } from "./portfolioHubGlitchConfig.js";

const vertexShader = /* glsl */ `
varying vec2 vUv;

void main() {
	vUv = uv;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = /* glsl */ `
uniform sampler2D map;
uniform vec4 uvRect;
uniform vec4 mapSampleRect;
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
uniform float localeTransitionActive;
uniform float localeTransitionProgress;
uniform float localePackedMap;
uniform sampler2D localeOrderMap;
uniform vec3 localeSnakeColor;
uniform float localeSnakeBloomBoost;
uniform vec4 hoverLeftRect;
uniform vec4 hoverRightRect;
uniform float hoverLeftProgress;
uniform float hoverRightProgress;
uniform float hoverBloomBoost;
uniform vec3 hoverColor;

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

float localeSnakeOrder(vec2 uv) {
	const float rowCount = 9.0;
	float row = floor(clamp(1.0 - uv.y, 0.0, 0.9999) * rowCount);
	float rowUv = mod(row, 2.0) < 1.0 ? uv.x : 1.0 - uv.x;
	return (row + rowUv) / rowCount;
}

float localeLetterOrder(vec2 uv) {
	float encoded = texture2D(localeOrderMap, uv).r;
	return clamp((encoded - 0.08) / 0.88, 0.0, 1.0);
}

float localeLetterPhase(float progress, float order) {
	float start = 0.01 + order * 0.80;
	return clamp((progress - start) / 0.19, 0.0, 1.0);
}

vec2 packedReplacementUv(vec2 uv, float frameIndex) {
	float column = mod(frameIndex, 2.0);
	float row = floor(frameIndex / 2.0);
	return vec2(
		column * 0.5 + uv.x * 0.5,
		(1.0 - row) * 0.25 + uv.y * 0.25
	);
}

float localeReplacementFrame(float letterPhase) {
	float symbolProgress = clamp((letterPhase - 0.08) / 0.78, 0.0, 0.9999);
	return floor(symbolProgress * 3.0);
}

float insideRect(vec2 point, vec4 rect) {
	return step(rect.x, point.x) * step(rect.y, point.y) * step(point.x, rect.z) * step(point.y, rect.w);
}

vec4 sampleHudMap(vec2 uv) {
	vec2 textureUv = mapSampleRect.xy + uv * mapSampleRect.zw;
	if (blur < 0.001) {
		return texture2D(map, textureUv);
	}

	vec4 sum = vec4(0.0);
	float weightSum = 0.0;

	for (float x = -2.0; x <= 2.0; x += 1.0) {
		for (float y = -2.0; y <= 2.0; y += 1.0) {
			vec2 offset = vec2(x, y) * blurStep * blur * mapSampleRect.zw;
			float weight = 1.0 - length(vec2(x, y)) * 0.12;
			sum += texture2D(map, textureUv + offset) * weight;
			weightSum += weight;
		}
	}

	return sum / max(weightSum, 0.0001);
}

void main() {
	if (revealProgress <= 0.0) {
		discard;
	}

	vec2 rectSize = max(uvRect.zw, vec2(0.00001));
	vec2 rectMin = uvRect.xy;
	vec2 rectMax = rectMin + rectSize;
	if (
		vUv.x < rectMin.x || vUv.x > rectMax.x ||
		vUv.y < rectMin.y || vUv.y > rectMax.y
	) {
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

	if (
		sampleUv.x < rectMin.x || sampleUv.x > rectMax.x ||
		sampleUv.y < rectMin.y || sampleUv.y > rectMax.y
	) {
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

	if (
		glitchUv.x < rectMin.x || glitchUv.x > rectMax.x ||
		glitchUv.y < rectMin.y || glitchUv.y > rectMax.y
	) {
		discard;
	}

	vec2 mapUv = (glitchUv - rectMin) / rectSize;
	vec4 tex = sampleHudMap(mapUv);
	bool packedLocaleTransition = localeTransitionActive > 0.5 && localePackedMap > 0.5;
	// A replacement character may be wider than the source character. Discarding
	// against the clean source alpha here clipped those outer pixels and produced
	// the visibly cut-in-half glyphs from the regressed snake.
	if (tex.a < 0.001 && !packedLocaleTransition) {
		discard;
	}

	if (localeTransitionActive > 0.5) {
		float order = localeSnakeOrder(mapUv);
		float progress = clamp(localeTransitionProgress, 0.0, 1.0);
		if (localePackedMap > 0.5) {
			float letterOrder = localeLetterOrder(mapUv);
			float letterPhase = localeLetterPhase(progress, letterOrder);
			float oldTextVisible = 1.0 - smoothstep(0.0, 0.08, letterPhase);
			float replacementHead = smoothstep(0.02, 0.09, letterPhase) *
				(1.0 - smoothstep(0.86, 0.98, letterPhase));
			float replacementFrame = localeReplacementFrame(letterPhase);
			vec2 replacementUv = packedReplacementUv(mapUv, replacementFrame);
			vec4 replacement = texture2D(map, replacementUv);
			float oldAlpha = tex.a * oldTextVisible;
			float replacementAlpha = replacement.a * replacementHead;
			float combinedAlpha = max(oldAlpha, replacementAlpha);
			float replacementMix = clamp(
				replacementAlpha / max(combinedAlpha, 0.0001),
				0.0,
				1.0
			);
			tex.rgb = mix(
				tex.rgb,
				localeSnakeColor * (localeSnakeBloomBoost / max(bloomBoost, 0.0001)),
				replacementMix
			);
			tex.a = combinedAlpha;
		} else {
			float replaced = smoothstep(
				order - 0.018,
				order + 0.018,
				progress * 1.04
			);
			tex.a *= 1.0 - replaced;
		}
		if (tex.a < 0.001) {
			discard;
		}
	}

	if (glitchProgress > 0.001) {
		vec2 rgbOffset = vec2(glitchRgbShift * glitchProgress, 0.0);
		float red = sampleHudMap(clamp(mapUv + rgbOffset, vec2(0.0), vec2(1.0))).r;
		float blue = sampleHudMap(clamp(mapUv - rgbOffset, vec2(0.0), vec2(1.0))).b;
		tex.rgb = mix(tex.rgb, vec3(red, tex.g, blue), glitchProgress);
		tex.rgb = mix(tex.rgb, glitchColor, glitchBand * tex.a * 0.55);
	}

	float alpha = tex.a * opacity * alphaT;
	if (alpha < 0.0001) {
		discard;
	}

	float leftHover = insideRect(vUv, hoverLeftRect) * clamp(hoverLeftProgress, 0.0, 1.0);
	float rightHover = insideRect(vUv, hoverRightRect) * clamp(hoverRightProgress, 0.0, 1.0);
	float hoverMix = clamp(max(leftHover, rightHover), 0.0, 1.0);
	vec3 rgb = mix(tex.rgb * bloomBoost, hoverColor * hoverBloomBoost, hoverMix);
	gl_FragColor = vec4(rgb, alpha);
}
`;

/**
 * ShaderMaterial подписи плиты: reveal + HDR-bloom (без canvas text-shadow).
 */
export function createHubPlateLabelMaterial(texture, options = {}) {
	const reveal = options.reveal ?? {};
	const localeSnake = getPortfolioHubGlitchConfig();

	return new THREE.ShaderMaterial({
		name: "HubPlateLabelMaterial",
		uniforms: {
			map: { value: texture },
			uvRect: { value: options.uvRect?.clone?.() ?? new THREE.Vector4(0, 0, 1, 1) },
			mapSampleRect: { value: options.mapSampleRect?.clone?.() ?? new THREE.Vector4(0, 0, 1, 1) },
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
			localeTransitionActive: { value: 0 },
			localeTransitionProgress: { value: 0 },
			localePackedMap: { value: options.localePackedMap ? 1 : 0 },
			localeOrderMap: { value: options.localeOrderMap ?? texture },
			localeSnakeColor: { value: new THREE.Color(localeSnake.snakeLetterColor ?? "#1886fb") },
			localeSnakeBloomBoost: { value: localeSnake.snakeBloomBoost ?? 8 },
			hoverLeftRect: { value: options.hover?.leftRect?.clone?.() ?? new THREE.Vector4(0, 0, 0, 0) },
			hoverRightRect: { value: options.hover?.rightRect?.clone?.() ?? new THREE.Vector4(0, 0, 0, 0) },
			hoverLeftProgress: { value: 0 },
			hoverRightProgress: { value: 0 },
			hoverBloomBoost: { value: options.hover?.bloomBoost ?? options.bloomBoost ?? 4 },
			hoverColor: { value: new THREE.Color(options.hover?.color ?? "#ffffff") },
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

export function applyHubPlateLabelHoverUniforms(material, leftProgress = 0, rightProgress = 0) {
	const uniforms = material?.uniforms;
	if (!uniforms?.hoverLeftProgress || !uniforms?.hoverRightProgress) {
		return;
	}

	uniforms.hoverLeftProgress.value = Math.max(0, Math.min(1, leftProgress));
	uniforms.hoverRightProgress.value = Math.max(0, Math.min(1, rightProgress));
}

export function applyHubPlateLabelLocaleTransition(material, progress = 0, active = false) {
	const uniforms = material?.uniforms;
	if (!uniforms?.localeTransitionProgress || !uniforms?.localeTransitionActive) {
		return;
	}

	uniforms.localeTransitionProgress.value = Math.max(0, Math.min(1, progress));
	uniforms.localeTransitionActive.value = active ? 1 : 0;
}

export function applyHubPlateLabelBloomUniforms(material, bloomBoost = 4) {
	const uniforms = material?.uniforms;
	if (!uniforms?.bloomBoost) {
		return;
	}

	uniforms.bloomBoost.value = bloomBoost;
}

export function applyHubPlateLabelRevealUniforms(uniforms, alpha, options = {}, revealCfg = {}) {
	const progress = Math.max(0, Math.min(1, alpha));
	uniforms.revealProgress.value = progress;
	uniforms.revealLinear.value = Math.max(0, Math.min(1, options.partLinear ?? options.linear ?? progress));
	uniforms.revealEnter.value = options.entering ? 1 : 0;
	uniforms.partSize.value = revealCfg.partSize ?? 0.035;
	uniforms.shiftRatio.value = revealCfg.shiftRatio ?? 0.42;
	uniforms.dropMin.value = revealCfg.dropMin ?? 0.18;
	uniforms.dropMax.value = revealCfg.dropMax ?? 0.42;
	uniforms.sweepSpread.value = revealCfg.sweepSpread ?? 0.55;
	uniforms.usePartReveal.value = revealCfg.enabled !== false ? 1 : 0;
}

export function applyHubPlateLabelBlurUniforms(uniforms, blur = 0, blurStep) {
	uniforms.blur.value = blur;
	if (blurStep) {
		uniforms.blurStep.value.copy(blurStep);
	}
}

export function applyHubPlateLabelGlitchUniforms(uniforms, progress = 0, time = 0, glitchCfg = {}) {
	uniforms.glitchProgress.value = Math.max(0, Math.min(1, progress));
	uniforms.glitchTime.value = time;
	uniforms.glitchIntensity.value = glitchCfg.intensity ?? 0.031;
	uniforms.glitchSliceCount.value = glitchCfg.sliceCount ?? 13;
	uniforms.glitchRgbShift.value = glitchCfg.rgbShift ?? 0;
	uniforms.glitchColor.value.set(glitchCfg.color ?? "#ffffff");
}
