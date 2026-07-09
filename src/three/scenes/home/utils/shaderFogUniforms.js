import * as THREE from "three";

/** Обязательные fog-uniforms для ShaderMaterial с fog: true (иначе падает render). */
export function createFogUniforms() {
	return {
		fogColor: { value: new THREE.Color(0x020812) },
		fogNear: { value: 30 },
		fogFar: { value: 78 },
	};
}

export function withFogUniforms(uniforms) {
	return {
		...createFogUniforms(),
		...uniforms,
	};
}
