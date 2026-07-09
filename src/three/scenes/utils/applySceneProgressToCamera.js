/**
 * Сдвиг камеры по sceneProgress (−1…1) от базовой позы сцены.
 * @param {import("three").PerspectiveCamera} camera
 * @param {{ position: number[], lookAt: number[], fov?: number, scrollZ?: number, scrollY?: number }} base
 * @param {number} sceneProgress
 */
export function applySceneProgressToCamera(camera, base, sceneProgress) {
	const scrollZ = base.scrollZ ?? 4;
	const scrollY = base.scrollY ?? 0;
	const p = Number.isFinite(sceneProgress) ? sceneProgress : 0;

	camera.position.set(base.position[0], base.position[1] + p * scrollY, base.position[2] - p * scrollZ);
	camera.lookAt(base.lookAt[0], base.lookAt[1], base.lookAt[2]);

	if (base.fov != null) {
		camera.fov = base.fov;
		camera.updateProjectionMatrix();
	}
}
