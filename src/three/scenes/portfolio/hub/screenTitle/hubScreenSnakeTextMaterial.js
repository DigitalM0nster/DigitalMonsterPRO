import * as THREE from "three";
import { getPortfolioHubGlitchConfig } from "@/three/scenes/portfolio/hub/portfolioHubGlitchConfig.js";

const vertexShader = /* glsl */ `
varying vec2 vUv;

void main() {
	vUv = uv;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * Glitch-змейка: canvas даёт форму (alpha), цвет и bloom — из uniform'ов.
 * Как hero: uSnakeColor * uSnakeBloomBoost → HDR для site bloom (threshold ≈ 1).
 */
const fragmentShader = /* glsl */ `
uniform sampler2D map;
uniform vec4 uvRect;
uniform float uSnakeBloomBoost;
uniform vec3 uSnakeColor;
uniform float opacity;
uniform float uLocaleTransitionActive;
uniform float uLocaleTransitionProgress;
uniform float uLocalePackedMap;
uniform sampler2D uLocaleOrderMap;

varying vec2 vUv;

float hash21(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}

float localeSnakeOrder(vec2 uv) {
	const float rowCount = 9.0;
	float row = floor(clamp(1.0 - uv.y, 0.0, 0.9999) * rowCount);
	float rowUv = mod(row, 2.0) < 1.0 ? uv.x : 1.0 - uv.x;
	return (row + rowUv) / rowCount;
}

