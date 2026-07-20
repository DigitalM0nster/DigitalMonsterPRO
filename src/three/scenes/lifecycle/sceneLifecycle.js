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
 * Контракт сцены карусели (все страницы кольца: home / portfolioHub / about / contacts):
 * - ring dormant — **только** next-reasons ниже (+ hex-target)
 * - страница, с которой ушли, остаётся live как `previous` (не wipe из роута)
 * - `became-previous` — не dormant; опциональный leave-pose (About → конец сюжета)
 * - playEnterAnimation — только после ring-dormant reset (`_carouselEnterPending`)
 * - applyScrollCamera — камера/позы при role current|next
 */

/** Reasons that put a carousel scene into start/dormant pose. */
export const RING_DORMANT_REASONS = new Set(["became-next-at-rest", "returned-to-rest-as-next", "next-at-rest-after-leave", "hex-target-at-rest"]);

/** @param {string | undefined | null} reason */
export function isRingDormantReason(reason) {
	return Boolean(reason && RING_DORMANT_REASONS.has(reason));
}

/** @param {string | undefined | null} reason */
export function isLeavePoseReason(reason) {
	return reason === "became-previous";
}

/** @param {number} progress */
export function isCarouselProgressAtRest(progress) {
	return progress <= CAROUSEL_PROGRESS_COMMIT_EPS;
}

/** Начало сегмента карусели (0) — единственная точка reset для role next. */
export function isCarouselProgressAtSegmentStart(progress) {
	return progress <= CAROUSEL_PROGRESS_COMMIT_EPS;
}

/**
 * Ring dormant is **next-only**:
 * - сцена стала next при progress ≈ 0, но не из current
 *   (current→next = кадр backward-commit: не трогаем; dormant — следующим шагом)
 * - сцена уже next и progress стал / снова 0 (peek/cancel или отложенный leave)
 *
 * `became-previous` is NOT ring-dormant. It is only a leave-pose hook for scenes
 * that need it (About → end story). Home/hub must ignore it — the page you just
 * left stays live as `previous` for reverse.
 *
 * @param {{
 *   role: CarouselSceneRole,
 *   prevRole: CarouselSceneRole,
 *   carouselProgress: number,
 *   hadNonZeroProgress: boolean,
 *   progressBecameZero?: boolean,
 *   pendingDormantAsNext?: boolean,
 * }} params
 * @returns {string | null}
 */
export function getCarouselResetReason({ role, prevRole, carouselProgress, hadNonZeroProgress, progressBecameZero = false, pendingDormantAsNext = false }) {
	if (role === "previous" && prevRole !== "previous") {
		return "became-previous";
	}

	if (role === "next" && isCarouselProgressAtSegmentStart(carouselProgress)) {
		if (prevRole !== "next") {
			// Backward commit frame: old current → next. Keep live this frame;
			// dispatcher sets pendingDormantAsNext for the following rest-as-next.
			if (prevRole === "current") {
				return null;
			}
			return "became-next-at-rest";
		}

		// Already next at progress ≈ 0 after non-zero scroll, settle edge, or deferred leave.
		if (hadNonZeroProgress || progressBecameZero || pendingDormantAsNext) {
			return "returned-to-rest-as-next";
		}
	}

	return null;
}
