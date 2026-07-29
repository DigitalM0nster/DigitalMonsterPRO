import * as THREE from "three";
import { applySceneProgressToCamera } from "../utils/applySceneProgressToCamera.js";
import { computeRouteSceneVisibility } from "../utils/routeSceneVisibility.js";
import { isRingDormantReason } from "@/three/scenes/lifecycle/sceneLifecycle.js";
import { store } from "@/store.jsx";
import {
	CONTACTS_PATH,
	contactsCameraTune,
	contactsHologramTune,
} from "./contactsSceneConfig.js";
import { createContactsHologram } from "./createContactsHologram.js";

function isContactsPath(pathname) {
	return (String(pathname ?? "/").replace(/\/+$/, "") || "/") === CONTACTS_PATH;
}

/**
 * Contacts page: particle flower hologram on the right.
 * Built under the preloader curtain; after Start only transforms / uTime animate.
 * DEV applyTune updates pose + uniforms; rebuildShape is explicit (never per-frame).
 */
export class ContactsScene {
	constructor(appStore = null) {
		this.store = appStore ?? store;
		this.threeScene = new THREE.Scene();
		this.threeScene.background = null;

		this.root = new THREE.Group();
		this.root.name = "ContactsRoot";
		this.offsetRoot = new THREE.Group();
		this.offsetRoot.name = "ContactsOffset";
		this.tiltRoot = new THREE.Group();
		this.tiltRoot.name = "ContactsTilt";
		this.spinRoot = new THREE.Group();
		this.spinRoot.name = "ContactsSpin";
		this.tiltRoot.add(this.spinRoot);
		this.offsetRoot.add(this.tiltRoot);
		this.root.add(this.offsetRoot);
		this.threeScene.add(this.root);

		const cfg = contactsHologramTune;
		this._tiltX = cfg.tiltX;
		this._tiltZ = cfg.tiltZ;
		this._rockAmpX = cfg.rockAmpX;
		this._rockAmpZ = cfg.rockAmpZ;
		this._rockSpeedX = cfg.rockSpeedX;
		this._rockSpeedZ = cfg.rockSpeedZ;
		this._spinZ = cfg.spinZ;
		this.offsetRoot.position.set(cfg.offsetX, cfg.offsetY, cfg.offsetZ);
		this.offsetRoot.scale.setScalar(cfg.scale);

		this._elapsed = 0;
		this._disposed = false;
		this._mixPreview = false;
		this.showCase = false;
		this._carouselEnterPending = false;
		this._hologram = null;

		this.loaded = false;
		this.readyPromise = this._prepare();
	}

	async _prepare() {
		this._hologram = createContactsHologram(contactsHologramTune);
		if (this._disposed) {
			this._hologram.dispose();
			this._hologram = null;
			return false;
		}

		this.spinRoot.add(this._hologram.root);
		this.applyTune(contactsHologramTune, { rebuildShape: false });
		this._applyTiltPose(0);
		this.loaded = true;
		return true;
	}

	/**
	 * Live pose + look. Shape rebuild only when `rebuildShape: true` (DEV button).
	 * @param {typeof contactsHologramTune} [tune]
	 * @param {{ rebuildShape?: boolean }} [opts]
	 */
	applyTune(tune = contactsHologramTune, opts = {}) {
		this._tiltX = tune.tiltX;
		this._tiltZ = tune.tiltZ;
		this._rockAmpX = tune.rockAmpX;
		this._rockAmpZ = tune.rockAmpZ;
		this._rockSpeedX = tune.rockSpeedX;
		this._rockSpeedZ = tune.rockSpeedZ;
		this._spinZ = tune.spinZ;
		this.offsetRoot.position.set(tune.offsetX, tune.offsetY, tune.offsetZ);
		this.offsetRoot.scale.setScalar(tune.scale);
		this._applyTiltPose(this._elapsed);

		if (!this._hologram) {
			return;
		}
		if (opts.rebuildShape) {
			this._hologram.rebuildShape(tune);
		} else {
			this._hologram.applyLook(tune);
		}
	}

	_applyTiltPose(elapsed) {
		const t = elapsed ?? 0;
		this.tiltRoot.rotation.x =
			this._tiltX + Math.sin(t * this._rockSpeedX) * this._rockAmpX;
		this.tiltRoot.rotation.z =
			this._tiltZ + Math.sin(t * this._rockSpeedZ + 1.15) * this._rockAmpZ;
		this.tiltRoot.rotation.y = 0;
	}

	getScene() {
		return this.threeScene;
	}

	shouldRender() {
		return true;
	}

	getModelsBloomLogoReveal() {
		return 1;
	}

	resetCarouselState(ctx = {}) {
		if (!isRingDormantReason(ctx.reason)) {
			return;
		}
		this.spinRoot.rotation.z = 0;
		this._applyTiltPose(this._elapsed);
		this._carouselEnterPending = true;
	}

	playEnterAnimation() {
		if (!this._carouselEnterPending) {
			return;
		}
		this._carouselEnterPending = false;
	}

	applyCamera(camera, frame) {
		applySceneProgressToCamera(camera, contactsCameraTune, frame?.sceneProgress ?? 0);
	}

	setRouteState(routeState) {
		const { currentPage, teleportPage, routePhase } = routeState;
		const { show, shouldWake } = computeRouteSceneVisibility({
			currentPage,
			teleportPage,
			routePhase,
			matchPage: isContactsPath,
		});

		this.showCase = show;
		if (!show) {
			return;
		}
		if (shouldWake) {
			this.playEnterAnimation();
		}
	}

	setMixPreviewActive(active) {
		this._mixPreview = active === true;
		if (this._mixPreview) {
			this.playEnterAnimation();
		}
	}

	shouldRenderOverlay() {
		return false;
	}

	shouldKeepUpdating() {
		return this._mixPreview || this.showCase;
	}

	setPointerState() {
		/* Form / channels live in HTML — no WebGL hits. */
	}

	update(delta) {
		if (this._disposed || !this._hologram) {
			return;
		}

		this._elapsed += delta;
		this._applyTiltPose(this._elapsed);
		if (this._spinZ) {
			this.spinRoot.rotation.z += delta * this._spinZ;
		}
		this._hologram.update(this._elapsed);
	}

	dispose() {
		this._disposed = true;
		this._hologram?.dispose();
		this._hologram = null;
	}
}
