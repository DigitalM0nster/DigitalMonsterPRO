import * as THREE from "three";
import { createGLTFLoader } from "@/three/assets/gltfLoader.js";
import { applySceneProgressToCamera } from "../utils/applySceneProgressToCamera.js";
import {
	ABOUT_COLORS,
	ABOUT_LAYOUT,
	ABOUT_LIGHTS,
	ABOUT_MATERIALS,
	ABOUT_MODEL_ASSET_EULER_DEG,
	ABOUT_MODEL_PARALLAX,
	ABOUT_MODEL_TARGET_SIZE,
	ABOUT_MODEL_URL,
	ABOUT_PARTICLES,
	cloneAboutMaterialsConfig,
} from "./aboutSceneConfig.js";
import { applyAboutModelMaterials, applyAboutMaterialsConfig } from "./aboutMaterials.js";
import { createAboutInsideParticles } from "./aboutInsideParticles.js";
import { createAboutEdgeParticles } from "./aboutEdgeParticles.js";
import { createAboutOuterCellScatter } from "./aboutOuterCellScatter.js";
import { createAboutFrontAdvance } from "./aboutFrontAdvance.js";
import { createAboutBackRetreat } from "./aboutBackRetreat.js";
import { createAboutHeartScale } from "./aboutHeartScale.js";
import { blenderHorizontalFovToThreeVertical, createAboutModelPoseRig, sampleAboutStagePose } from "./aboutStagePoses.js";
import { setAboutDissolveProgress } from "./aboutDissolveShader.js";
import { resetAboutExperienceState } from "@/about/aboutExperienceRuntime.js";
import { ABOUT_STAGE_COUNT } from "@/about/states.js";
import { isAboutPanelHudRevealExiting } from "@/about/aboutPanelHudReveal.js";
import { armAboutPanelHudForRoute, isAboutPanelHudVisitArmed, syncAboutPanelHudFromStory } from "@/about/aboutPanelHudStory.js";
import { isAboutExperienceRuntimeActive } from "@/about/aboutExperienceRuntime.js";
import { store } from "@/store.jsx";
import { createCaseStudyPanelHud, disposeCaseStudyPanelHud, syncAboutPanelHud } from "@/three/scenes/portfolio/caseStudyText/caseStudyPanelHudHost.js";
import { getSceneCarousel } from "@/three/render/transition/carouselPage.js";
import { isLeavePoseReason, isRingDormantReason } from "@/three/scenes/lifecycle/sceneLifecycle.js";

const ABOUT_PATH = "/about";
/** Enter/leave page parallax (SCROLL_PARALLAX.md). Interior story owns content motion. */
const CAMERA_SCROLL_Y = 1.9;
const CAMERA_SCROLL_Z = 0.7;

function isAboutPath(pathname) {
	return (String(pathname ?? "/").replace(/\/+$/, "") || "/") === ABOUT_PATH;
}

function disposeObject3D(root, { skipMaterials = false } = {}) {
	if (!root) return;
	root.traverse((object) => {
		if (object.geometry && !object.userData?.sharesGeometry) {
			object.geometry.dispose();
		}
		if (skipMaterials) return;
		const materials = Array.isArray(object.material) ? object.material : [object.material];
		for (const material of materials) {
			if (!material) continue;
			for (const key of Object.keys(material)) {
				const value = material[key];
				if (value && typeof value === "object" && value.isTexture) {
					value.dispose();
				}
			}
			material.dispose();
		}
	});
}

/**
 * About WebGL scene: AboutUsModel.glb.
 * Camera is sceneProgress-only (no OrbitControls).
 * Internal scroll story is owned by aboutExperienceRuntime (`store.aboutExperience`).
 */
