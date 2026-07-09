import * as THREE from "three";
import { VIEWPORT_MASK } from "./config.js";
import { grainBlurGlsl } from "@/three/shaders/grainBlurChunk.js";

const vertexShader = /* glsl */ `
varying vec2 vUv;

void main() {
	vUv = uv;
	gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/** Тот же rounded-rect, что в BorderBlurEffect — снаружи discard. */
const fragmentShader = /* glsl */ `
${grainBlurGlsl}

uniform sampler2D map;
uniform float centerWidth;
uniform float centerHeight;
uniform float borderRadius;
uniform float maskEnabled;
uniform float grainBlurEnabled;
uniform float grainBlurRadius;

varying vec2 vUv;

bool isInsideViewport(vec2 uv) {
	vec2 center = vec2(0.5);
	vec2 halfSize = vec2(centerWidth, centerHeight) * 0.5;
	vec2 minBounds = center - halfSize;
	vec2 maxBounds = center + halfSize;

	if (uv.x >= minBounds.x && uv.x <= maxBounds.x && uv.y >= minBounds.y && uv.y <= maxBounds.y) {
		return true;
	}

	vec2 nearest = clamp(uv, minBounds, maxBounds);
	return distance(uv, nearest) <= borderRadius;
}

void main() {
	if (maskEnabled > 0.5 && !isInsideViewport(vUv)) {
		discard;
	}

	vec2 sampleUv = vUv;
	if (grainBlurEnabled > 0.5) {
		sampleUv += grainBlurOffset(vUv, grainBlurRadius);
	}

	vec4 tex = texture2D(map, sampleUv);
	gl_FragColor = tex;
}
`;

/** Маска «окна»: модели не рисуются там, где фон размыт по краям. */
export function createViewportMaskBlitMaterial() {
	const { centerWidth, centerHeight, borderRadius } = VIEWPORT_MASK;

	return new THREE.ShaderMaterial({
		uniforms: {
			map: { value: null },
			centerWidth: { value: centerWidth },
			centerHeight: { value: centerHeight },
			borderRadius: { value: borderRadius },
			maskEnabled: { value: 1 },
			grainBlurEnabled: { value: 0 },
			grainBlurRadius: { value: 0 },
		},
		vertexShader,
		fragmentShader,
		transparent: true,
		depthTest: false,
		depthWrite: false,
		toneMapped: true,
	});
}

/** Grain blur на слое моделей (case1PostProcessConfig.grainBlur). */
export function applyGrainBlurToBlitMaterial(material, { enabled = false, radius = 0 } = {}) {
	if (!material?.uniforms) {
		return;
	}

	material.uniforms.grainBlurEnabled.value = enabled ? 1 : 0;
	material.uniforms.grainBlurRadius.value = radius;
}
