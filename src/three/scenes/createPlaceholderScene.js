import * as THREE from "three";

/**
 * Заглушка сцены: свет + одна фигура. Позже заменим на реальный контент кейса.
 */
export function createPlaceholderScene({ createGeometry, color, scale = 1, position = [0, 0, 0] }) {
	const scene = new THREE.Scene();

	const ambient = new THREE.AmbientLight(0xffffff, 0.45);
	const key = new THREE.DirectionalLight(0xffffff, 1.1);
	key.position.set(4, 6, 5);
	const fill = new THREE.DirectionalLight(0x88ccff, 0.35);
	fill.position.set(-3, 2, -4);

	scene.add(ambient, key, fill);

	const geometry = createGeometry();
	const material = new THREE.MeshStandardMaterial({
		color,
		metalness: 0.35,
		roughness: 0.45,
	});
	const mesh = new THREE.Mesh(geometry, material);
	mesh.scale.setScalar(scale);
	mesh.position.set(position[0], position[1], position[2]);
	scene.add(mesh);

	return { scene, mesh, geometry, material };
}
