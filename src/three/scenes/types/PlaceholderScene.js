import * as THREE from "three";
import { createPlaceholderScene } from "../createPlaceholderScene.js";
import { applySceneProgressToCamera } from "../utils/applySceneProgressToCamera.js";
import { computeRouteSceneVisibility } from "../utils/routeSceneVisibility.js";
import { carouselClickTransitionConfig } from "@/three/render/transition/carouselClickTransitionConfig.js";

const CAMERA_BASE = {
	position: [0, 0, 9],
	lookAt: [0, 0, 0],
	fov: 40,
	scrollZ: 3,
};

/** Стартовая дистанция enter: камера дальше, модель уже видна. */
const ENTER_CAMERA_START_Z = 16;
const ENTER_CAMERA_END_Z = CAMERA_BASE.position[2];

function pathForPlaceholderId(id) {
	if (typeof id === "string" && id.startsWith("case")) {
		return `/portfolio/${id.slice(4)}`;
	}
	if (id === "about") {
		return "/about";
	}
	if (id === "contacts") {
		return "/contacts";
	}
	return null;
}

function easeOutCubic(t) {
	const x = Math.max(0, Math.min(1, t));
	return 1 - Math.pow(1 - x, 3);
}

/** Временная сцена с одной фигурой — до переноса реального контента. */
export class PlaceholderScene {
	constructor(def) {
		this.def = def;
		const entry = createPlaceholderScene(def);
		this.threeScene = entry.scene;
		this.mesh = entry.mesh;
		this.geometry = entry.geometry;
		this.material = entry.material;
		this._mixPreview = false;
		this._matchPage = (pathname) => {
			const path = pathForPlaceholderId(def.id);
			if (!path) {
				return false;
			}
			const normalized = String(pathname ?? "/").replace(/\/+$/, "") || "/";
			return normalized === path || (path !== "/" && normalized.startsWith(`${path}/`));
		};
		/** 0 = далеко (enter start), 1 = дефолтная поза. */
		this._enterCameraT = 1;
		this._enterCameraAnimating = false;
		this._enterCameraPending = false;
	}

	shouldRender() {
		return true;
	}

	getScene() {
		return this.threeScene;
	}

	getModelsBloomLogoReveal() {
		return 0;
	}

	/** Reset — dormant поза + готовность к enter-dolly. */
	resetCarouselState() {
		this.mesh.rotation.set(0, 0, 0);
		this._enterCameraT = 0;
		this._enterCameraAnimating = false;
		this._enterCameraPending = true;
	}

	/** Enter: модель уже на экране, камера подъезжает издалека. */
	playEnterAnimation() {
		if (!this._enterCameraPending) {
			return;
		}
		this._enterCameraPending = false;
		this._enterCameraT = 0;
		this._enterCameraAnimating = true;
	}

	applyCamera(camera, frame) {
		this.applyScrollCamera(camera, frame);
	}

	/** Анимация скролла — камера по sceneProgress + enter-dolly. */
	applyScrollCamera(camera, frame) {
		const sceneProgress = frame?.sceneProgress ?? 0;
		const enterT = easeOutCubic(this._enterCameraT);
		const z = THREE.MathUtils.lerp(ENTER_CAMERA_START_Z, ENTER_CAMERA_END_Z, enterT);
		applySceneProgressToCamera(
			camera,
			{
				...CAMERA_BASE,
				position: [CAMERA_BASE.position[0], CAMERA_BASE.position[1], z],
			},
			sceneProgress,
		);
	}

	setRouteState({ currentPage, teleportPage, routePhase }) {
		const { show, shouldWake } = computeRouteSceneVisibility({
			currentPage,
			teleportPage,
			routePhase,
			matchPage: this._matchPage,
		});

		if (!show) {
			this._enterCameraAnimating = false;
			this._enterCameraPending = false;
			this._enterCameraT = 1;
			return;
		}

		if (shouldWake && this._enterCameraPending) {
			this.playEnterAnimation();
		}
	}

	setMixPreviewActive(active) {
		this._mixPreview = active === true;
		if (!this._mixPreview) {
			return;
		}

		// Модель уже в hex-кадре; enter = камера издалека → дефолт (как у MMK-1: сразу видна, потом появление).
		this._enterCameraT = 0;
		this._enterCameraPending = true;
		this.playEnterAnimation();
	}

	shouldKeepUpdating() {
		return this._enterCameraAnimating || this._mixPreview;
	}

	update(delta) {
		const { x, y } = this.def.spinSpeed ?? { x: 0.4, y: 0.6 };
		this.mesh.rotation.x += delta * x;
		this.mesh.rotation.y += delta * y;

		if (!this._enterCameraAnimating) {
			return;
		}

		const duration = Math.max(1e-4, carouselClickTransitionConfig.enterDurationS);
		this._enterCameraT = Math.min(1, this._enterCameraT + delta / duration);
		if (this._enterCameraT >= 1) {
			this._enterCameraT = 1;
			this._enterCameraAnimating = false;
		}
	}

	dispose() {
		this.geometry?.dispose();
		this.material?.dispose();
	}
}