export class AboutScene {
	constructor(store) {
		this.store = store;
		this.threeScene = new THREE.Scene();
		this.threeScene.background = null;

		this.root = new THREE.Group();
		this.motionRoot = new THREE.Group();
		this.modelRoot = new THREE.Group();
		this.modelRoot.name = "AboutUsModel";
		this.root.add(this.motionRoot);
		this.motionRoot.add(this.modelRoot);
		this.threeScene.add(this.root);

		this._elapsed = 0;
		this._routeActive = false;
		this._mixPreview = false;
		this._disposed = false;
		this._model = null;
		this._ownedMaterials = [];
		this._materialsByKey = null;
		this._materialsConfig = cloneAboutMaterialsConfig();
		this._particles = null;
		this._edgeParticles = null;
		this._outerCellScatter = null;
		this._frontAdvance = null;
		this._backRetreat = null;
		this._heartScale = null;
		this._modelPose = createAboutModelPoseRig(this.modelRoot);
		this._frontPlate = null;
		this._backPlate = null;
		this._frontBackSide = null;
		this._backBackSide = null;
		this._scrollProgress = 0;
		this._storyProgress = 0;
		this._insideLarge = null;
		this._edgeForParticlesMesh = null;
		this._edgeRebuildRaf = 0;
		this._viewport = { width: 1440, height: 900, mobile: false, short: false };
		this._layout = ABOUT_LAYOUT.desktop;
		this._smoothPointer = { x: 0, y: 0 };
		this._parallaxYawQ = new THREE.Quaternion();
		this._parallaxPitchQ = new THREE.Quaternion();
		this._parallaxAxisY = new THREE.Vector3(0, 1, 0);
		this._parallaxAxisX = new THREE.Vector3(1, 0, 0);

		this._buildLights();
		this._buildHalo();

		this.panelHud = createCaseStudyPanelHud(this.threeScene);
		this.panelHud.setUseAboutBridge(true);

		this.readyPromise = this._loadModel();
		this._applyResponsiveTransform();
	}

	getAboutMaterialsConfig() {
		return this._materialsConfig;
	}

	/** Structural knobs rebuild the lattice; the rest only touch uniforms. */
	_edgeParticlesLayoutKey(cfg = {}) {
		return [cfg.rings, cfg.yLayers, cfg.spokes, cfg.innerScale, cfg.loopSegments, cfg.travelers].join("|");
	}

	/** Drive edge lattice visibility (kept fully on — spins with Heart). */
	_applyEdgeParticleVisibility(visibility) {
		const next = Number(visibility);
		const v = THREE.MathUtils.clamp(Number.isFinite(next) ? next : 0, 0, 1);
		this._edgeParticles?.setVisibility?.(v);
		const host = this._edgeForParticlesMesh;
		if (!host) return;
		const show = v > 0.004;
		host.traverse((obj) => {
			if (obj.name !== "AboutEdgeParticleLines" && obj.name !== "AboutEdgeParticles") return;
			obj.visible = show;
			if (show) return;
			const u = obj.material?.uniforms;
			if (u?.uOpacity) u.uOpacity.value = 0;
			if (u?.uIntensity) u.uIntensity.value = 0;
			if (u?.uNodeIntensity) u.uNodeIntensity.value = 0;
		});
	}

	_disposeEdgeParticleOrphans() {
		const host = this._edgeForParticlesMesh;
		if (!host) return;
		const doomed = [];
		host.traverse((obj) => {
			if (obj.name === "AboutEdgeParticleLines" || obj.name === "AboutEdgeParticles") {
				doomed.push(obj);
			}
		});
		for (const obj of doomed) {
			host.remove(obj);
			obj.geometry?.dispose?.();
			obj.material?.dispose?.();
		}
	}

	_rebuildEdgeParticles() {
		if (!this._edgeForParticlesMesh) {
			this._edgeParticles?.dispose();
			this._edgeParticles = null;
			return;
		}
		this._edgeParticles?.dispose();
		this._edgeParticles = null;
		this._disposeEdgeParticleOrphans();
		this._edgeParticles = createAboutEdgeParticles(this._edgeForParticlesMesh, this._materialsConfig.edgeParticles);
		this._applyEdgeParticleVisibility(1);
	}

	_scheduleEdgeParticlesRebuild() {
		if (this._edgeRebuildRaf) return;
		this._edgeRebuildRaf = requestAnimationFrame(() => {
			this._edgeRebuildRaf = 0;
			if (this._disposed) return;
			this._rebuildEdgeParticles();
		});
	}

