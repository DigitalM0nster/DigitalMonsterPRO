import * as THREE from "three";
import { createPlaceholderScene } from "../createPlaceholderScene.js";
import { applySceneProgressToCamera } from "../utils/applySceneProgressToCamera.js";
import { computeRouteSceneVisibility } from "../utils/routeSceneVisibility.js";
import { carouselClickTransitionConfig } from "@/three/render/transition/carouselClickTransitionConfig.js";
import {
	createCaseStudyPanelHud,
	disposeCaseStudyPanelHud,
	hideCaseStudyPanelHud,
	syncCaseStudyPanelHud,
} from "@/three/scenes/portfolio/caseStudyText/caseStudyPanelHudHost.js";
import { createCaseSceneLifecycle } from "@/three/scenes/portfolio/caseLifecycle/caseSceneLifecycle.js";

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
	constructor(def, store = null) {
		this.def = def;
		this.store = store;
		const entry = createPlaceholderScene(def);
		this.threeScene = entry.scene;
		this.mesh = entry.mesh;
		this.root = this.mesh;
		this.geometry = entry.geometry;
		this.material = entry.material;
		this.loaded = true;
		this._mixPreview = false;
		this.showCase = false;
		this.activePage = false;
		this.exitHideComplete = false;
		this._allowExitOverlay = true;
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

		/** Left panel HUD — same WebGL path as Nipigas when caseStudy.renderTextInScene. */
		this.panelHud = createCaseStudyPanelHud(this.threeScene);

		/** Portfolio cases share enter/exit; carousel pages (contacts) keep the light path. */
		this._isPortfolioCase = typeof def.id === "string" && def.id.startsWith("case");
		this.lifecycle = null;

		if (this._isPortfolioCase) {
			this.lifecycle = createCaseSceneLifecycle(this, {
				sceneId: def.id,
				matchPage: this._matchPage,
				getRoot: () => this.mesh,
				getStore: () => this.store,
				getPanelHud: () => this.panelHud,
				isLoaded: () => true,
				hideScale: 0.001,
				resetScrollOnEnter: false,
				hooks: {
					onEnterShow: () => {
						this._enterCameraT = 0;
						this._enterCameraAnimating = true;
						this.lifecycle.setActivePage(true);
						this.mesh.scale.setScalar(1);
					},
					onMixPreviewShow: () => {
						this._enterCameraT = 0;
						this._enterCameraAnimating = true;
						this.mesh.scale.setScalar(1);
					},
					onExitHold: () => {
						this.mesh.scale.setScalar(1);
					},
					onHide: () => {
						this._enterCameraAnimating = false;
						this._enterCameraT = 1;
					},
					onReset: () => {
						this.mesh.rotation.set(0, 0, 0);
						this._enterCameraT = 0;
						this._enterCameraAnimating = false;
					},
				},
			});
			this.lifecycle.hideRoot();
		}
	}

	shouldRender() {
		if (this.lifecycle) {
			return this.lifecycle.shouldRender();
		}
		return true;
	}

	getScene() {
		return this.threeScene;
	}

	getModelsBloomLogoReveal() {
		return 0;
	}

	resetCarouselState() {
		if (this.lifecycle) {
			this.lifecycle.resetCarouselState();
			return;
		}
		this.mesh.rotation.set(0, 0, 0);
		this._enterCameraT = 0;
		this._enterCameraAnimating = false;
		this.showCase = false;
		hideCaseStudyPanelHud(this.panelHud);
	}

	playEnterAnimation() {
		if (this.lifecycle) {
			this.lifecycle.playEnterAnimation();
			return;
		}
		this._enterCameraT = 0;
		this._enterCameraAnimating = true;
		this.panelHud?.setVisible(true);
	}

	applyCamera(camera, frame) {
		this.applyScrollCamera(camera, frame);
	}

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

	setRouteState(routeState) {
		if (this.lifecycle) {
			this.lifecycle.setRouteState(routeState);
			return;
		}

		const { currentPage, teleportPage, routePhase } = routeState;
		const { show, shouldWake } = computeRouteSceneVisibility({
			currentPage,
			teleportPage,
			routePhase,
			matchPage: this._matchPage,
		});

		this.showCase = show;

		if (!show) {
			this._enterCameraAnimating = false;
			this._enterCameraT = 1;
			hideCaseStudyPanelHud(this.panelHud);
			return;
		}

		this.panelHud?.setVisible(true);
		if (shouldWake) {
			this.playEnterAnimation();
		}
	}

	setMixPreviewActive(active) {
		if (this.lifecycle) {
			this.lifecycle.setMixPreviewActive(active);
			return;
		}

		this._mixPreview = active === true;
		if (!this._mixPreview) {
			return;
		}

		this._enterCameraT = 0;
		this.panelHud?.setVisible(true);
		this.playEnterAnimation();
	}

	shouldRenderOverlay() {
		if (this.lifecycle) {
			return this.lifecycle.shouldRenderOverlay();
		}
		return false;
	}

	shouldKeepUpdating() {
		if (this.lifecycle) {
			return this.lifecycle.shouldKeepUpdating() || this._enterCameraAnimating;
		}
		return this._enterCameraAnimating || this._mixPreview || this.showCase;
	}

	update(delta, frame) {
		syncCaseStudyPanelHud(this.panelHud, {
			showCase: this.showCase,
			mixPreview: this._mixPreview,
			store: this.store,
		});

		if (this.lifecycle) {
			const phase = this.lifecycle.updateExit(frame);
			if (phase === "hidden") {
				return;
			}
		}

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
		disposeCaseStudyPanelHud(this.panelHud);
		this.panelHud = null;
		this.geometry?.dispose();
		this.material?.dispose();
	}
}
