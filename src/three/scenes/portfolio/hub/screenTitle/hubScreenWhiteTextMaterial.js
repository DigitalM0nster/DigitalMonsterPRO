import * as THREE from "three";

const vertexShader = /* glsl */ `
varying vec2 vUv;

void main() {
	vUv = uv;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** Main-текст списка проектов: только opacity, без bloom. */
const fragmentShader = /* glsl */ `
uniform sampler2D map;
uniform float opacity;

varying vec2 vUv;

void main() {
	vec4 tex = texture2D(map, vUv);
	float finalAlpha = tex.a * opacity;

	if (finalAlpha <= 0.001) {
		discard;
	}

	// Ниже порога site bloom (threshold ≈ 1).
	vec3 rgb = tex.rgb * 0.85;
	gl_FragColor = vec4(rgb, finalAlpha);
}
`;

export function createHubScreenWhiteTextMaterial(texture) {
	return new THREE.ShaderMaterial({
		uniforms: {
			map: { value: texture },
			opacity: { value: 1 },
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

export function applyHubScreenWhiteTextOpacity(uniforms, alpha) {
	uniforms.opacity.value = Math.max(0, Math.min(1, alpha));
}

/** @deprecated Portfolio HUD — glow отключён. */
export function applyHubScreenWhiteTextGlow(uniforms, glow) {
	void uniforms;
	void glow;
}

/** @deprecated — bloom змейки в hubScreenSnakeTextMaterial.js */
export function applyHubScreenSnakeBloomUniform(material, snakeBloomBoost) {
	void material;
	void snakeBloomBoost;
}

/** @deprecated */
export function applyHubScreenReplacementBloomUniforms(material, profile) {
	void material;
	void profile;
}

/** @deprecated */
export function syncHubScreenWhiteTextGlowStep(material, texture) {
	void material;
	void texture;
}
