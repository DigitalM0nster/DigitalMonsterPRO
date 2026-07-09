import { getCarouselSceneRole } from "@/three/render/transition/sceneCarouselSceneProgress.js";
import { CAROUSEL_SCENE_IDS } from "@/three/render/transition/SceneCarousel.js";
import { getCarouselResetReason, isCarouselProgressAtSegmentStart } from "./sceneLifecycle.js";

/**
 * Диспетчер reset/enter по ролям кольца карусели (не virtual hex-ролям).
 */
export class SceneCarouselLifecycleDispatcher {
	/**
	 * @param {(sceneId: string) => { resetCarouselState?: Function, playEnterAnimation?: Function } | undefined} getScene
	 */
	constructor(getScene) {
		this.getScene = getScene;
		/** @type {Record<string, import('./sceneLifecycle.js').CarouselSceneRole>} */
		this._ringRoles = {};
		this._hadNonZeroProgress = false;
	}

	/** @param {import('@/three/render/transition/SceneCarousel.js').SceneCarousel} carousel */
	onCarouselFrame(carousel) {
		const progress = carousel.progress;

		if (!isCarouselProgressAtSegmentStart(progress)) {
			this._hadNonZeroProgress = true;
		}

		for (const sceneId of CAROUSEL_SCENE_IDS) {
			const role = getCarouselSceneRole(sceneId, carousel);
			const prevRole = this._ringRoles[sceneId] ?? "off";
			const resetReason = getCarouselResetReason({
				role,
				prevRole,
				carouselProgress: progress,
				hadNonZeroProgress: this._hadNonZeroProgress,
			});

			if (resetReason) {
				this._dispatchReset(sceneId, {
					reason: resetReason,
					role,
					prevRole,
					carouselProgress: progress,
				});
			}

			this._ringRoles[sceneId] = role;
		}

		if (isCarouselProgressAtSegmentStart(progress)) {
			this._hadNonZeroProgress = false;
		}
	}

	/**
	 * Старт hex: target в dormant, source готов к mix-out.
	 * @param {import('@/three/render/transition/SceneCarousel.js').SceneCarousel} carousel
	 * @param {{ sourceId: string, targetId: string }} payload
	 */
	onHexNavigationStart(carousel, { targetId }) {
		// Put a hidden target into its normal dormant/start pose. The source is not
		// reset: it must stay frozen without a leave animation. Once the completed
		// route is confirmed, the target's regular route lifecycle plays its enter.
		if (CAROUSEL_SCENE_IDS.includes(targetId)) {
			this._dispatchReset(targetId, {
				reason: "hex-target-at-rest",
				role: getCarouselSceneRole(targetId, carousel),
				prevRole: this._ringRoles[targetId] ?? "off",
				carouselProgress: 0,
			});
		}

		// Never prepare/mutate the source here. A chained transition must start
		// from the exact frame left by the preceding hex, including a dormant
		// intermediate scene that must not suddenly reveal its content.
	}

	/**
	 * @param {string} sceneId
	 * @param {Omit<import('./sceneLifecycle.js').SceneLifecycleContext, 'sceneId' | 'sceneProgress'>} ctx
	 */
	_dispatchReset(sceneId, ctx) {
		const scene = this.getScene(sceneId);
		scene?.resetCarouselState?.({
			sceneId,
			sceneProgress: 0,
			...ctx,
		});
	}
}
