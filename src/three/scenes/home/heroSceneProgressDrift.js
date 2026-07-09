import { getHeroCameraForSceneProgress, heroCamera } from "./heroCamera.js";

/**
 * Отладка sceneProgress на главной: только камера (X/Y/Z).
 * @param {number} sceneProgress
 */
export function getHeroSceneProgressDrift(sceneProgress) {
	const p = Number.isFinite(sceneProgress) ? sceneProgress : 0;
	const camera = getHeroCameraForSceneProgress(p);

	return {
		sceneProgress: p,
		cameraX: camera.x,
		cameraY: camera.y,
		cameraZ: camera.z,
		ranges: {
			cameraX: [heroCamera.xLeft, heroCamera.xRight],
			cameraY: [heroCamera.yBottom, heroCamera.yTop],
			cameraZ: [heroCamera.zForward, heroCamera.zBack],
		},
	};
}
