import * as THREE from "three";
import { sceneOwnsHexHitAtClientY } from "@/three/render/overlay/hexHitOwnership.js";
import { InfiniteLightTrailsWorld } from "./lightTrails/InfiniteLightTrailsWorld.js";
import { SyntheticCoreWorld } from "./placeholders/SyntheticCoreWorld.js";
import { warmSyntheticCoreGeometry } from "./placeholders/warmSyntheticCoreGeometry.js";
import { SyntheticCoreSound } from "./placeholders/SyntheticCoreSound.js";
import { CityModelWorld } from "./city/CityModelWorld.js";
import { CapabilityNarrative } from "./typography/CapabilityNarrative.js";
import { CapabilitySceneSound } from "@/sounds/CapabilitySceneSound.js";
import { getLoaderCurtainRemainingMs } from "@/app/config/loaderCurtain.js";
import { isRingDormantReason } from "@/three/scenes/lifecycle/sceneLifecycle.js";
import { PortfolioFreeCameraController } from "@/three/scenes/portfolio/hub/PortfolioFreeCameraController.js";

function createWorld(capability, scene, renderer) {
	switch (capability.sceneVariant) {
		case "lightTrails":
			return new InfiniteLightTrailsWorld(scene, renderer.domElement);
		case "spatialMatrix":
			return new CityModelWorld(scene, renderer);
		case "syntheticCore":
		default:
			return new SyntheticCoreWorld(scene, renderer, new SyntheticCoreSound());
	}
}

