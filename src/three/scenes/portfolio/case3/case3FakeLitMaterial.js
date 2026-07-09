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
 * }>}
 */
export const CASE3_FAKE_LIT_PRESETS = {
	crane: {
		baseColor: 0x465058,
		rimColor: 0x33e8ff,
		rimStrength: 1.38,
		rimPower: 2.05,
		metalness: 0.88,
		keyStrength: 0.58,
		fillStrength: 0.26,
		ambient: 0.2,
		specularStrength: 0.58,
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

void main() {
	#include <beginnormal_vertex>
	#include <defaultnormal_vertex>
	#include <begin_vertex>

	vec4 worldPos = modelMatrix * vec4(transformed, 1.0);
	vNormal = normalize(normalMatrix * objectNormal);
	vViewDir = normalize(cameraPosition - worldPos.xyz);

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

varying vec3 vNormal;
varying vec3 vViewDir;

void main() {
	vec3 n = normalize(vNormal);
	vec3 v = normalize(vViewDir);
	vec3 keyDir = normalize(uKeyDir);
	vec3 fillDir = normalize(uFillDir);

	float key = max(dot(n, keyDir), 0.0);
	float fill = max(dot(n, fillDir), 0.0);
	vec3 lit = uBaseColor * (uAmbient + key * uKeyStrength + fill * uFillStrength);

	float fresnel = 1.0 - max(dot(n, v), 0.0);
	float rim = pow(fresnel, uRimPower) * uRimStrength;
	lit += uRimColor * rim;

	vec3 halfDir = normalize(keyDir + v);
	float specPower = mix(28.0, 112.0, uMetalness);
	float spec = pow(max(dot(n, halfDir), 0.0), specPower) * uSpecularStrength * uMetalness;
	lit += vec3(spec);

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
}
