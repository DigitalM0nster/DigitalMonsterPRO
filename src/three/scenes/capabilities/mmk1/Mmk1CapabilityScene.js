import * as THREE from "three";
import { Case3Scene } from "@/three/scenes/portfolio/case3/Case3Scene.js";
import { PortfolioFreeCameraController } from "@/three/scenes/portfolio/hub/PortfolioFreeCameraController.js";
import { setMmk1ReturnToOverviewHandler } from "@/pages/capabilities/mmk1SceneBridge.js";
import { Mmk1CameraHotspots } from "./Mmk1CameraHotspots.js";
import { MMK1_CAMERA_HOTSPOT_MOTION } from "./mmk1CameraHotspotsConfig.js";
import { isRingDormantReason } from "@/three/scenes/lifecycle/sceneLifecycle.js";
import { CapabilitySceneSound } from "@/sounds/CapabilitySceneSound.js";
import { getLoaderCurtainRemainingMs } from "@/app/config/loaderCurtain.js";

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const easeInOutCubic = (value) => {
	const t = clamp01(value);
	return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
};

const CRANE_MATERIAL_TRANSITION_DURATION = 0.46;
const CRANE_MATERIAL_NUMERIC_LIMITS = {
	rimStrength: [0, 4],
	rimPower: [0.25, 8],
	metalness: [0, 1],
	keyStrength: [0, 3],
	fillStrength: [0, 3],
	ambient: [0, 3],
	specularStrength: [0, 4],
	roughness: [0, 1],
	surfaceVariation: [0, 1],
	weathering: [0, 1],
	brushing: [0, 1],
};
const OVERVIEW_CRANE_MATERIAL = {
	baseColor: 0x8a8a8a,
	rimColor: 0x00aaff,
	rimStrength: 1.05,
	rimPower: 2.15,
	metalness: 1,
	keyStrength: 0.62,
	fillStrength: 0.32,
	ambient: 0.2,
	specularStrength: 1,
	roughness: 0.52,
	surfaceVariation: 1,
	weathering: 1,
	brushing: 1,
};
const CLOSE_CRANE_MATERIAL = {
	baseColor: 0x767d8f,
	rimColor: 0x00d5ff,
	rimStrength: 0,
	rimPower: 2.45,
	metalness: 1,
	keyStrength: 0.68,
	fillStrength: 0.34,
	ambient: 0.2,
	specularStrength: 0.03,
	roughness: 1,
	surfaceVariation: 0,
	weathering: 1,
	brushing: 1,
};

function cloneCraneMaterialConfig(config) {
	return { ...config };
}

function createCraneMaterialState(config) {
	return {
		baseColor: new THREE.Color(config.baseColor),
		rimColor: new THREE.Color(config.rimColor),
		...Object.fromEntries(
			Object.keys(CRANE_MATERIAL_NUMERIC_LIMITS).map((key) => [key, Number(config[key]) || 0]),
		),
	};
}

function captureCraneMaterialState(material) {
	const uniforms = material?.uniforms;
	if (!uniforms?.uBaseColor || !uniforms?.uRimColor) return null;
	return {
		baseColor: uniforms.uBaseColor.value.clone(),
		rimColor: uniforms.uRimColor.value.clone(),
		rimStrength: uniforms.uRimStrength.value,
		rimPower: uniforms.uRimPower.value,
		metalness: uniforms.uMetalness.value,
		keyStrength: uniforms.uKeyStrength.value,
		fillStrength: uniforms.uFillStrength.value,
		ambient: uniforms.uAmbient.value,
		specularStrength: uniforms.uSpecularStrength.value,
		roughness: uniforms.uRoughness.value,
		surfaceVariation: uniforms.uSurfaceVariation.value,
		weathering: uniforms.uWeathering.value,
		brushing: uniforms.uBrushing.value,
	};
}

function applyCraneMaterialState(material, state) {
	const uniforms = material?.uniforms;
	if (!uniforms || !state) return false;
	uniforms.uBaseColor.value.copy(state.baseColor);
	uniforms.uRimColor.value.copy(state.rimColor);
	for (const key of Object.keys(CRANE_MATERIAL_NUMERIC_LIMITS)) {
		const uniformName = `u${key[0].toUpperCase()}${key.slice(1)}`;
		if (uniforms[uniformName]) uniforms[uniformName].value = state[key];
	}
	return true;
}

