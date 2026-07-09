import { easeInOutCubic, clamp01 } from "./hubMenuAnimation.js";

/**
 * Интерполяция offset/rotation сетки плит (градусы).
 * @param {number} progress 0…1 (linear time; easing внутри)
 */
export function lerpGridTransform(progress, fromOffset, fromRotation, toOffset, toRotation) {
	const t = easeInOutCubic(clamp01(progress));

	return {
		offset: [
			fromOffset[0] + (toOffset[0] - fromOffset[0]) * t,
			fromOffset[1] + (toOffset[1] - fromOffset[1]) * t,
			fromOffset[2] + (toOffset[2] - fromOffset[2]) * t,
		],
		rotation: [
			fromRotation[0] + (toRotation[0] - fromRotation[0]) * t,
			fromRotation[1] + (toRotation[1] - fromRotation[1]) * t,
			fromRotation[2] + (toRotation[2] - fromRotation[2]) * t,
		],
	};
}
