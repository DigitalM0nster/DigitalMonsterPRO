/** Локальный прогресс камеры сцены (−1…1). */
export const SCENE_PROGRESS_MIN = -1;
export const SCENE_PROGRESS_MAX = 1;

/** @typedef {'off' | 'previous' | 'current' | 'next'} CarouselSceneRole */

export function clampSceneProgress(value) {
	return Math.max(SCENE_PROGRESS_MIN, Math.min(SCENE_PROGRESS_MAX, value));
}

/**
 * @param {string} sceneId
 * @param {{ previousId: string, currentId: string, nextId: string }} carousel
 * @returns {CarouselSceneRole}
 */
export function getCarouselSceneRole(sceneId, carousel) {
	if (sceneId === carousel.currentId) {
		return "current";
	}
	if (sceneId === carousel.nextId) {
		return "next";
	}
	if (sceneId === carousel.previousId) {
		return "previous";
	}
	return "off";
}

/**
 * sceneProgressTarget от глобального progressTarget и роли слота.
 * @param {CarouselSceneRole} role
 * @param {number} progressTarget
 */
export function sceneProgressTargetForRole(role, progressTarget) {
	switch (role) {
		case "current":
			return clampSceneProgress(progressTarget);
		case "next":
			return clampSceneProgress(progressTarget - 1);
		case "previous":
			return clampSceneProgress(progressTarget + 1);
		default:
			return 0;
	}
}

/**
 * Мгновенный sceneProgress при смене роли (только previous).
 * next — без snap: меняется только sceneProgressTarget, progress догоняет плавно.
 * @param {CarouselSceneRole} role
 * @param {CarouselSceneRole} prevRole
 * @returns {number | null}
 */
export function sceneProgressSnapForRoleChange(role, prevRole) {
	if (role === "previous" && prevRole !== "previous") {
		return SCENE_PROGRESS_MAX;
	}
	return null;
}

/**
 * sceneProgressTarget при backward-коммите: current → next, progress уже = 1 → target 0.
 * @param {CarouselSceneRole} role
 * @param {CarouselSceneRole} prevRole
 * @param {number} progress
 * @param {number} progressTarget
 */
export function sceneProgressTargetForRoleChange(role, prevRole, progress, progressTarget) {
	if (role === "next" && prevRole === "current") {
		return clampSceneProgress(progress - 1);
	}
	return sceneProgressTargetForRole(role, progressTarget);
}