function mixCraneMaterialState(material, from, to, progress) {
	const uniforms = material?.uniforms;
	if (!uniforms || !from || !to) return;
	uniforms.uBaseColor.value.lerpColors(from.baseColor, to.baseColor, progress);
	uniforms.uRimColor.value.lerpColors(from.rimColor, to.rimColor, progress);
	for (const key of Object.keys(CRANE_MATERIAL_NUMERIC_LIMITS)) {
		const uniformName = `u${key[0].toUpperCase()}${key.slice(1)}`;
		if (uniforms[uniformName]) {
			uniforms[uniformName].value = THREE.MathUtils.lerp(from[key], to[key], progress);
		}
	}
}

function serializeCraneMaterialConfig(profile, config, activeProfile) {
	return {
		profile,
		activeProfile,
		baseColor: `#${new THREE.Color(config.baseColor).getHexString()}`,
		rimColor: `#${new THREE.Color(config.rimColor).getHexString()}`,
		...Object.fromEntries(
			Object.keys(CRANE_MATERIAL_NUMERIC_LIMITS).map((key) => [key, config[key]]),
		),
	};
}

function isMmk1CapabilityPath(pathname) {
	const normalized = String(pathname ?? "/").replace(/\/+$/, "") || "/";
	return normalized === "/capabilities" || normalized === "/capabilities/mmk1";
}

/**
 * The former standalone MMK-1 case scene, now owned by the first capability.
 * Capability scenes contain no case-study left text HUD.
 */
export class Mmk1CapabilityScene extends Case3Scene {
	constructor(renderer, store) {
		super(renderer, store, {
			sceneId: "capabilities:mmk1",
			matchPage: isMmk1CapabilityPath,
			createPanelHud: false,
			enableBlockHover: false,
			settleRootOnEnter: true,
		});
		this._routeCurrentPage = "/";
		this._defaultCraneRotationY = this.getCraneRotationY();
		this._craneRotationFlight = null;
		this._craneMaterialDefaults = {
			overview: cloneCraneMaterialConfig(OVERVIEW_CRANE_MATERIAL),
			close: cloneCraneMaterialConfig(CLOSE_CRANE_MATERIAL),
		};
		this._craneMaterialProfiles = {
			overview: cloneCraneMaterialConfig(this._craneMaterialDefaults.overview),
			close: cloneCraneMaterialConfig(this._craneMaterialDefaults.close),
		};
		this._activeCraneMaterialProfile = "overview";
		this._craneMaterialFlight = null;
		this._frameCamera = null;
		this._overviewReturnActive = false;
		this._dragOrbitTarget = new THREE.Vector3();
		this._carouselMixTargetPrepared = false;
		this.sceneSound = new CapabilitySceneSound();
		this._cameraHotspots = new Mmk1CameraHotspots(this.threeScene, renderer.domElement, {
			renderer,
			onActivate: (definition) => this._activateHotspot(definition),
		});
		this._freeCamera = import.meta.env.DEV
			? new PortfolioFreeCameraController(renderer.domElement, {
					snapshotName: "mmk1Camera",
					logLabel: "mmk1Camera",
				})
			: null;
		this.readyPromise = Promise.all([this.readyPromise, this._cameraHotspots.prepareLabels(), this.sceneSound.prepare()]).then(([craneReady]) => {
			this._applyCraneMaterialProfile(this._activeCraneMaterialProfile);
			return craneReady;
		});
		this._disposeReturnToOverviewBridge = setMmk1ReturnToOverviewHandler(
			() => this.returnToOverview(),
		);
	}

	setRouteState(routeState) {
		this._routeCurrentPage = routeState?.currentPage ?? this._routeCurrentPage;
		super.setRouteState(routeState);
	}

