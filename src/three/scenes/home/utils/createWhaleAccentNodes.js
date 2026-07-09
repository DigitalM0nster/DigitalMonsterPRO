import * as THREE from "three";
import { WHALE_ACCENT_NODES, getWhaleOffset } from "./whaleShape.js";
import { whaleAccentFragmentShader, whaleAccentVertexShader } from "../shaders/digitalWhaleShaders.js";
import { withFogUniforms } from "./shaderFogUniforms.js";

/** Яркие «звёздные» узлы на ключевых точках кита. */
export function createWhaleAccentNodes() {
	const count = WHALE_ACCENT_NODES.length;
	const positions = new Float32Array(count * 3);
	const sizes = new Float32Array(count);
	const pulses = new Float32Array(count);

	for (let i = 0; i < count; i++) {
		const node = WHALE_ACCENT_NODES[i];
		const off = getWhaleOffset();
		positions[i * 3] = node.x + off.x;
		positions[i * 3 + 1] = node.y + off.y;
		positions[i * 3 + 2] = node.z + off.z;
		sizes[i] = node.size;
		pulses[i] = Math.random();
	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
	geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
	geometry.setAttribute("aPulse", new THREE.BufferAttribute(pulses, 1));

	const material = new THREE.ShaderMaterial({
		fog: true,
		transparent: true,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
		uniforms: withFogUniforms({
			uTime: { value: 0 },
			uAccentScale: { value: 1 },
			uColor: { value: new THREE.Color("#7df4ff") },
		}),
		vertexShader: whaleAccentVertexShader,
		fragmentShader: whaleAccentFragmentShader,
	});

	const points = new THREE.Points(geometry, material);
	points.renderOrder = 4;

	return { points, geometry, material };
}
