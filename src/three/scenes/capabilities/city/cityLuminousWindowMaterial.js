import * as THREE from "three";
import {
	addCityWindowLightPattern,
	CITY_WINDOW_LIGHT_ATTRIBUTE,
} from "./cityWindowLightPattern.js";

const CITY_WINDOW_MATERIAL_NAME = "WindowMaterial";
const CITY_WINDOW_FOG_STRENGTH = 0.25;
export const CITY_WINDOW_MATERIAL_DEFAULTS = Object.freeze({
	intensity: 1.55,
	fogColor: "#00050b",
	fogDensity: 0.03,
	fogNear: 0,
	fogPower: 1,
	fogOpacity: 1,
});

const VERTEX_SHADER = /* glsl */ `
attribute float ${CITY_WINDOW_LIGHT_ATTRIBUTE};

varying float vViewDepth;
varying float vWindowLight;

void main() {
	vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
	vViewDepth = -mvPosition.z;
	vWindowLight = ${CITY_WINDOW_LIGHT_ATTRIBUTE};
	gl_Position = projectionMatrix * mvPosition;
}
`;

const FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uFogNear;
uniform float uFogPower;
uniform float uFogOpacity;

varying float vViewDepth;
varying float vWindowLight;

void main() {
	vec3 luminousColor = uColor * uIntensity * vWindowLight;
	float fogDistance = max(0.0, vViewDepth - uFogNear);
	float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * fogDistance * fogDistance);
	fogFactor = pow(clamp(fogFactor, 0.0, 1.0), uFogPower)
		* uFogOpacity
		* ${CITY_WINDOW_FOG_STRENGTH.toFixed(2)};
	gl_FragColor = vec4(mix(luminousColor, uFogColor, clamp(fogFactor, 0.0, 1.0)), 1.0);
}
`;

export function createCityLuminousWindowMaterial() {
	return new THREE.ShaderMaterial({
		name: "CityLuminousWindowMaterial",
		uniforms: {
			uColor: { value: new THREE.Color(0xbdefff) },
			uIntensity: { value: CITY_WINDOW_MATERIAL_DEFAULTS.intensity },
			uFogColor: { value: new THREE.Color(CITY_WINDOW_MATERIAL_DEFAULTS.fogColor) },
			uFogDensity: { value: CITY_WINDOW_MATERIAL_DEFAULTS.fogDensity },
			uFogNear: { value: CITY_WINDOW_MATERIAL_DEFAULTS.fogNear },
			uFogPower: { value: CITY_WINDOW_MATERIAL_DEFAULTS.fogPower },
			uFogOpacity: { value: CITY_WINDOW_MATERIAL_DEFAULTS.fogOpacity },
		},
		vertexShader: VERTEX_SHADER,
		fragmentShader: FRAGMENT_SHADER,
		fog: false,
		transparent: false,
		depthTest: true,
		depthWrite: true,
		side: THREE.DoubleSide,
		toneMapped: false,
	});
}

/** Replace only the exact WindowMaterial exported by the city GLB. */
export function replaceCityWindowMaterial(root, material) {
	const replacedMaterials = new Set();
	let meshCount = 0;

	root?.traverse((object) => {
		if (!object.isMesh || !object.material) return;
		const sourceMaterials = Array.isArray(object.material)
			? object.material
			: [object.material];
		let replaced = false;
		const nextMaterials = sourceMaterials.map((sourceMaterial) => {
			if (sourceMaterial?.name !== CITY_WINDOW_MATERIAL_NAME) return sourceMaterial;
			replacedMaterials.add(sourceMaterial);
			replaced = true;
			return material;
		});
		if (!replaced) return;

		addCityWindowLightPattern(object);
		object.material = Array.isArray(object.material) ? nextMaterials : nextMaterials[0];
		meshCount += 1;
	});

	const stillUsedMaterials = new Set();
	root?.traverse((object) => {
		const materials = Array.isArray(object.material) ? object.material : [object.material];
		for (const candidate of materials) {
			if (candidate) stillUsedMaterials.add(candidate);
		}
	});
	for (const replacedMaterial of replacedMaterials) {
		if (!stillUsedMaterials.has(replacedMaterial)) replacedMaterial.dispose();
	}

	return meshCount;
}
