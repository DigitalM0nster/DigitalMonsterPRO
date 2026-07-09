import * as THREE from "three";
import { finFragmentShader, finVertexShader } from "../shaders/digitalWhaleShaders.js";

/** Гребни над поверхностью — ощущение масштаба левиафана. */
export function createSurfaceFins() {
	const group = new THREE.Group();
	const fins = [];
	const disposables = [];

	const finDefs = [
		{ x: 12, z: -10, scale: 1.0, rotY: -0.25 },
		{ x: 17, z: -6, scale: 0.9, rotY: 0.1 },
		{ x: 9, z: -4, scale: 0.75, rotY: 0.35 },
	];

	for (const def of finDefs) {
		const geometry = new THREE.ConeGeometry(0.55, 2.8, 4, 1, true);
		geometry.rotateX(Math.PI);
		geometry.translate(0, 1.4, 0);

		const material = new THREE.ShaderMaterial({
			wireframe: true,
			transparent: true,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
			uniforms: {
				uTime: { value: 0 },
				uColor: { value: new THREE.Color("#00d4ff") },
			},
			vertexShader: finVertexShader,
			fragmentShader: finFragmentShader,
		});

		const mesh = new THREE.Mesh(geometry, material);
		mesh.position.set(def.x, 0.15, def.z);
		mesh.scale.setScalar(def.scale);
		mesh.rotation.y = def.rotY;

		group.add(mesh);
		fins.push(mesh);
		disposables.push(geometry, material);
	}

	return { group, fins, disposables };
}