	applyAboutMaterialsConfig(config = this._materialsConfig) {
		const prevLayout = this._edgeParticlesLayoutKey(this._materialsConfig.edgeParticles);
		this._materialsConfig = cloneAboutMaterialsConfig(config);
		Object.assign(ABOUT_MATERIALS.frontGlass, this._materialsConfig.frontGlass);
		Object.assign(ABOUT_MATERIALS.sideHud, this._materialsConfig.sideHud);
		Object.assign(ABOUT_MATERIALS.dark, this._materialsConfig.dark);
		Object.assign(ABOUT_MATERIALS.heartBody, this._materialsConfig.heartBody);
		Object.assign(ABOUT_MATERIALS.outerCell, this._materialsConfig.outerCell);
		Object.assign(ABOUT_MATERIALS.neon, this._materialsConfig.neon);
		Object.assign(ABOUT_MATERIALS.stage2Dissolve, this._materialsConfig.stage2Dissolve);
		Object.assign(ABOUT_MATERIALS.backRetreat, this._materialsConfig.backRetreat);
		Object.assign(ABOUT_MATERIALS.heartScale, this._materialsConfig.heartScale);
		Object.assign(ABOUT_MATERIALS.edgeParticles, this._materialsConfig.edgeParticles);
		if (this._materialsByKey) {
			applyAboutMaterialsConfig(this._materialsByKey, this._materialsConfig);
		}
		const nextEdge = this._materialsConfig.edgeParticles;
		const nextLayout = this._edgeParticlesLayoutKey(nextEdge);
		if (this._edgeForParticlesMesh && nextLayout !== prevLayout) {
			this._scheduleEdgeParticlesRebuild();
		} else {
			this._edgeParticles?.applyConfig?.(nextEdge);
		}
	}

	/** Optional external scrub (legacy 0…1); prefer story via store.aboutExperience. */
	setProgress(progress) {
		const p = THREE.MathUtils.clamp(Number(progress) || 0, 0, 1);
		this._applyStoryProgress(p);
	}

	_readAboutStoryProgress() {
		const experience = this.store?.aboutExperience;
		const story = Number(experience?.storyProgress);
		/** Route-edge overshoot (−0.5 / +1.5) stays in the experience; scene clamps to 0…4. */
		if (Number.isFinite(story)) return THREE.MathUtils.clamp(story, 0, 4);
		const stageLocal = Number(experience?.stageProgress);
		const stageIndex = Number(experience?.activeStageIndex);
		if (Number.isFinite(stageLocal) && Number.isFinite(stageIndex)) {
			return Math.max(0, stageIndex + THREE.MathUtils.clamp(stageLocal, 0, 1));
		}
		const fromStore = Number(experience?.progress);
		if (Number.isFinite(fromStore)) return THREE.MathUtils.clamp(fromStore, 0, 1) * 4;
		return this._storyProgress;
	}

