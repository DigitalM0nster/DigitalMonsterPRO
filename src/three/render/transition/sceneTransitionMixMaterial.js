import * as THREE from "three";

const vertexShader = /* glsl */ `
varying vec2 vUv;

void main() {
	vUv = uv;
	gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const fragmentShader = /* glsl */ `
uniform sampler2D textureA;
uniform sampler2D textureB;
uniform float progress;

varying vec2 vUv;

void main() {
	vec4 colorA = texture2D(textureA, vUv);
	vec4 colorB = texture2D(textureB, vUv);
	gl_FragColor = mix(colorA, colorB, progress);
}
`;

/** Fullscreen mix material для SceneTransitionPass. */
export function createSceneTransitionMixMaterial() {
	return new THREE.ShaderMaterial({
		uniforms: {
			textureA: { value: null },
			textureB: { value: null },
			progress: { value: 0 },
		},
		vertexShader,
		fragmentShader,
		depthTest: false,
		depthWrite: false,
		toneMapped: false,
	});
}
