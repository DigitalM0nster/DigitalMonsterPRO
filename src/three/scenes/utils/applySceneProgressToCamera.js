/**
 * Camera from sceneProgress (−1…1) relative to a base pose.
 *
 * Canonical scroll parallax (see SCROLL_PARALLAX.md):
 * - sceneProgress → +1 (scroll down / leave forward): camera moves **down** → content rises
 * - sceneProgress → −1 (scroll up / leave backward): camera moves **up** → content falls
 *
 * `scrollY` / `scrollZ` are magnitudes (≥ 0). Exceptions may pass 0 or opt out of lookAt follow.
 *
 * @param {import("three").PerspectiveCamera} camera
 * @param {{
 *   position: number[],
 *   lookAt: number[],
 *   fov?: number,
 *   scrollZ?: number,
 *   scrollY?: number,
 *   lookAtFollowY?: boolean,
 * }} base
 * @param {number} sceneProgress
 */
export function applySceneProgressToCamera(camera, base, sceneProgress) {
	const scrollZ = base.scrollZ ?? 4;
	const scrollY = base.scrollY ?? 0;
	const p = Number.isFinite(sceneProgress) ? sceneProgress : 0;
	const y = base.position[1] - p * scrollY;
	const z = base.position[2] - p * scrollZ;

	camera.position.set(base.position[0], y, z);

	const lookAtFollowY = base.lookAtFollowY !== false;
	const lookY = lookAtFollowY ? base.lookAt[1] - p * scrollY : base.lookAt[1];
	camera.lookAt(base.lookAt[0], lookY, base.lookAt[2]);

	if (base.fov != null) {
		camera.fov = base.fov;
		camera.updateProjectionMatrix();
	}
}
