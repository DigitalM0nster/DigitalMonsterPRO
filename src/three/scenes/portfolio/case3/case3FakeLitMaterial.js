import * as THREE from "three";

/** Направления fake key / fill — те же, что были у DirectionalLight в Case3Scene. */
const KEY_DIR = new THREE.Vector3(2.3, -0.5, 1.7).normalize();
const FILL_DIR = new THREE.Vector3(4.8, 5.6, -2.9).normalize();

/** Дефолты совпадают с Case3Scene → FogExp2(0x00050b, 0.074). */
function createCase3FogUniforms() {
	return {
		fogColor: { value: new THREE.Color(0x00050b) },
		fogDensity: { value: 0.074 },
		fogNear: { value: 1 },
		fogFar: { value: 2000 },
	};
}

/**
 * Пресеты fake-lit (только числа — подкрутка без правки шейдера).
 * @type {Record<'crane' | 'blocks', {
 *   baseColor: number,
 *   rimColor: number,
 *   rimStrength: number,
 *   rimPower: number,
 *   metalness: number,
 *   keyStrength: number,
 *   fillStrength: number,
 *   ambient: number,
 *   specularStrength: number,
 *   roughness?: number,
 *   surfaceVariation?: number,
 *   weathering?: number,
 *   brushing?: number,
 * }>} 
 */
export const CASE3_FAKE_LIT_PRESETS = {
	crane: {
		baseColor: 0x566267,
		rimColor: 0x55c6dc,
		rimStrength: 0.82,
		rimPower: 2.15,
		metalness: 0.72,
		keyStrength: 0.62,
		fillStrength: 0.32,
		ambient: 0.28,
		specularStrength: 0.5,
		roughness: 0.52,
		surfaceVariation: 0.16,
		weathering: 0.09,
		brushing: 0.12,
	},
	blocks: {
		baseColor: 0x0e1419,
		rimColor: 0x007a9e,
		rimStrength: 0.44,
		rimPower: 3.05,
		metalness: 0.42,
		keyStrength: 0.36,
		fillStrength: 0.2,
		ambient: 0.14,
		specularStrength: 0.14,
	},
};

const VERTEX_SHADER = /* glsl */ `
#include <common>
#include <fog_pars_vertex>

varying vec3 vNormal;
varying vec3 vViewDir;
varying vec3 vWorldPosition;

void main() {
	#include <beginnormal_vertex>
	#include <defaultnormal_vertex>
	#include <begin_vertex>

	vec4 worldPos = modelMatrix * vec4(transformed, 1.0);
	vNormal = normalize(normalMatrix * objectNormal);
	vViewDir = normalize(cameraPosition - worldPos.xyz);
	vWorldPosition = worldPos.xyz;

	#include <project_vertex>
	#include <fog_vertex>
}
`;

const FRAGMENT_SHADER = /* glsl */ `
#include <common>
#include <fog_pars_fragment>

uniform vec3 uBaseColor;
uniform vec3 uKeyDir;
uniform vec3 uFillDir;
uniform vec3 uRimColor;
uniform float uRimStrength;
uniform float uRimPower;
uniform float uMetalness;
uniform float uKeyStrength;
uniform float uFillStrength;
uniform float uAmbient;
uniform float uSpecularStrength;
uniform float uRoughness;
uniform float uSurfaceVariation;
uniform float uWeathering;
uniform float uBrushing;

varying vec3 vNormal;
varying vec3 vViewDir;
varying vec3 vWorldPosition;

vec3 safeNormalize(vec3 value) {
	return value * inversesqrt(max(dot(value, value), 0.00001));
}

float stableHash(vec3 value) {
	vec3 cell = floor(value);
	return fract(sin(dot(cell, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
}

void main() {
	vec3 n = safeNormalize(vNormal);
	vec3 v = safeNormalize(vViewDir);
	vec3 keyDir = safeNormalize(uKeyDir);
	vec3 fillDir = safeNormalize(uFillDir);
	float roughness = clamp(uRoughness, 0.0, 1.0);

	// Object-stable breakup: it follows the steel instead of swimming with the camera.
	float fineGrain = stableHash(vWorldPosition * 34.0) * 2.0 - 1.0;
	float broadGrain = stableHash(vWorldPosition * 4.5 + vec3(17.0, 7.0, 29.0));
	float brush = sin(vWorldPosition.y * 92.0 + vWorldPosition.x * 11.0) * 0.5 + 0.5;
	float surfaceFactor = 1.0
		+ fineGrain * uSurfaceVariation * 0.11
		+ (brush - 0.5) * uBrushing * 0.035;
	float wearMask = smoothstep(0.76, 0.96, broadGrain) * uWeathering;
	vec3 steelBase = uBaseColor * surfaceFactor;
	vec3 wornSteel = mix(steelBase, vec3(0.48, 0.52, 0.53), wearMask * 0.24);

	float key = max(dot(n, keyDir), 0.0);
	float fill = max(dot(n, fillDir), 0.0);
	// The ambient floor is intentionally preserved: no view angle may turn a face black.
	vec3 lit = wornSteel * (uAmbient + key * uKeyStrength + fill * uFillStrength);

	float fresnel = clamp(1.0 - clamp(dot(n, v), 0.0, 1.0), 0.0, 1.0);
	float rim = pow(fresnel, uRimPower) * uRimStrength * mix(1.0, 0.84, roughness);
	lit += uRimColor * rim;

	vec3 halfVector = keyDir + v;
	vec3 halfDir = halfVector * inversesqrt(max(dot(halfVector, halfVector), 0.00001));
	float specPower = mix(28.0, 112.0, uMetalness) * mix(1.0, 0.42, roughness);
	float specBreakup = clamp(
		1.0 + fineGrain * uSurfaceVariation * 0.45 + (brush - 0.5) * uBrushing * 0.22,
		0.62,
		1.32
	);
	float spec = pow(max(dot(n, halfDir), 0.0), max(8.0, specPower))
		* uSpecularStrength
		* uMetalness
		* mix(1.0, 0.48, roughness)
		* specBreakup;
	vec3 specColor = mix(vec3(1.0), wornSteel * 1.35, uMetalness * 0.38);
	lit += specColor * spec;

	gl_FragColor = vec4(lit, 1.0);
	#include <fog_fragment>
}
`;

