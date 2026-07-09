import * as THREE from "three";

/** Частицы над океаном и в глубине. */
export function createFloatingParticles(count) {
	const positions = new Float32Array(count * 3);

	for (let i = 0; i < count; i++) {
		const index = i * 3;
		positions[index] = (Math.random() - 0.5) * 70;
		positions[index + 1] = Math.random() * 5 - 3.5;
		positions[index + 2] = (Math.random() - 0.5) * 38;
	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

	const material = new THREE.PointsMaterial({
		color: "#00bfff",
		size: 2.4,
		sizeAttenuation: false,
		transparent: true,
		opacity: 0.4,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
	});

	const points = new THREE.Points(geometry, material);
	return { points, geometry, material };
}
