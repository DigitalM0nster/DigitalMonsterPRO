import * as THREE from "three";
import { whalePointsFragmentShader, whalePointsVertexShader } from "../shaders/digitalWhaleShaders.js";
import { WHALE_BODY_LENGTH, whalePectoralFinPoint, whaleSurfacePoint } from "./whaleShape.js";
import { withFogUniforms } from "./shaderFogUniforms.js";

/**
 * Point cloud кита — точки на поверхности силуэта + плавники.
 */
export function createWhalePoints(count) {
	const positions = new Float32Array(count * 3);
	const sizes = new Float32Array(count);
	const intensities = new Float32Array(count);
	const headBiases = new Float32Array(count);

	let written = 0;
	const bodyPoints = Math.floor(count * 0.88);
	const finPoints = count - bodyPoints;

	for (let i = 0; i < bodyPoints; i++) {
		const x = (Math.random() - 0.5) * WHALE_BODY_LENGTH;
		const angle = Math.random() * Math.PI * 2;
		const surface = 0.9 + Math.random() * 0.1;
		const p = whaleSurfacePoint(x, angle, surface);

		const index = written * 3;
		positions[index] = p.x;
		positions[index + 1] = p.y;
		positions[index + 2] = p.z;

		sizes[written] = 0.45 + Math.random() * 0.65;
		intensities[written] = 0.25 + Math.random() * 0.75;
		headBiases[written] = p.t;
		written++;
	}

	for (let i = 0; i < finPoints; i++) {
		const side = Math.random() > 0.5 ? 1 : -1;
		const p = whalePectoralFinPoint(side, Math.random(), Math.random());

		const index = written * 3;
		positions[index] = p.x;
		positions[index + 1] = p.y;
		positions[index + 2] = p.z;

		sizes[written] = 0.4 + Math.random() * 0.55;
		intensities[written] = 0.4 + Math.random() * 0.6;
		headBiases[written] = 0.5;
		written++;
	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
	geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
	geometry.setAttribute("aIntensity", new THREE.BufferAttribute(intensities, 1));
	geometry.setAttribute("aHeadBias", new THREE.BufferAttribute(headBiases, 1));

	const material = new THREE.ShaderMaterial({
		fog: true,
		transparent: true,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
		uniforms: withFogUniforms({
			uTime: { value: 0 },
			uPointScale: { value: 1 },
			uColor: { value: new THREE.Color("#3dcfff") },
		}),
		vertexShader: whalePointsVertexShader,
		fragmentShader: whalePointsFragmentShader,
	});

	const points = new THREE.Points(geometry, material);

	return { points, geometry, material };
}