	resetCarouselState(ctx = {}) {
		if (!isRingDormantReason(ctx.reason)) {
			return;
		}
		this._freeCamera?.setEnabled(false);
		this.sceneSound.stop();
		this._cameraHotspots?.reset();
		this._craneRotationFlight = null;
		this._craneMaterialFlight = null;
		this._carouselMixTargetPrepared = false;
		this.store.capabilitiesExperience.investigating = false;
		this.store.capabilitiesExperience.activeHotspotId = null;
		this.setCraneRotationY(this._defaultCraneRotationY);
		this._applyCraneMaterialProfile("overview");
		super.resetCarouselState();
	}

	prepareCarouselMixTarget() {
		if (this._carouselMixTargetPrepared) {
			return;
		}
		this._carouselMixTargetPrepared = true;
		super.prepareCarouselMixTarget();
	}

	playEnterAnimation() {
		if (this._carouselMixTargetPrepared) {
			// The exact target pose was already visible in the hex layer. Adopt it
			// as current without replaying the case-style root/camera enter.
			this._carouselMixTargetPrepared = false;
			this.setMixPreviewActive(false);
			return;
		}
		super.playEnterAnimation();
	}

	_activateHotspot(definition) {
		this._startCraneRotationFlight(definition);
		this._startCraneMaterialFlight("close");
		this.gridRadar?.trigger?.();
		this.store.capabilitiesExperience.investigating = true;
		this.store.capabilitiesExperience.activeHotspotId = definition?.id ?? null;
	}

	_startCraneRotationFlight(definition) {
		const configuredDeg = Number(definition?.craneRotationDeg);
		const target = Number.isFinite(configuredDeg)
			? configuredDeg * (Math.PI / 180)
			: this._defaultCraneRotationY;
		this._craneRotationFlight = {
			elapsed: 0,
			from: this.getCraneRotationY(),
			to: target,
		};
	}

	_applyCraneMaterialProfile(profile) {
		const resolvedProfile = profile === "close" ? "close" : "overview";
		this._activeCraneMaterialProfile = resolvedProfile;
		return applyCraneMaterialState(
			this.craneBodyMesh?.material,
			createCraneMaterialState(this._craneMaterialProfiles[resolvedProfile]),
		);
	}

	_startCraneMaterialFlight(profile) {
		const resolvedProfile = profile === "close" ? "close" : "overview";
		const from = captureCraneMaterialState(this.craneBodyMesh?.material);
		this._activeCraneMaterialProfile = resolvedProfile;
		if (!from) {
			this._craneMaterialFlight = null;
			return;
		}
		this._craneMaterialFlight = {
			elapsed: 0,
			from,
			to: createCraneMaterialState(this._craneMaterialProfiles[resolvedProfile]),
		};
	}

	setPointerState(pointerState) {
		super.setPointerState(pointerState);
		this._cameraHotspots?.setPointerState(pointerState);
	}

	isDragOrbitEnabled() {
		return true;
	}

	getDragOrbitTarget(_camera, frame) {
		return this._cameraHotspots?.getOrbitTarget(this._dragOrbitTarget)
			?? this.getCameraLookAt(frame, this._dragOrbitTarget);
	}

	applyCamera(camera, frame) {
		if (this._freeCamera?.apply(camera)) {
			this._cameraHotspots?.syncCamera(camera);
			return;
		}
		if (this._cameraHotspots?.applyCamera(camera, this.cameraParallax)) {
			this._cameraHotspots.syncCamera(camera);
			return;
		}
		super.applyCamera(camera, frame);
		this._cameraHotspots?.syncCamera(camera);
	}