/**
 * Route-level Three scene for a non-MMK capability.
 * Each route owns its scene, camera and lifecycle; only the renderer
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
		this.world.bindInput?.(renderer.domElement, event => this.store?.appStarted === true
			&& this.root.visible && !event.target?.closest?.('[data-canvas-pointer-blocker="true"], button, a, [role="button"]')
			&& sceneOwnsHexHitAtClientY(this.sceneId, event.clientY));
		this._disposed = false;
		this.narrative = null;
		this.sceneSound = new CapabilitySceneSound();
		this.readyPromise = this._prepareNarrative();
		this._freeCamera = import.meta.env.DEV && capability.sceneVariant === "spatialMatrix"
			? new PortfolioFreeCameraController(renderer.domElement, { snapshotName: "cityCamera", logLabel: "cityCamera" })
			: null;
		if (this._freeCamera) this._freeCamera.moveSpeed = 0.65;
	}

	getScene() {
		return this.threeScene;
	}

	async prepareResourcesUnderCurtain(renderer, scheduler) {
		if (this.capability.sceneVariant !== "syntheticCore" || this._geometryWarmed || this._disposed) return;
		await warmSyntheticCoreGeometry(renderer, this.threeScene, scheduler);
		this._geometryWarmed = true;
	}

	async _prepareNarrative() {
		await Promise.all([this.world.readyPromise, this.sceneSound.prepare()]);
		const variant = this.capability.sceneVariant;
		if (this._disposed || (variant !== "lightTrails" && variant !== "syntheticCore")) return true;
		this.narrative = await CapabilityNarrative.create(this.root, this.renderer, variant, () => this._disposed);
		if (this.narrative && variant === "syntheticCore") this.world.hud.setNarrative(this.narrative);
		return true;
	}

	getModelsBloomLogoReveal() {
		return 1;
	}

	getModelsGrainBlurConfig() {
		return { enabled: false };
	}

	setRouteState(routeState = {}) {
		if (routeState.currentPage && routeState.currentPage !== this.capability.path) this.world.sound?.stop();
		if (routeState.currentPage && routeState.currentPage !== "/capabilities/spatial-matrix")
			this._freeCamera?.setEnabled(false);
	}

	resetCarouselState(ctx = {}) {
		if (!isRingDormantReason(ctx.reason)) {
			return;
		}
		this.world.setInteractionEnabled?.(false);
		this.narrative?.reset();
		this.sceneSound.stop();
		this._freeCamera?.setEnabled(false);
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
		// Reuse the site's bounded 25-degree drag and smooth return to overview.
		return this.capability.sceneVariant === "syntheticCore"
			|| (this.capability.sceneVariant === "spatialMatrix" && !this._freeCamera?.enabled);
	}

	getDragOrbitTarget() {
		return this.world.getOrbitTarget?.() ?? null;
	}

	isVerticalDragOrbitEnabled() {
		return this.isDragOrbitEnabled();
	}

	getVerticalDragOrbitLimit() {
		// A small city tilt keeps the ground and distant districts in view.
		return this.capability.sceneVariant === "spatialMatrix" ? Math.PI / 18 : undefined;
	}

	applyCamera(camera) {
		if (this._freeCamera?.apply(camera)) return;
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
		if (this._freeCamera?.enabled && frame?.camera) {
			// Hovering the dev panel blocks scene picking, not keyboard flight.
			// Route leave and carousel dormancy own disabling the controller.
			this._freeCamera.update(delta, frame.camera);
		}
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
			hovered = this.world.update(delta, true, frame, interactionOwned, this.store?.siteLocale) ?? false;
		}
		this.narrative?.update(delta, frame, this.store?.siteLocale);
		const current = frame?.activeSceneId === this.sceneId;
		const visibility = current ? 1 - Math.min(1, Math.abs(this.store?.hexShaderProgress ?? 0)) : 0;
		const soundEnabled = current && this.store?.appStarted === true;
		const interactionSoundEnabled = this.store?.appStarted === true
			&& getLoaderCurtainRemainingMs(this.store.appStartedAt) === 0
			&& interactionOwned && Boolean(frame?.camera) && this.root.visible;
		// Read the just-painted lens/HUD state; dormant and warmup worlds stay silent.
		this.world.sound?.update(delta, this.world.assemblyUniform.value, this.world.elapsed, {
			enabled: soundEnabled, visibility, hud: this.world.hud, pointer: interactionOwned ? frame?.pointer : null,
			interactionEnabled: interactionSoundEnabled,
			interactionVisibility: interactionSoundEnabled ? 1 : 0,
		});
		const title = this.narrative ?? this.world.title;
		this.sceneSound.update(delta, {
			enabled: soundEnabled,
			hudEnabled: interactionSoundEnabled,
			hudVisibility: 1,
			reveal: title?.getSoundReveal() ?? 0,
			hudReveal: this.world.hud?.uniforms?.uSnake?.value ?? 0,
			pan: this.capability.sceneVariant === "lightTrails" ? (this.narrative?.frame.side ?? 1) * 0.5 : -0.35,
			flightWorld: this.capability.sceneVariant === "lightTrails" ? this.world : null,
			visibility,
		});

		if (interactionOwned && this.store?.cursor) {
			this.store.cursor.caseHovered = Boolean(hovered);
		}
	}

	beginWarmupDraw() {
		const token = { visible: this.root?.visible === true };
		this._enableWorld();
		this.world.beginWarmupDraw?.();
		this.narrative?.beginWarmupDraw();
		return token;
	}

	endWarmupDraw(token) {
		this.world.endWarmupDraw?.();
		this.narrative?.endWarmupDraw();
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

	getCityTrafficSettings() {
		return this.world.getTrafficSettings?.() ?? null;
	}

	isFreeCameraEnabled() { return this._freeCamera?.enabled === true; }

	setFreeCameraEnabled(enabled, camera) {
		if (!this._freeCamera || (enabled && window.location.pathname !== "/capabilities/spatial-matrix")) return false;
		this._freeCamera.setEnabled(enabled, camera);
		return this._freeCamera.enabled;
	}

	resetFreeCamera(camera) {
		if (!camera) return;
		this.world.applyCamera(camera, { x: 0, y: 0 });
		this._freeCamera?.syncFromCamera(camera);
	}

	getFreeCameraSnapshot(camera) { return this._freeCamera?.getSnapshot(camera) ?? null; }
	copyFreeCameraSnapshot(camera) { return this._freeCamera?.copySnapshot(camera) ?? Promise.resolve(false); }

	setCityTrafficSettings(settings = {}) {
		return this.world.setTrafficSettings?.(settings) ?? null;
	}

	resetCityTrafficSettings() {
		return this.world.resetTrafficSettings?.() ?? null;
	}

	dispose() {
		this._disposed = true;
		this.sceneSound.dispose();
		this.world?.hud?.setNarrative?.(null);
		this.narrative?.dispose();
		this.narrative = null;
		this._freeCamera?.dispose();
		this._freeCamera = null;
		this.world?.dispose?.(this.threeScene);
		this.world = null;
		this.root = null;
		this.threeScene = null;
	}
}