float localeLetterOrder(vec2 uv) {
	float encoded = texture2D(uLocaleOrderMap, uv).r;
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

void main() {
	vec2 rectSize = max(uvRect.zw, vec2(0.00001));
	vec2 rectMin = uvRect.xy;
	vec2 rectMax = rectMin + rectSize;
	if (
		vUv.x < rectMin.x || vUv.x > rectMax.x ||
		vUv.y < rectMin.y || vUv.y > rectMax.y
	) {
		discard;
	}
	vec2 mapUv = (vUv - rectMin) / rectSize;
	float transitionEdge = 0.0;
	float transitionReveal = 1.0;
	if (uLocaleTransitionActive > 0.5) {
		float progress = clamp(uLocaleTransitionProgress, 0.0, 1.0);
		float order = localeSnakeOrder(mapUv);
		transitionReveal = smoothstep(order - 0.018, order + 0.018, progress);
		transitionEdge = 1.0 - smoothstep(0.0, 0.052, abs(progress - order));

		if (uLocalePackedMap > 0.5) {
			// The compact locale texture contains the clean target in its upper half
			// and all three half-resolution replacement frames in the lower half. The moving
			// snake is assembled entirely on the GPU, so no CanvasTexture is uploaded
			// while the animation is running.
			float letterOrder = localeLetterOrder(mapUv);
			float letterPhase = localeLetterPhase(progress, letterOrder);
			float replacementHead = smoothstep(0.02, 0.09, letterPhase) *
				(1.0 - smoothstep(0.86, 0.98, letterPhase));
			float targetReveal = smoothstep(0.86, 1.0, letterPhase);
			float replacementFrame = localeReplacementFrame(letterPhase);
			vec2 replacementUv = packedReplacementUv(mapUv, replacementFrame);
			vec2 targetUv = vec2(mapUv.x, 0.5 + mapUv.y * 0.5);
			vec4 replacement = texture2D(map, replacementUv);
			vec4 target = texture2D(map, targetUv);
			float replacementAlpha = replacement.a * replacementHead;
			float targetAlpha = target.a * targetReveal;
			float combinedAlpha = max(replacementAlpha, targetAlpha);
			if (combinedAlpha <= 0.001) {
				discard;
			}
			// Packed locale glyphs keep the site's cyan hue intact. Multiplying
			// shifted alpha samples per RGB channel produced an accidental green
			// fringe and made a complete glyph look like several broken pieces.
			vec3 glitchRgb = uSnakeColor * min(uSnakeBloomBoost, 5.5);
			vec3 combinedRgb = mix(
				glitchRgb,
				target.rgb,
				clamp(targetAlpha / max(combinedAlpha, 0.0001), 0.0, 1.0)
			);
			gl_FragColor = vec4(combinedRgb, combinedAlpha * opacity);
			return;
		}

		float row = floor(clamp(1.0 - mapUv.y, 0.0, 0.9999) * 9.0);
		float stepId = floor(progress * 72.0);
		float jitter = (hash21(vec2(row, stepId)) - 0.5) * 0.018;
		mapUv.x = clamp(mapUv.x + jitter * transitionEdge, 0.0, 1.0);
	}
	vec4 tex = texture2D(map, mapUv);

	tex.a *= transitionReveal;
	if (tex.a <= 0.001) {
		discard;
	}

	vec3 rgb = uLocaleTransitionActive > 0.5
		? mix(tex.rgb, uSnakeColor * uSnakeBloomBoost, transitionEdge * 0.72)
		: uSnakeColor * uSnakeBloomBoost;
	gl_FragColor = vec4(rgb, tex.a * opacity);
}
`;

const HUD_SNAKE_PROFILE = () => getPortfolioHubGlitchConfig();

function createSnakeUniforms(profile = HUD_SNAKE_PROFILE()) {
	return {
		uSnakeBloomBoost: { value: profile.snakeBloomBoost ?? 3.2 },
		uSnakeColor: { value: new THREE.Color(profile.snakeLetterColor ?? "#00ccff") },
		opacity: { value: 1 },
	};
}

export function createHubScreenSnakeTextMaterial(texture, options = {}) {
	return new THREE.ShaderMaterial({
		uniforms: {
			map: { value: texture },
			uvRect: { value: options.uvRect?.clone?.() ?? new THREE.Vector4(0, 0, 1, 1) },
			uLocaleTransitionActive: { value: 0 },
			uLocaleTransitionProgress: { value: 0 },
			uLocalePackedMap: { value: options.localePackedMap ? 1 : 0 },
			uLocaleOrderMap: { value: options.localeOrderMap ?? texture },
			...createSnakeUniforms(),
		},
		vertexShader,
		fragmentShader,
		transparent: true,
		depthTest: false,
		depthWrite: false,
		toneMapped: false,
		side: THREE.DoubleSide,
	});
}

export function applyHubScreenSnakeLocaleTransition(material, progress = 0, active = false) {
	const uniforms = material?.uniforms;
	if (!uniforms?.uLocaleTransitionProgress || !uniforms?.uLocaleTransitionActive) {
		return;
	}

	uniforms.uLocaleTransitionProgress.value = Math.max(0, Math.min(1, progress));
	uniforms.uLocaleTransitionActive.value = active ? 1 : 0;
}

/** Цвет + HDR-множитель bloom (dev-панель и конфиг). */
export function applyHubScreenSnakeUniforms(material, cfg = HUD_SNAKE_PROFILE()) {
	const uniforms = material?.uniforms;
	if (!uniforms?.uSnakeBloomBoost) {
		return;
	}

	uniforms.uSnakeBloomBoost.value = cfg.snakeBloomBoost ?? 3.2;
	if (uniforms.uSnakeColor) {
		uniforms.uSnakeColor.value.set(cfg.snakeLetterColor ?? "#00ccff");
	}
}

export function applyHubScreenSnakeOpacity(material, opacity = 1) {
	const uniforms = material?.uniforms;
	if (!uniforms?.opacity) {
		return;
	}

	uniforms.opacity.value = Math.max(0, Math.min(1, opacity));
}

export function applyHubScreenSnakeBloomUniform(material, snakeBloomBoost) {
	applyHubScreenSnakeUniforms(material, {
		...getPortfolioHubGlitchConfig(),
		snakeBloomBoost,
	});
}

export function syncHubScreenSnakeTexture(material, texture) {
	if (material?.uniforms?.map) {
		material.uniforms.map.value = texture;
	}
}
