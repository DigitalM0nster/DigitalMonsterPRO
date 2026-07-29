import * as THREE from "three";

/**
 * Belka neon filament — Screen-style blend so nut colors don't muddy the cyan.
 *
 * Classic Additive (One+One) → olive + cyan = dirty.
 * Screen (One + OneMinusSrcColor) → keeps neon hue over dark surfaces.
 */
export function createBelkaTubeNeonMaterial({
	color = "#01dcf9",
	coreColor = "#e8fbff",
	intensity = 2.8,
} = {}) {
	return new THREE.ShaderMaterial({
		uniforms: {
			uColor: { value: new THREE.Color(color) },
			uCore: { value: new THREE.Color(coreColor) },
			uIntensity: { value: intensity },
			uTime: { value: 0 },
		},
		transparent: true,
		depthWrite: false,
		depthTest: true,
		toneMapped: false,
		blending: THREE.CustomBlending,
		blendEquation: THREE.AddEquation,
		blendSrc: THREE.OneFactor,
		blendDst: THREE.OneMinusSrcColorFactor,
		blendSrcAlpha: THREE.OneFactor,
		blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
		side: THREE.FrontSide,
		vertexShader: /* glsl */ `
			varying vec3 vN;
			varying vec3 vV;
			varying float vAlong;
			void main() {
				vec4 wp = modelMatrix * vec4(position, 1.0);
				vN = normalize(mat3(modelMatrix) * normal);
				vV = normalize(cameraPosition - wp.xyz);
				vAlong = atan(position.z, position.x);
				gl_Position = projectionMatrix * viewMatrix * wp;
			}
		`,
		fragmentShader: /* glsl */ `
			uniform vec3 uColor;
			uniform vec3 uCore;
			uniform float uIntensity;
			uniform float uTime;
			varying vec3 vN, vV;
			varying float vAlong;
			void main() {
				float fres = pow(1.0 - max(dot(normalize(vN), normalize(vV)), 0.0), 1.6);
				float pulse = 0.88 + 0.12 * sin(uTime * 2.4 + vAlong * 3.0);
				float travel = 0.75 + 0.25 * sin(vAlong * 6.0 - uTime * 3.2);
				vec3 col = mix(uColor, uCore, fres * 0.65) * uIntensity * pulse * travel;
				/** HDR push for bloom. */
				col += uCore * fres * 1.4;
				float a = (0.55 + fres * 0.45) * pulse;
				/** RGB as-is for Screen blend (One, OneMinusSrcColor). */
				gl_FragColor = vec4(col, a);
			}
		`,
	});
}

/**
 * @param {THREE.ShaderMaterial} mat
 * @param {{ color?: string, coreColor?: string, intensity?: number }} tune
 */
export function applyBelkaNeonTune(mat, tune = {}) {
	if (!mat?.uniforms) return;
	if (tune.color != null) mat.uniforms.uColor.value.set(tune.color);
	if (tune.coreColor != null) mat.uniforms.uCore.value.set(tune.coreColor);
	if (tune.intensity != null && Number.isFinite(tune.intensity)) {
		mat.uniforms.uIntensity.value = Math.max(0.05, tune.intensity);
	}
}