/**
 * @param {'crane' | 'blocks'} presetName
 * @param {Partial<typeof CASE3_FAKE_LIT_PRESETS.crane>} [overrides]
 */
export function createCase3FakeLitMaterial(presetName, overrides = {}) {
	const preset = { ...CASE3_FAKE_LIT_PRESETS[presetName], ...overrides };
	const base = new THREE.Color(preset.baseColor);
	const rim = new THREE.Color(preset.rimColor);

	return new THREE.ShaderMaterial({
		uniforms: {
			...createCase3FogUniforms(),
			uBaseColor: { value: base },
			uKeyDir: { value: KEY_DIR.clone() },
			uFillDir: { value: FILL_DIR.clone() },
			uRimColor: { value: rim },
			uRimStrength: { value: preset.rimStrength },
			uRimPower: { value: preset.rimPower },
			uMetalness: { value: preset.metalness },
			uKeyStrength: { value: preset.keyStrength },
			uFillStrength: { value: preset.fillStrength },
			uAmbient: { value: preset.ambient },
			uSpecularStrength: { value: preset.specularStrength },
			uRoughness: { value: preset.roughness ?? 0 },
			uSurfaceVariation: { value: preset.surfaceVariation ?? 0 },
			uWeathering: { value: preset.weathering ?? 0 },
			uBrushing: { value: preset.brushing ?? 0 },
		},
		vertexShader: VERTEX_SHADER,
		fragmentShader: FRAGMENT_SHADER,
		fog: true,
		transparent: false,
		depthTest: true,
		depthWrite: true,
	});
}

/**
 * @param {THREE.ShaderMaterial} material
 * @param {'crane' | 'blocks'} presetName
 * @param {Partial<typeof CASE3_FAKE_LIT_PRESETS.crane>} [overrides]
 */
export function applyCase3FakeLitPreset(material, presetName, overrides = {}) {
	if (!material?.uniforms) return;
	const preset = { ...CASE3_FAKE_LIT_PRESETS[presetName], ...overrides };
	material.uniforms.uBaseColor.value.set(preset.baseColor);
	material.uniforms.uRimColor.value.set(preset.rimColor);
	material.uniforms.uRimStrength.value = preset.rimStrength;
	material.uniforms.uRimPower.value = preset.rimPower;
	material.uniforms.uMetalness.value = preset.metalness;
	material.uniforms.uKeyStrength.value = preset.keyStrength;
	material.uniforms.uFillStrength.value = preset.fillStrength;
	material.uniforms.uAmbient.value = preset.ambient;
	material.uniforms.uSpecularStrength.value = preset.specularStrength;
	material.uniforms.uRoughness.value = preset.roughness ?? 0;
	material.uniforms.uSurfaceVariation.value = preset.surfaceVariation ?? 0;
	material.uniforms.uWeathering.value = preset.weathering ?? 0;
	material.uniforms.uBrushing.value = preset.brushing ?? 0;
}