	_applyStoryProgress(story) {
		const s = THREE.MathUtils.clamp(Number(story) || 0, 0, 4);
		this._storyProgress = s;
		this._scrollProgress = THREE.MathUtils.clamp(s, 0, 1);
		this._outerCellScatter?.setStoryProgress?.(s);
		this._frontAdvance?.setStoryProgress?.(s);
		this._backRetreat?.setStoryProgress?.(s);
		this._heartScale?.setStoryProgress?.(s);
		this._modelPose?.setStoryProgress?.(s);
		/** Dissolve on stage 1: 0…0.5 visible, 0.5…1.0 fades out; stays gone after. */
		const stage1 = THREE.MathUtils.clamp(s, 0, 1);
		const dissolve = THREE.MathUtils.clamp((stage1 - 0.5) / 0.5, 0, 1);
		const dissolveCfg = this._materialsConfig?.stage2Dissolve;
		/** Front = hex (0); OUTER_cell = scan (1); locked after tuning. */
		const frontMode = dissolveCfg?.mode ?? 0;
		const cellMode = dissolveCfg?.cellMode ?? 1;
		/** Back = Energy vapor (anim 4 / mode 3) on stage 2→3 (story 1→2). */
		const backMode = Number.isFinite(dissolveCfg?.backMode) ? dissolveCfg.backMode : 3;
		const backCfg = this._materialsConfig?.backRetreat ?? ABOUT_MATERIALS.backRetreat;
		const backStart = backCfg?.storyStart ?? 1;
		const backEnd = Math.max(backStart + 1e-4, backCfg?.storyEnd ?? 2);
		const backDissolve = THREE.MathUtils.clamp((s - backStart) / (backEnd - backStart), 0, 1);

		const frontU = this._materialsByKey?.frontGlass?.userData?.uniforms;
		const cellU = this._materialsByKey?.outerCell?.userData?.uniforms;
		const sideU = this._materialsByKey?.sideHud?.userData?.uniforms;
		setAboutDissolveProgress(frontU, dissolve);
		setAboutDissolveProgress(cellU, dissolve);
		setAboutDissolveProgress(sideU, 0);
		const frontSideU = this._frontBackSide?.material?.userData?.uniforms;
		setAboutDissolveProgress(frontSideU, dissolve);
		if (frontU?.uDissolveMode) frontU.uDissolveMode.value = frontMode;
		if (cellU?.uDissolveMode) cellU.uDissolveMode.value = cellMode;
		if (frontSideU?.uDissolveMode) frontSideU.uDissolveMode.value = frontMode;

		const backU = this._backPlate?.material?.userData?.uniforms ?? this._backPlate?.material?.uniforms;
		const backSideU = this._backBackSide?.material?.userData?.uniforms ?? this._backBackSide?.material?.uniforms;
		setAboutDissolveProgress(backU, backDissolve);
		setAboutDissolveProgress(backSideU, backDissolve);
		if (backU?.uDissolveMode) backU.uDissolveMode.value = backMode;
		if (backSideU?.uDissolveMode) backSideU.uDissolveMode.value = backMode;

		if (this._materialsByKey?.outerCell) {
			this._materialsByKey.outerCell.depthWrite = dissolve < 0.85;
			this._materialsByKey.outerCell.transparent = true;
		}
		/** Depth prepass / front rim must not occlude heart through dissolve holes. */
		const frontPrepass = this._frontPlate?.getObjectByName("PlateDepthPrepass");
		if (frontPrepass) {
			frontPrepass.visible = dissolve < 0.98;
		}
		/**
		 * Back / BackBackSide: depthWrite stays false always (set at material create).
		 * Only toggle prepass + mesh visibility — never flip material flags mid-dissolve
		 * (that opaque↔transparent swap was the 1-frame BackBack corruption).
		 */
		const backPrepass = this._backPlate?.getObjectByName("PlateDepthPrepass");
		if (backPrepass) {
			backPrepass.visible = backDissolve < 0.8;
		}
		const backSidePrepass = this._backBackSide?.getObjectByName("PlateDepthPrepass");
		if (backSidePrepass) {
			backSidePrepass.visible = backDissolve < 0.8;
		}
		if (this._frontBackSide?.material) {
			this._frontBackSide.material.depthWrite = dissolve < 0.02;
			this._frontBackSide.material.transparent = true;
		}
		/** Vapor finishes by ~0.8 — hide after shader is already clear */
		if (this._backPlate) {
			this._backPlate.visible = backDissolve < 0.84;
		}
		if (this._backBackSide) {
			this._backBackSide.visible = backDissolve < 0.84;
		}
		/**
		 * White InsideLarge PCB: appear stage 2.5→3 (story 1.5→2).
		 * Blue Edge lattice: dissolve stage 2.0→3.0 (story 1→2), spins with Heart.
		 */
		const pcbCfg = ABOUT_PARTICLES;
		const revealStart = pcbCfg.revealStoryStart ?? 1.5;
		const revealEnd = Math.max(revealStart + 1e-4, pcbCfg.revealStoryEnd ?? 2);
		const pcbReveal = THREE.MathUtils.clamp((s - revealStart) / (revealEnd - revealStart), 0, 1);
		const pcbAppearMode = pcbCfg.appearMode ?? 4;
		this._particles?.setRevealProgress?.(pcbReveal, pcbAppearMode);

		const edgeCfg = this._materialsConfig?.edgeParticles ?? ABOUT_MATERIALS.edgeParticles;
		const edgeHideStart = Number.isFinite(edgeCfg.hideStoryStart) ? edgeCfg.hideStoryStart : 1;
		const edgeHideEnd = Math.max(edgeHideStart + 1e-4, Number.isFinite(edgeCfg.hideStoryEnd) ? edgeCfg.hideStoryEnd : 2);
		const edgeDissolve = THREE.MathUtils.clamp((s - edgeHideStart) / (edgeHideEnd - edgeHideStart), 0, 1);
		const edgeMode = Number.isFinite(edgeCfg.dissolveMode) ? edgeCfg.dissolveMode : 5;
		this._applyEdgeParticleVisibility(1);
		this._edgeParticles?.setDissolve?.(edgeDissolve, edgeMode);
	}

