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

#ifdef CRANE_GRATING
varying vec3 vGratingPosition;
varying vec3 vGratingNormal;
varying vec3 vGratingViewDir;
varying mat3 vGratingBasis;
#endif

void main() {
	#include <beginnormal_vertex>
	#include <defaultnormal_vertex>
	#include <begin_vertex>

	vec4 worldPos = modelMatrix * vec4(transformed, 1.0);
	vNormal = normalize(normalMatrix * objectNormal);
	vViewDir = normalize(cameraPosition - worldPos.xyz);
	vWorldPosition = worldPos.xyz;
	#ifdef CRANE_GRATING
	vGratingPosition = position;
	vGratingNormal = normal;
	vGratingBasis = mat3(
		normalize(modelMatrix[0].xyz),
		normalize(modelMatrix[1].xyz),
		normalize(modelMatrix[2].xyz)
	);
	vec3 toCamera = cameraPosition - worldPos.xyz;
	vGratingViewDir = vec3(
		dot(toCamera, vGratingBasis[0]),
		dot(toCamera, vGratingBasis[1]),
		dot(toCamera, vGratingBasis[2])
	);
	#endif

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

#ifdef CRANE_GRATING
varying vec3 vGratingPosition;
varying vec3 vGratingNormal;
varying vec3 vGratingViewDir;
varying mat3 vGratingBasis;
#endif

vec3 safeNormalize(vec3 value) {
	return value * inversesqrt(max(dot(value, value), 0.00001));
}

float stableHash(vec3 value) {
	vec3 cell = floor(value);
	return fract(sin(dot(cell, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
}

#ifdef CRANE_GRATING
float gratingIntegral(float position, float width) {
	return floor(position) * width + min(fract(position), width);
}

// Integrate each periodic strip over the pixel footprint. Subpixel holes retain
// their open area instead of switching to an opaque sheet or a noisy alpha test.
float gratingCoverage(float position, float width, float footprint) {
	width = min(width, 1.0);
	position += width * 0.5;
	return clamp((
		gratingIntegral(position + footprint * 0.5, width)
		- gratingIntegral(position - footprint * 0.5, width)
	) / footprint, 0.0, 1.0);
}
#endif

void main() {
	float gratingShade = 1.0;
	float gratingAlpha = 1.0;
	vec3 n = safeNormalize(vNormal);
	#ifdef CRANE_GRATING
	// A fine bearing-bar grid with an analytically intersected slab behind its top.
	// The first cell-wall hit provides parallax, inner faces and depth shading in O(1).
	// No extra meshes, textures, ray-march loop or per-frame resource work is needed.
	n = safeNormalize(vGratingBasis * vGratingNormal);
	if (abs(vGratingNormal.y) > 0.7) {
		const float pitch = 0.028;
		const float halfBar = 0.003 / (2.0 * pitch);
		const float thickness = 0.005;
		vec2 cell = vGratingPosition.xz / pitch;
		vec2 centered = fract(cell + 0.5) - 0.5;
		vec2 edge = abs(centered);
		vec2 footprint = max(fwidth(cell), vec2(0.0001));
		vec2 bars = 1.0 - smoothstep(vec2(halfBar) - footprint * 0.5, vec2(halfBar) + footprint * 0.5, edge);
		float metal = max(bars.x, bars.y);
		float resolution = max(footprint.x, footprint.y);
		float detail = 1.0 - smoothstep(0.45, 1.25, resolution);
		vec2 ray = -vGratingViewDir.xz / max(abs(vGratingViewDir.y), 0.0001) / pitch;
		vec2 projectedDepth = ray * thickness;
		vec2 coveredWidth = vec2(halfBar * 2.0) + abs(projectedDepth);
		vec2 covered = vec2(
			gratingCoverage(cell.x + projectedDepth.x * 0.5, coveredWidth.x, footprint.x),
			gratingCoverage(cell.y + projectedDepth.y * 0.5, coveredWidth.y, footprint.y)
		);
		gratingAlpha = 1.0 - (1.0 - covered.x) * (1.0 - covered.y);
		if (gratingAlpha < 0.002) discard;
		vec2 holePosition = fract(cell);
		vec2 wall = mix(vec2(halfBar), vec2(1.0 - halfBar), step(vec2(0.0), ray));
		vec2 hitDepth = abs(wall - holePosition) / max(abs(ray), vec2(0.00001));
		float depth = min(hitDepth.x, hitDepth.y);
		float wallHit = 1.0 - smoothstep(thickness * 0.96, thickness, depth);
		float facing = vGratingViewDir.y >= 0.0 ? 1.0 : -1.0;
		vec3 surfaceNormal = vec3(0.0, facing, 0.0);
		float surfaceShade = 1.0;
		if (metal < 0.5 && wallHit > 0.0) {
			surfaceNormal = hitDepth.x < hitDepth.y
				? vec3(-sign(ray.x), 0.0, 0.0)
				: vec3(0.0, 0.0, -sign(ray.y));
			surfaceShade = mix(0.68, 0.32, clamp(depth / thickness, 0.0, 1.0));
		} else {
			// Small bevels catch light on the edges of each raised metal strip.
			vec2 bevel = smoothstep(vec2(halfBar * 0.36), vec2(halfBar), edge);
			if (edge.x < edge.y) surfaceNormal.x = sign(centered.x) * bevel.x * 0.65;
			else surfaceNormal.z = sign(centered.y) * bevel.y * 0.65;
			surfaceShade = mix(0.90, 1.12, bars.x);
		}
		n = safeNormalize(mix(n, vGratingBasis * surfaceNormal, detail));
		vec2 top = vec2(
			gratingCoverage(cell.x, halfBar * 2.0, footprint.x),
			gratingCoverage(cell.y, halfBar * 2.0, footprint.y)
		);
		float topCoverage = 1.0 - (1.0 - top.x) * (1.0 - top.y);
		float distantSteel = mix(0.40, 0.95, clamp(topCoverage / max(gratingAlpha, 0.001), 0.0, 1.0));
		gratingShade = mix(distantSteel, surfaceShade, detail);
	}
	#endif
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

	gl_FragColor = vec4(lit * gratingShade, gratingAlpha);
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

/** Prepared with the crane; perforations need no bitmap texture or runtime rebuild. */
export function createCraneGratingMaterial() {
	const material = createCase3FakeLitMaterial("crane", {
		baseColor: 0x839298,
		rimColor: 0x9dc6d4,
		rimStrength: 0.06,
		metalness: 0.95,
		keyStrength: 0.78,
		fillStrength: 0.4,
		ambient: 0.48,
		specularStrength: 0.45,
		roughness: 0.5,
		surfaceVariation: 0.12,
		weathering: 0.025,
		brushing: 0.18,
	});
	material.name = "galvanized-walkway-grating";
	material.defines.CRANE_GRATING = 1;
	material.side = THREE.DoubleSide;
	material.transparent = true;
	material.depthWrite = false;
	return material;
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