	update(delta, frame) {
		// Ring routes may render this scene as previous/next after the HTML route
		// lifecycle hid the old case root. Wake it as a prepared mix participant.
		if (!this.showCase && !this._mixPreview) {
			this.setMixPreviewActive(true);
		}
		super.update(delta, frame);
		this._frameCamera = frame?.camera ?? this._frameCamera;
		if (this._overviewReturnActive) {
			this.cameraParallax.set(0, 0);
			if (!this._cameraHotspots?.isReturningToOverview?.()) {
				this._overviewReturnActive = false;
			}
		}
		if (this.craneMesh) {
			this._cameraHotspots?.bindToObject(
				this.craneMesh,
				this.getCraneAnchorReferenceMatrix(),
			);
		}
		if (this._craneRotationFlight) {
			this._craneRotationFlight.elapsed += Math.max(0, Math.min(delta, 0.05));
			const progress = clamp01(
				this._craneRotationFlight.elapsed / MMK1_CAMERA_HOTSPOT_MOTION.duration,
			);
			const eased = easeInOutCubic(progress);
			this.setCraneRotationY(
				this._craneRotationFlight.from
					+ (this._craneRotationFlight.to - this._craneRotationFlight.from) * eased,
			);
			if (progress >= 1) {
				this._craneRotationFlight = null;
			}
		}
		if (this._craneMaterialFlight) {
			this._craneMaterialFlight.elapsed += Math.max(0, Math.min(delta, 0.05));
			const progress = clamp01(
				this._craneMaterialFlight.elapsed / CRANE_MATERIAL_TRANSITION_DURATION,
			);
			mixCraneMaterialState(
				this.craneBodyMesh?.material,
				this._craneMaterialFlight.from,
				this._craneMaterialFlight.to,
				easeInOutCubic(progress),
			);
			if (progress >= 1) this._craneMaterialFlight = null;
		}
		if (this._freeCamera?.enabled && frame?.camera) {
			this._freeCamera.update(delta, frame.camera);
		}
		const current = frame?.activeSceneId === this.sceneId;
		const textStarted = this.store.appStarted === true && getLoaderCurtainRemainingMs(this.store.appStartedAt) === 0;
		const transitioning = this.store.sceneCarouselClickTransitionActive === true || Math.abs(this.store.hexShaderProgress ?? 0) > 0.0001;
		const hotspotHovered = this._cameraHotspots?.update(delta, frame, {
			locale: this.store.siteLocale,
			textState: { started: textStarted, current, transitioning },
			interactionEnabled: Boolean(
				(this.activePage || this.showCase)
					&& !this._freeCamera?.enabled
					&& frame?.interactionEnabled !== false,
			),
		}) ?? false;
		this.sceneSound.update(delta, {
			enabled: current && this.store.appStarted === true && !transitioning,
			reveal: this._cameraHotspots?.details?.getSoundReveal(true) ?? 0,
			hudReveal: this._cameraHotspots?.details?.getSoundReveal() ?? 0,
			hoverReveals: this._cameraHotspots?.labels?.soundReveals,
			pan: -0.4,
		});
		if (this.store?.cursor) {
			this.store.cursor.caseHovered = hotspotHovered
				|| Boolean(this.pointerInteract?.isHovered?.());
		}
	}

	beginWarmupDraw() {
		return super.beginWarmupDraw();
	}

	endWarmupDraw(token) {
		super.endWarmupDraw(token);
	}

	isFreeCameraEnabled() {
		return this._freeCamera?.enabled === true;
	}

	setFreeCameraEnabled(enabled, camera) {
		if (!this._freeCamera) {
			return false;
		}
		const browserPath = typeof window !== "undefined" ? window.location.pathname : "/";
		if (enabled && !isMmk1CapabilityPath(this._routeCurrentPage) && !isMmk1CapabilityPath(browserPath)) {
			return false;
		}
		if (enabled) {
			this._cameraHotspots?.reset();
		}
		this._freeCamera.setEnabled(enabled, camera);
		return this._freeCamera.enabled;
	}

	resetFreeCamera(camera) {
		if (!camera) {
			return;
		}
		this._cameraHotspots?.reset();
		this._craneMaterialFlight = null;
		this._applyCraneMaterialProfile("overview");
		super.applyCamera(camera, { sceneProgress: 0 });
		this._freeCamera?.syncFromCamera(camera);
	}