	init() {
		return this.readyPromise;
	}

	shouldRender() {
		return true;
	}

	shouldKeepUpdating() {
		return this._routeActive || this._mixPreview;
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

	_buildLights() {
		const L = ABOUT_LIGHTS;
		const ambient = new THREE.AmbientLight(L.ambient.color, L.ambient.intensity);
		const hemi = new THREE.HemisphereLight(L.hemisphere.sky, L.hemisphere.ground, L.hemisphere.intensity);

		const key = new THREE.DirectionalLight(L.key.color, L.key.intensity);
		key.position.set(...L.key.position);

		const rim = new THREE.DirectionalLight(L.rim.color, L.rim.intensity);
		rim.position.set(...L.rim.position);

		const front = new THREE.DirectionalLight(L.front.color, L.front.intensity);
		front.position.set(...L.front.position);

		const bottom = new THREE.DirectionalLight(L.bottom.color, L.bottom.intensity);
		bottom.position.set(...L.bottom.position);

		const fill = new THREE.DirectionalLight(L.fill.color, L.fill.intensity);
		fill.position.set(...L.fill.position);

		this.threeScene.add(ambient, hemi, key, rim, front, bottom, fill);
		this._lights = { ambient, hemi, key, rim, front, bottom, fill };
	}

	_buildHalo() {
		const geo = new THREE.PlaneGeometry(7.5, 7.5);
		const mat = new THREE.ShaderMaterial({
			uniforms: {
				uColor: { value: new THREE.Color(ABOUT_COLORS.halo) },
				uIntensity: { value: 0.35 },
			},
			vertexShader: `
				varying vec2 vUv;
				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
				}
			`,
			fragmentShader: `
				uniform vec3 uColor;
				uniform float uIntensity;
				varying vec2 vUv;
				void main() {
					vec2 p = vUv * 2.0 - 1.0;
					float r = length(p);
					float glow = exp(-r * r * 1.8);
					float alpha = glow * uIntensity;
					if (alpha < 0.01) discard;
					gl_FragColor = vec4(uColor, alpha);
				}
			`,
			transparent: true,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
			toneMapped: false,
		});
		this._haloPlane = new THREE.Mesh(geo, mat);
		this._haloPlane.position.set(0, 0, -1.6);
		this._haloPlane.renderOrder = -1;
		this.motionRoot.add(this._haloPlane);
		this._haloGeo = geo;
		this._haloMat = mat;
	}

	_loadModel() {
		return createGLTFLoader()
			.loadAsync(ABOUT_MODEL_URL)
			.then((gltf) => {
				if (this._disposed || !this.threeScene) return false;

				const model = gltf.scene;
				model.traverse((object) => {
					if (!object.isMesh && !object.isLine && !object.isLineSegments) return;
					object.castShadow = false;
					object.receiveShadow = false;
					/** Heart / OUTER_cell pieces stay drawable (thin strips, many instances). */
					object.frustumCulled = !/^Heart/i.test(object.name) && !/^OUTER_cell/i.test(object.name);
				});

				const applied = applyAboutModelMaterials(model, this._materialsConfig);
				this._ownedMaterials = applied.materials;
				this._materialsByKey = applied.materialsByKey;
				this._insideLarge = applied.insideLarge;
				/** Blue lattice only on authored EdgeForParticles — never fall back to InsideLarge. */
				this._edgeForParticlesMesh = applied.edgeForParticles ?? null;

				// Match Blender/glTF authoring — tune ABOUT_MODEL_ASSET_EULER_DEG if needed.
				const assetEuler = ABOUT_MODEL_ASSET_EULER_DEG ?? { x: 0, y: 0, z: 0 };
				model.rotation.set(THREE.MathUtils.degToRad(assetEuler.x ?? 0), THREE.MathUtils.degToRad(assetEuler.y ?? 0), THREE.MathUtils.degToRad(assetEuler.z ?? 0), "XYZ");

				if (ABOUT_MODEL_TARGET_SIZE > 0) {
					const initialBox = new THREE.Box3().setFromObject(model);
					const initialSize = initialBox.getSize(new THREE.Vector3());
					const scale = ABOUT_MODEL_TARGET_SIZE / Math.max(initialSize.x, initialSize.y, initialSize.z, 0.001);
					model.scale.setScalar(scale);
					model.updateMatrixWorld(true);
				}

				const box = new THREE.Box3().setFromObject(model);
				const center = box.getCenter(new THREE.Vector3());
				model.position.set(-center.x, -center.y, -center.z);

				this.modelRoot.add(model);
				this._model = model;
				this._frontPlate = model.getObjectByName("Front") ?? null;
				this._backPlate = model.getObjectByName("Back") ?? null;
				this._frontBackSide = model.getObjectByName("FrontBackSide") ?? null;
				this._backBackSide = model.getObjectByName("BackBackSide") ?? null;

				/**
				 * Split FX by mesh:
				 * - InsideLarge → microchip / PCB layer
				 * - EdgeForParticles → classic blue neon lattice + travelers
				 * - OUTER_cell* → scroll scatter rig
				 */
				this._particles?.dispose();
				this._particles = this._insideLarge
					? createAboutInsideParticles(this._insideLarge, {
							mobile: this._viewport.mobile,
							silhouetteMesh: this._insideLarge,
						})
					: null;

				this._edgeParticles?.dispose();
				this._edgeParticles = this._edgeForParticlesMesh ? createAboutEdgeParticles(this._edgeForParticlesMesh, this._materialsConfig.edgeParticles) : null;

				this._outerCellScatter?.dispose();
				this._outerCellScatter = createAboutOuterCellScatter(model, this._materialsConfig.outerCellScatter);
				this._outerCellScatter.setStoryProgress(this._readAboutStoryProgress());

				this._frontAdvance?.dispose();
				this._frontAdvance = createAboutFrontAdvance(model, this._materialsConfig.frontAdvance, { getCameraPosition: () => this._getDefaultCameraPosition() });
				this._frontAdvance.setStoryProgress(this._readAboutStoryProgress());

				this._backRetreat?.dispose();
				this._backRetreat = createAboutBackRetreat(model, this._materialsConfig.backRetreat, { getCameraPosition: () => this._getDefaultCameraPosition() });
				this._backRetreat.setStoryProgress(this._readAboutStoryProgress());

				this._heartScale?.dispose();
				this._heartScale = createAboutHeartScale(model, this._materialsConfig.heartScale);
				this._heartScale.setStoryProgress(this._readAboutStoryProgress());
				this._modelPose?.setStoryProgress?.(this._readAboutStoryProgress());
				this._applyStoryProgress(this._readAboutStoryProgress());
				return true;
			})
			.catch((error) => {
				console.error("[AboutScene] AboutUsModel load failed", error);
				return false;
			});
	}

	/**
	 * Camera from ABOUT_STAGE_POSES (Blender export) as absolute world pose.
	 * Short/mobile only nudge FOV/distance from layout extras — position stays authored.
	 */
	_resolveStageCamera() {
		const pose = sampleAboutStagePose(this._storyProgress).camera;
		const layout = this._layout;
		const desktop = ABOUT_LAYOUT.desktop;
		const zScale = desktop.cameraZ > 1e-4 ? layout.cameraZ / desktop.cameraZ : 1;
		return {
			x: pose.x,
			y: pose.y,
			z: pose.z * zScale,
			lookAtX: pose.lookAtX,
			lookAtY: pose.lookAtY,
			lookAtZ: pose.lookAtZ,
			fov: pose.fov + (layout.fov - desktop.fov),
			rotX: pose.rotX,
			rotY: pose.rotY,
			rotZ: pose.rotZ,
			useLookAt: pose.useLookAt !== false,
		};
	}

	_getLookAt() {
		const cam = this._resolveStageCamera();
		return new THREE.Vector3(cam.lookAtX, cam.lookAtY, cam.lookAtZ);
	}

	_getDefaultCameraPosition() {
		const cam = this._resolveStageCamera();
		return new THREE.Vector3(cam.x, cam.y, cam.z);
	}

	/**
	 * Spin model in place (pose position fixed) — same relative view as a camera
	 * orbiting around it. Authored camera pose stays untouched.
	 * Call after stage pose has been written to modelRoot.
	 */
	_applyPointerModelParallax() {
		const cfg = ABOUT_MODEL_PARALLAX;
		const scale = this._viewport.mobile || this._viewport.short ? (cfg.mobileScale ?? 0.35) : 1;
		const yaw = this._smoothPointer.x * THREE.MathUtils.degToRad((cfg.yawDeg ?? 0) * scale);
		const pitch = this._smoothPointer.y * THREE.MathUtils.degToRad((cfg.pitchDeg ?? 0) * scale);
		if (Math.abs(yaw) < 1e-8 && Math.abs(pitch) < 1e-8) return;

		/** World yaw/pitch premultiplied onto pose — cursor right → model yaws left. */
		this._parallaxYawQ.setFromAxisAngle(this._parallaxAxisY, -yaw);
		this._parallaxPitchQ.setFromAxisAngle(this._parallaxAxisX, -pitch);
		this.modelRoot.quaternion.premultiply(this._parallaxPitchQ).premultiply(this._parallaxYawQ);
	}

	applyCamera(camera, frame) {
		const cam = this._resolveStageCamera();
		const sceneProgress = frame?.sceneProgress ?? 0;
		const aspect = camera.aspect > 1e-4 ? camera.aspect : 16 / 9;
		/** Pose FOV is Blender horizontal; Three needs vertical. */
		const verticalFov = blenderHorizontalFovToThreeVertical(cam.fov, aspect);

		if (cam.useLookAt) {
			applySceneProgressToCamera(
				camera,
				{
					position: [cam.x, cam.y, cam.z],
					lookAt: [cam.lookAtX, cam.lookAtY, cam.lookAtZ],
					fov: verticalFov,
					scrollY: CAMERA_SCROLL_Y,
					scrollZ: CAMERA_SCROLL_Z,
				},
				sceneProgress,
			);
			return;
		}

		const p = Number.isFinite(sceneProgress) ? sceneProgress : 0;
		camera.position.set(cam.x, cam.y - p * CAMERA_SCROLL_Y, cam.z - p * CAMERA_SCROLL_Z);
		camera.rotation.set(THREE.MathUtils.degToRad(cam.rotX), THREE.MathUtils.degToRad(cam.rotY), THREE.MathUtils.degToRad(cam.rotZ), "YXZ");
		camera.fov = verticalFov;
		camera.updateProjectionMatrix();
	}

	/**
	 * Same ring rules as home/hub:
	 * - leave-pose (`became-previous`) → story at end (live for contacts reverse)
	 * - ring dormant (next-*) → story at start
	 * - never wipe camera from lifecycle (sceneProgress + applyCamera own pose)
	 */
	resetCarouselState(ctx = {}) {
		const leavePose = isLeavePoseReason(ctx.reason);
		const ringDormant = isRingDormantReason(ctx.reason);
		if (!leavePose && !ringDormant) {
			return;
		}

		const entryStory = leavePose ? ABOUT_STAGE_COUNT : 0;
		resetAboutExperienceState({ entryStory });
		this._applyStoryProgress(entryStory);
	}

	playEnterAnimation() {}

	setRouteState({ currentPage, teleportPage, routePhase }) {
		const currentMatches = isAboutPath(currentPage);
		const teleportMatches = isAboutPath(teleportPage);
		this._routeActive = currentMatches || (routePhase !== "idle" && teleportMatches);
	}

	setMixPreviewActive(active) {
		this._mixPreview = active === true;
	}

	onViewportResize(width, height) {
		if (!(width > 0) || !(height > 0)) return;
		this._viewport.width = width;
		this._viewport.height = height;
		this._viewport.mobile = width <= 768 || width / height < 0.82;
		this._viewport.short = !this._viewport.mobile && height <= 720;
		this._applyResponsiveTransform();
	}

	resize(width, height) {
		this.onViewportResize(width, height);
	}

	_applyResponsiveTransform() {
		const { mobile, short } = this._viewport;
		this._layout = mobile ? ABOUT_LAYOUT.mobile : short ? ABOUT_LAYOUT.short : ABOUT_LAYOUT.desktop;
		const layout = this._layout;
		this.root.position.set(layout.rootX, layout.rootY, 0);
		this.root.scale.setScalar(layout.rootScale);
	}

	update(delta, frame) {
		if (this._disposed) return;
		const safeDelta = THREE.MathUtils.clamp(Number(delta) || 0, 0, 0.1);
		this._elapsed += safeDelta;

		/**
		 * Parallax ignores left menu / chrome blockers and Y-band handoff zeros.
		 * Hold last aim while blocked — do not ease back to default or snap to menu X.
		 */
		const pointerBlocked = frame?.pointerBlocked === true || frame?.interactionEnabled === false;
		if (!pointerBlocked) {
			const pointer = frame?.pointer ?? { x: 0, y: 0 };
			const smooth = ABOUT_MODEL_PARALLAX.smooth ?? 0.08;
			this._smoothPointer.x += ((pointer.x ?? 0) - this._smoothPointer.x) * smooth;
			this._smoothPointer.y += ((pointer.y ?? 0) - this._smoothPointer.y) * smooth;
		}

		this._particles?.update(this._elapsed, safeDelta);
		this._materialsByKey?.frontGlass?.userData?.setTime?.(this._elapsed);
		this._materialsByKey?.sideHud?.userData?.setTime?.(this._elapsed);
		this._frontBackSide?.material?.userData?.setTime?.(this._elapsed);
		this._backPlate?.material?.userData?.setTime?.(this._elapsed);
		this._backBackSide?.material?.userData?.setTime?.(this._elapsed);
		this._materialsByKey?.heartBody?.userData?.setTime?.(this._elapsed);
		this._materialsByKey?.outerCell?.userData?.setTime?.(this._elapsed);
		this._materialsByKey?.NeonMaterial?.userData?.setTime?.(this._elapsed);
		this._edgeParticles?.addTime?.(safeDelta);

		const storyProgress = this._readAboutStoryProgress();
		if (storyProgress !== this._storyProgress || this._outerCellScatter || this._frontAdvance || this._backRetreat || this._heartScale || this._modelPose) {
			this._applyStoryProgress(storyProgress);
		}
		/** After pose write — spin in place without moving the model center. */
		this._applyPointerModelParallax();

		const carousel = getSceneCarousel();
		// Ring scroll does not set case-only mixPreview. Arm while About is actually
		// in a hex wipe (not merely "next" at portfolio rest — that is always true).
		const mixIds = carousel?.getMixSourceTargetIds?.() ?? {};
		const mixProgress = Math.abs(Number(carousel?.progress) || 0);
		const aboutInCarouselMix = mixProgress > 0.0001 && (mixIds.sourceId === "about" || mixIds.targetId === "about");
		const hudActive =
			this._routeActive ||
			this._mixPreview ||
			aboutInCarouselMix ||
			carousel?.currentId === "about" ||
			store.sceneCarouselCurrentId === "about" ||
			isAboutPanelHudRevealExiting();
		if (hudActive) {
			// Route-active is enough — do not wait for carousel.currentId === "about"
			// (deep-link / displayPathname lag can leave the ring on home).
			if (!isAboutPanelHudVisitArmed()) {
				armAboutPanelHudForRoute(this._storyProgress);
			} else if (!isAboutExperienceRuntimeActive()) {
				// Hex mix-preview before runtime owns the spring — sync mix only.
				syncAboutPanelHudFromStory(this._storyProgress);
			}
		}
		syncAboutPanelHud(this.panelHud, { active: hudActive });
	}

	dispose() {
		if (this._disposed) return;
		this._disposed = true;
		if (this._edgeRebuildRaf) {
			cancelAnimationFrame(this._edgeRebuildRaf);
			this._edgeRebuildRaf = 0;
		}
		disposeCaseStudyPanelHud(this.panelHud);
		this.panelHud = null;
		this._particles?.dispose();
		this._particles = null;
		this._outerCellScatter?.dispose();
		this._outerCellScatter = null;
		this._frontAdvance?.dispose();
		this._frontAdvance = null;
		this._backRetreat?.dispose();
		this._backRetreat = null;
		this._heartScale?.dispose();
		this._heartScale = null;
		this._modelPose?.dispose();
		this._modelPose = null;
		this._frontPlate = null;
		this._backPlate = null;
		this._frontBackSide = null;
		this._backBackSide = null;
		this._edgeParticles?.dispose();
		this._edgeParticles = null;
		this._edgeForParticlesMesh = null;
		this._insideLarge = null;
		this._materialsByKey = null;
		disposeObject3D(this._model, { skipMaterials: true });
		for (const material of this._ownedMaterials) {
			material.dispose();
		}
		this._ownedMaterials = [];
		this._model = null;
		this._haloGeo?.dispose();
		this._haloMat?.dispose();
		this.threeScene.clear();
		this.threeScene = null;
	}
}
