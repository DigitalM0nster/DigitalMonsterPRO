import { CAROUSEL_PROGRESS_COMMIT_EPS } from "@/three/render/transition/SceneCarousel.js";

/**
 * @typedef {'off' | 'previous' | 'current' | 'next'} CarouselSceneRole
 */

/**
 * @typedef {object} SceneLifecycleContext
 * @property {string} sceneId
 * @property {CarouselSceneRole} role
 * @property {CarouselSceneRole} prevRole
 * @property {number} carouselProgress
 * @property {number} sceneProgress
 * @property {string} reason
 */

/**
 * Контракт сцены карусели:
 * - resetCarouselState — подготовка к enter/scroll (dormant)
 * - playEnterAnimation — только если перед этим был reset (флаг _carouselEnterPending)
 * - applyScrollCamera — камера/позы при role current|next (sceneProgress)
 * - prepareCarouselMixSource — уходящая сцена в hex-mix (опционально)
 */

/** @param {number} progress */
export function isCarouselProgressAtRest(progress) {
	return progress <= CAROUSEL_PROGRESS_COMMIT_EPS;
}

/** Начало сегмента карусели (0) — единственная точка reset для role next. */
export function isCarouselProgressAtSegmentStart(progress) {
	return progress <= CAROUSEL_PROGRESS_COMMIT_EPS;
}

/**
 * Reset при:
 * - сцена стала previous
 * - сцена стала next при progress ≈ 0
 * - сцена уже next и progress снова ≈ 0 после скролла (не при progress ≈ 1)
 *
 * @param {{ role: CarouselSceneRole, prevRole: CarouselSceneRole, carouselProgress: number, hadNonZeroProgress: boolean }} params
 * @returns {string | null}
 */
export function getCarouselResetReason({ role, prevRole, carouselProgress, hadNonZeroProgress }) {
	if (role === "previous" && prevRole !== "previous") {
		return "became-previous";
	}

	if (role === "next" && isCarouselProgressAtSegmentStart(carouselProgress)) {
		if (prevRole !== "next") {
			return "became-next-at-rest";
		}

		// Уже next, progress снова ≈0 после скролла (не при progress≈1 после backward-commit).
		if (hadNonZeroProgress) {
			return "returned-to-rest-as-next";
		}
	}

	return null;
}