	returnToOverview() {
		const camera = this._frameCamera;
		if (!camera) return false;
		this._freeCamera?.setEnabled(false);
		this._overviewReturnActive = true;
		this.cameraParallax.set(0, 0);

		const fromPosition = camera.position.clone();
		const fromQuaternion = camera.quaternion.clone();
		const fromFov = camera.fov;
		super.applyCamera(camera, { sceneProgress: 0 });
		const target = {
			position: camera.position.clone(),
			quaternion: camera.quaternion.clone(),
			fov: camera.fov,
		};
		camera.position.copy(fromPosition);
		camera.quaternion.copy(fromQuaternion);
		camera.fov = fromFov;
		camera.updateProjectionMatrix();
		camera.updateMatrixWorld(true);

		this._cameraHotspots?.startOverviewFlight?.(camera, target);
		this._startCraneMaterialFlight("overview");
		this._startCraneRotationFlight(null);
		this.gridRadar?.trigger?.();
		this.store.capabilitiesExperience.investigating = false;
		this.store.capabilitiesExperience.activeHotspotId = null;
		return true;
	}

	getFreeCameraSnapshot(camera) {
		return this._freeCamera?.getSnapshot(camera) ?? null;
	}

	copyFreeCameraSnapshot(camera) {
		return this._freeCamera?.copySnapshot(camera) ?? Promise.resolve(false);
	}

	getCraneRotationDeg() {
		return this.getCraneRotationY() * (180 / Math.PI);
	}

	setCraneRotationDeg(rotationDeg) {
		return this.setCraneRotationY(Number(rotationDeg) * (Math.PI / 180));
	}

	resetCraneRotationDeg() {
		this.resetCraneRotation();
		return this.getCraneRotationDeg();
	}

	getCraneMaterialSettings(profile = this._activeCraneMaterialProfile) {
		const resolvedProfile = profile === "close" ? "close" : "overview";
		return serializeCraneMaterialConfig(
			resolvedProfile,
			this._craneMaterialProfiles[resolvedProfile],
			this._activeCraneMaterialProfile,
		);
	}

	setCraneMaterialPreviewProfile(profile) {
		this._craneMaterialFlight = null;
		this._applyCraneMaterialProfile(profile);
		return this.getCraneMaterialSettings(profile);
	}

	setCraneMaterialSettings(profile, settings = {}) {
		const resolvedProfile = profile === "close" ? "close" : "overview";
		const target = this._craneMaterialProfiles[resolvedProfile];
		for (const key of ["baseColor", "rimColor"]) {
			if (settings[key] == null) continue;
			try {
				target[key] = new THREE.Color(settings[key]).getHex();
			} catch {
				return null;
			}
		}
		for (const [key, [min, max]] of Object.entries(CRANE_MATERIAL_NUMERIC_LIMITS)) {
			if (settings[key] == null) continue;
			const value = Number(settings[key]);
			if (!Number.isFinite(value)) return null;
			target[key] = THREE.MathUtils.clamp(value, min, max);
		}
		if (this._activeCraneMaterialProfile === resolvedProfile) {
			this._craneMaterialFlight = null;
			this._applyCraneMaterialProfile(resolvedProfile);
		}
		return this.getCraneMaterialSettings(resolvedProfile);
	}

	resetCraneMaterialSettings(profile = this._activeCraneMaterialProfile) {
		const resolvedProfile = profile === "close" ? "close" : "overview";
		this._craneMaterialProfiles[resolvedProfile] = cloneCraneMaterialConfig(
			this._craneMaterialDefaults[resolvedProfile],
		);
		if (this._activeCraneMaterialProfile === resolvedProfile) {
			this._craneMaterialFlight = null;
			this._applyCraneMaterialProfile(resolvedProfile);
		}
		return this.getCraneMaterialSettings(resolvedProfile);
	}

	getHotspotLineThickness() {
		return this._cameraHotspots?.getLineThickness?.() ?? 1.5;
	}

	setHotspotLineThickness(value) {
		return this._cameraHotspots?.setLineThickness?.(value) ?? null;
	}

	resetHotspotLineThickness() {
		return this._cameraHotspots?.setLineThickness?.(1.5) ?? null;
	}

	dispose() {
		this.sceneSound.dispose();
		this._craneRotationFlight = null;
		this._craneMaterialFlight = null;
		this._frameCamera = null;
		this._overviewReturnActive = false;
		this._disposeReturnToOverviewBridge?.();
		this._disposeReturnToOverviewBridge = null;
		this._cameraHotspots?.dispose();
		this._cameraHotspots = null;
		this._freeCamera?.dispose();
		this._freeCamera = null;
		super.dispose();
	}
}
