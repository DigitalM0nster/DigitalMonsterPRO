import * as THREE from "three";
import { applySceneProgressToCamera } from "../../utils/applySceneProgressToCamera.js";

/**
 * Пустая сцена кейса — без модели, только фон карусели.
 * Используется для /portfolio/01 до новой орбитальной модели.
 */
export class EmptyPortfolioCaseScene {
	constructor() {
		this.threeScene = new THREE.Scene();
		this._mixPreview = false;
	}

	shouldRender() {
		return false;
	}

	shouldRenderOverlay() {
		return false;
	}

	shouldKeepUpdating() {
		return false;
	}

	requiresContinuousRender() {
		return false;
	}

	getScene() {
		return this.threeScene;
	}

	getModelsBloomLogoReveal() {
		return 0;
	}

	getModelsGrainBlurConfig() {
		return { enabled: false };
	}

	resetCarouselState() {}

	playEnterAnimation() {}

	applyCamera(camera, frame) {
		const sceneProgress = frame?.sceneProgress ?? 0;
		applySceneProgressToCamera(
			camera,
			{
				position: [0, 0, 9],
				lookAt: [0, 0, 0],
				fov: 50,
				scrollZ: 0,
			},
			sceneProgress,
		);
	}

	setRouteState() {}

	setMixPreviewActive(active) {
		this._mixPreview = active === true;
	}

	update() {}

	dispose() {}
}
