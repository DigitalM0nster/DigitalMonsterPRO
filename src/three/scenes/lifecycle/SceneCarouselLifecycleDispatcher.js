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
		/** True while carousel progress was away from segment start (edge → dormant as next). */
		this._prevProgressAtRest = true;
		/**
		 * After current→next (backward leave): dormant on the next frame while still
		 * next at progress ≈ 0 (commit frame must not wipe the leave pose).
		 * @type {Set<string>}
		 */
		this._pendingDormantAsNext = new Set();
		/** A scene committed as current but may still be an intermediate queued-nav hop. */
		this._pendingEnterAsCurrent = new Set();
	}

	/** @param {import('@/three/render/transition/SceneCarousel.js').SceneCarousel} carousel */
	onCarouselFrame(carousel) {
		const progress = carousel.progress;
		const atRest = isCarouselProgressAtSegmentStart(progress);
		const progressBecameZero = atRest && !this._prevProgressAtRest;

		if (!atRest) {
			this._hadNonZeroProgress = true;
		}

		for (const sceneId of CAROUSEL_SCENE_IDS) {
			const role = getCarouselSceneRole(sceneId, carousel);
			const prevRole = this._ringRoles[sceneId] ?? "off";
			const pendingDormantAsNext = this._pendingDormantAsNext.has(sceneId) && prevRole === "next";

			const resetReason = getCarouselResetReason({
				role,
				prevRole,
				carouselProgress: progress,
				hadNonZeroProgress: this._hadNonZeroProgress,
				progressBecameZero,
				pendingDormantAsNext,
			});

			if (role === "next" && prevRole === "current" && atRest) {
				this._pendingDormantAsNext.add(sceneId);
			} else if (role !== "next") {
				this._pendingDormantAsNext.delete(sceneId);
			} else if (resetReason) {
				this._pendingDormantAsNext.delete(sceneId);
			}

			if (resetReason) {
				this._dispatchReset(sceneId, {
					reason: resetReason,
					role,
					prevRole,
					carouselProgress: progress,
				});
			}

			// Route/React confirmation is not the owner of visual enter. The ring
			// commit is: once a prepared next/previous scene becomes current, play
			// its single canonical enter. Keep it pending while a queued transition
			// still owns the carousel so an intermediate route never flashes.
			if (role === "current" && prevRole !== "current" && prevRole !== "off") {
				this._pendingEnterAsCurrent.add(sceneId);
			}
			if (
				role === "current"
				&& this._pendingEnterAsCurrent.has(sceneId)
				&& !carousel.isInteractionLocked()
			) {
				this._pendingEnterAsCurrent.delete(sceneId);
				this._dispatchEnter(sceneId);
			}

			this._ringRoles[sceneId] = role;
		}

		if (atRest) {
			this._hadNonZeroProgress = false;
		}
		this._prevProgressAtRest = atRest;
	}

	/**
	 * Старт hex: target в dormant, source готов к mix-out.
	 * @param {import('@/three/render/transition/SceneCarousel.js').SceneCarousel} carousel
	 * @param {{ sourceId: string, targetId: string }} payload
	 */
	onHexNavigationStart(carousel, { sourceId, targetId }) {
		// Target: dormant/start pose, then optional mix-target warm (e.g. hub plates
		// opacity 1 so hex wipe + first land do not cold-start InstancedMesh).
		// Source: leave pose only via prepareCarouselMixSource — never a full reset
		// (chained hex must keep the exact prior frame, including dormant hops).
		if (CAROUSEL_SCENE_IDS.includes(targetId)) {
			this._pendingEnterAsCurrent.add(targetId);
			this._dispatchReset(targetId, {
				reason: "hex-target-at-rest",
				sourceId,
				role: getCarouselSceneRole(targetId, carousel),
				prevRole: this._ringRoles[targetId] ?? "off",
				carouselProgress: 0,
			});
			this.getScene(targetId)?.prepareCarouselMixTarget?.();
		}

		if (CAROUSEL_SCENE_IDS.includes(sourceId)) {
			this.getScene(sourceId)?.prepareCarouselMixSource?.();
		}
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

	_dispatchEnter(sceneId) {
		this.getScene(sceneId)?.playEnterAnimation?.();
	}
}
