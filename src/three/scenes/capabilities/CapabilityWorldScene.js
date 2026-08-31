import * as THREE from "three";
import { InfiniteLightTrailsWorld } from "./lightTrails/InfiniteLightTrailsWorld.js";
import { SyntheticCoreWorld } from "./placeholders/SyntheticCoreWorld.js";
import { CityModelWorld } from "./city/CityModelWorld.js";
import {
	createCaseStudyPanelHud,
	disposeCaseStudyPanelHud,
	syncCaseStudyPanelHud,
} from "@/three/scenes/portfolio/caseStudyText/caseStudyPanelHudHost.js";
import { getSceneCarousel } from "@/three/render/transition/carouselPage.js";
import { isRingDormantReason } from "@/three/scenes/lifecycle/sceneLifecycle.js";

function createWorld(capability, scene, renderer) {
	switch (capability.sceneVariant) {
		case "lightTrails":
			return new InfiniteLightTrailsWorld(scene, renderer.domElement);
		case "spatialMatrix":
			return new CityModelWorld(scene, renderer);
		case "syntheticCore":
		default:
			return new SyntheticCoreWorld(scene);
	}
}

/**
 * Route-level Three scene for a non-MMK capability.
 * Each route owns its scene, camera, lifecycle and panel HUD; only the renderer
 * and transition compositor remain site-wide owners.
 */
export class CapabilityWorldScene {
	constructor(renderer, store, capability) {
		this.renderer = renderer;
		this.store = store;
		this.capability = capability;
		this.sceneId = capability.sceneId;
		this.threeScene = new THREE.Scene();
		this.threeScene.fog = new THREE.FogExp2(0x00050b, 0.074);
		this.cameraParallax = new THREE.Vector2();
		this.pointerDown = false;
		this.pointerBlocked = true;
		this.world = createWorld(capability, this.threeScene, renderer);
		this.root = this.world.group;
		this.panelHud = createCaseStudyPanelHud(this.threeScene);
		this.readyPromise = this.world.readyPromise ?? Promise.resolve(true);
	}

	getScene() {
		return this.threeScene;
	}

	getModelsBloomLogoReveal() {
		return 1;
	}

	getModelsGrainBlurConfig() {
		return { enabled: false };
	}

	setRouteState() {}

	resetCarouselState(ctx = {}) {
		if (!isRingDormantReason(ctx.reason)) {
			return;
		}
		this.world.setInteractionEnabled?.(false);
		this.panelHud?.setVisible(false);
		this.world.setRenderEnabled?.(false);
	}

	prepareCarouselMixTarget() {
		this._enableWorld();
	}

	prepareCarouselMixSource() {
		this._enableWorld();
	}

	playEnterAnimation() {
		this._enableWorld();
	}

	setPointerState({ pointerDown, pointerBlocked = false }) {
		this.pointerDown = pointerBlocked ? false : Boolean(pointerDown);
		this.pointerBlocked = Boolean(pointerBlocked);
	}

	isDragOrbitEnabled() {
		return this.capability.sceneVariant !== "lightTrails";
	}

	getDragOrbitTarget() {
		return this.world.getOrbitTarget?.() ?? null;
	}

	applyCamera(camera) {
		if (this.capability.sceneVariant === "lightTrails") {
			this.world.applyCamera(camera, 1);
			return;
		}
		this.world.applyCamera(camera, this.cameraParallax);
	}

	_enableWorld() {
		if (this.capability.sceneVariant === "lightTrails") {
			this.world.setRenderEnabled(true, { preserveMotion: true });
			this.world.setReveal(1);
			return;
		}
		this.world.setRenderEnabled(true);
	}

	update(delta, frame) {
		this._enableWorld();
		const interactionOwned = frame?.interactionEnabled !== false && !frame?.pointerBlocked;
		const pointer = interactionOwned ? frame?.pointer ?? { x: 0, y: 0 } : { x: 0, y: 0 };
		this.cameraParallax.x = THREE.MathUtils.damp(
			this.cameraParallax.x,
			THREE.MathUtils.clamp(Number(pointer.x) || 0, -1, 1),
			4.2,
			delta,
		);
		this.cameraParallax.y = THREE.MathUtils.damp(
			this.cameraParallax.y,
			THREE.MathUtils.clamp(Number(pointer.y) || 0, -1, 1),
			4.2,
			delta,
		);

		let hovered = false;
		if (this.capability.sceneVariant === "lightTrails") {
			this.world.setInteractionEnabled(interactionOwned);
			this.world.update(delta, frame, 1);
		} else {
			hovered = this.world.update(delta, true, frame, interactionOwned) ?? false;
		}

		const routeActive = getSceneCarousel().currentId === this.sceneId;
		syncCaseStudyPanelHud(this.panelHud, { active: routeActive });
		if (interactionOwned && this.store?.cursor) {
			this.store.cursor.caseHovered = Boolean(hovered);
		}
	}

	beginWarmupDraw() {
		const token = { visible: this.root?.visible === true };
		this._enableWorld();
		this.world.beginWarmupDraw?.();
		return token;
	}

	endWarmupDraw(token) {
		this.world.endWarmupDraw?.();
		if (!token?.visible) {
			this.world.setRenderEnabled?.(false);
		}
	}

	shouldRender() {
		return true;
	}

	shouldRenderOverlay() {
		return false;
	}

	shouldKeepUpdating() {
		return false;
	}

	getCityWindowMaterialSettings() {
		return this.world.getWindowMaterialSettings?.() ?? null;
	}

	setCityWindowMaterialSettings(settings = {}) {
		return this.world.setWindowMaterialSettings?.(settings) ?? null;
	}

	resetCityWindowMaterialSettings() {
		return this.world.resetWindowMaterialSettings?.() ?? null;
	}

	dispose() {
		disposeCaseStudyPanelHud(this.panelHud);
		this.panelHud = null;
		this.world?.dispose?.(this.threeScene);
		this.world = null;
		this.root = null;
		this.threeScene = null;
	}
}
