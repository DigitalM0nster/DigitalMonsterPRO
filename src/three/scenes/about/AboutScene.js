import * as THREE from "three";
import { createGLTFLoader } from "@/three/assets/gltfLoader.js";
import { applySceneProgressToCamera } from "../utils/applySceneProgressToCamera.js";
import {
	ABOUT_COLORS,
	ABOUT_LAYOUT,
	ABOUT_LIGHTS,
	ABOUT_MATERIALS,
	ABOUT_MODEL_TARGET_SIZE,
	ABOUT_MODEL_URL,
	ABOUT_PARTICLES,
	cloneAboutMaterialsConfig,
} from "./aboutSceneConfig.js";
import { applyAboutModelMaterials, applyAboutMaterialsConfig } from "./aboutMaterials.js";
import { createAboutInsideParticles } from "./aboutInsideParticles.js";
import { createAboutEdgeParticles } from "./aboutEdgeParticles.js";
import { setAboutDissolveProgress } from "./aboutDissolveShader.js";
import { resetAboutExperienceState } from "@/pages/about/aboutExperienceRuntime.js";
import { ABOUT_STAGE_COUNT } from "@/pages/about/states.js";
import { aboutStoryToModelProgress, aboutStoryToFrontDissolve } from "@/pages/about/aboutStoryTiming.js";
import { isAboutPanelHudRevealExiting } from "@/pages/about/aboutPanelHudReveal.js";
import { armAboutPanelHudForRoute, isAboutPanelHudVisitArmed, syncAboutPanelHudFromStory } from "@/pages/about/aboutPanelHudStory.js";
import { isAboutExperienceRuntimeActive } from "@/pages/about/aboutExperienceRuntime.js";
import { store } from "@/app/store.jsx";
import { createCaseStudyPanelHud, disposeCaseStudyPanelHud, syncAboutPanelHud } from "@/three/scenes/portfolio/caseStudyText/caseStudyPanelHudHost.js";
import { getSceneCarousel } from "@/three/render/transition/carouselPage.js";
import { isLeavePoseReason, isRingDormantReason } from "@/three/scenes/lifecycle/sceneLifecycle.js";
import { computeAboutContentBox, normalizeAboutGltfScene } from "./normalizeAboutGltfScene.js";
import {
	blenderHorizontalFovToThreeVertical,
	createAboutGltfStoryAnimRig,
} from "./aboutGltfStoryAnimRig.js";
import { AboutEpicTextController } from "./aboutEpicText/AboutEpicTextController.js";
import { normalizeSiteLocale } from "@/functions/siteLocale.js";

const ABOUT_PATH = "/about";
/**
 * About exception (SCROLL_PARALLAX.md): no vertical page-lift on leave.
 * About→contacts exit is epic-text mosaic dissolve, not model rising.
 */
const CAMERA_SCROLL_Y = 0;
const CAMERA_SCROLL_Z = 0.35;

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
 * Model / camera / lookAt motion = GLB clips only (Blender).
 * Shader dissolves + particles follow story; subtle content-group motion wraps
 * the authored model clips without changing camera helpers or mesh tracks.
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
		this._gltfStoryAnim = null;
		this._epicText = null;
		this._frontPlate = null;
		this._backPlate = null;
		this._frontBackSide = null;
		this._backBackSide = null;
		this._scrollProgress = 0;
		this._storyProgress = 0;
		this._dragOrbitTarget = new THREE.Vector3();
		this.dragOrbitAroundTarget = true;
		this._modelPivot = null;
		this._modelPivotLocal = new THREE.Vector3();
		this._contentMotionRoot = null;
		this._motionCenter = new THREE.Vector3();
		this._motionOffset = new THREE.Vector3();
		this._motionTime = 0;
		this._motionScale = 0;
		this._pointerTiltX = 0;
		this._pointerTiltY = 0;
		this._insideLarge = null;
		this._edgeForParticlesMesh = null;
		this._edgeRebuildRaf = 0;
		this._viewport = { width: 1440, height: 900, mobile: false, short: false };
		this._layout = ABOUT_LAYOUT.desktop;

		this._buildLights();
		this._buildHalo();

		this.panelHud = createCaseStudyPanelHud(this.threeScene);
		this.panelHud.setUseAboutBridge(true);

		this.readyPromise = this._loadModel().then((modelOk) => modelOk !== false);
		this._applyResponsiveTransform();
	}

	getAboutMaterialsConfig() {
		return this._materialsConfig;
	}

	beginWarmupDraw() {
		// Later story stages are hidden at rest, but need a real draw before Start.
		const nodes = new Set();
		const objects = [this._particles?.lines, this._particles?.points, ...(this._epicText?.getWarmupObjects() ?? [])];
		for (const object of objects) {
			for (let node = object; node && node !== this.threeScene; node = node.parent) nodes.add(node);
		}
		const token = [...nodes].map(node => ({ node, visible: node.visible, frustumCulled: node.frustumCulled }));
		// A deep-link/hex warm pose may already have dissolved these surfaces.
		// Keep their programs/geometry prepared even when runtime omits the empty draw.
		const materials = new Set([
			this._materialsByKey?.frontGlass, this._materialsByKey?.outerCell,
			this._materialsByKey?.OuterCellSeam, this._materialsByKey?.outerCellSeam,
			this._frontBackSide?.material,
		].filter(Boolean));
		token.dissolveMaterials = [...materials].map(material => ({ material, visible: material.visible }));
		this._warmupDrawNodes = token;
		return token;
	}

	_showWarmupDrawNodes() {
		// The regular story update hides them again; override only for the warm draw.
		for (const { node } of this._warmupDrawNodes ?? []) {
			node.visible = true;
			node.frustumCulled = false;
		}
		for (const { material } of this._warmupDrawNodes?.dissolveMaterials ?? []) material.visible = true;
	}

	endWarmupDraw(token) {
		this._warmupDrawNodes = null;
		for (const { node, visible, frustumCulled } of token ?? []) {
			node.visible = visible;
			node.frustumCulled = frustumCulled;
		}
		for (const { material, visible } of token?.dissolveMaterials ?? []) material.visible = visible;
	}

	/** Structural knobs rebuild the lattice; the rest only touch uniforms. */
	_edgeParticlesLayoutKey(cfg = {}) {
		return [cfg.rings, cfg.yLayers, cfg.spokes, cfg.innerScale, cfg.loopSegments, cfg.travelers].join("|");
	}

	/** Drive edge lattice visibility (mesh orientation from GLB). */
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

	/**
	 * About→contacts leave progress (0…1).
	 * Only while actually leaving past story 4 / about-boundary / about→contacts hex.
	 */
	_readAboutForwardLeaveProgress() {
		const raw = Number(this.store?.aboutExperience?.storyProgress);
		if (Number.isFinite(raw) && raw > 4.001) {
			return THREE.MathUtils.clamp(raw - 4, 0, 1);
		}
		const carousel = getSceneCarousel();
		if (!carousel) return 0;
		const progress = Number(carousel.progress) || 0;
		if (carousel.isAboutBoundaryDrive?.() && progress > 0.001) {
			return THREE.MathUtils.clamp(progress, 0, 1);
		}
		const mixIds = carousel.getMixSourceTargetIds?.() ?? {};
		if (
			progress > 0.001
			&& mixIds.sourceId === "about"
			&& mixIds.targetId === "contacts"
		) {
			return THREE.MathUtils.clamp(progress, 0, 1);
		}
		return 0;
	}

	_applyStoryProgress(story) {
		const s = THREE.MathUtils.clamp(Number(story) || 0, 0, 4);
		this._storyProgress = s;
		this._scrollProgress = THREE.MathUtils.clamp(s, 0, 1);
		this._gltfStoryAnim?.setStoryProgress?.(aboutStoryToModelProgress(s));
		/** Text2's opening anchor keeps the front intact; dissolve starts on further scroll. */
		const dissolve = aboutStoryToFrontDissolve(s);
		const dissolveCfg = this._materialsConfig?.stage2Dissolve;
		/** Front = hex (0); OUTER_cell = scan (1); locked after tuning. */
		const frontMode = dissolveCfg?.mode ?? 0;
		const cellMode = dissolveCfg?.cellMode ?? 1;
		/** Back = Energy vapor (anim 4 / mode 3) on stage 2→3 (story 1→2). */
		const backMode = Number.isFinite(dissolveCfg?.backMode) ? dissolveCfg.backMode : 3;
		const backStart = Number.isFinite(dissolveCfg?.backStoryStart) ? dissolveCfg.backStoryStart : 1;
		const backEnd = Math.max(backStart + 1e-4, Number.isFinite(dissolveCfg?.backStoryEnd) ? dissolveCfg.backStoryEnd : 2);
		const backDissolve = THREE.MathUtils.clamp((s - backStart) / (backEnd - backStart), 0, 1);

		const frontU = this._materialsByKey?.frontGlass?.userData?.uniforms;
		const cellU = this._materialsByKey?.outerCell?.userData?.uniforms;
		const cellSeamU = this._materialsByKey?.OuterCellSeam?.userData?.uniforms
			?? this._materialsByKey?.outerCellSeam?.userData?.uniforms;
		const sideU = this._materialsByKey?.sideHud?.userData?.uniforms;
		setAboutDissolveProgress(frontU, dissolve);
		setAboutDissolveProgress(cellU, dissolve);
		setAboutDissolveProgress(cellSeamU, dissolve);
		setAboutDissolveProgress(sideU, 0);
		const frontSideU = this._frontBackSide?.material?.userData?.uniforms;
		setAboutDissolveProgress(frontSideU, dissolve);
		if (frontU?.uDissolveMode) frontU.uDissolveMode.value = frontMode;
		if (cellU?.uDissolveMode) cellU.uDissolveMode.value = cellMode;
		if (cellSeamU?.uDissolveMode) cellSeamU.uDissolveMode.value = cellMode;
		if (frontSideU?.uDissolveMode) frontSideU.uDissolveMode.value = frontMode;

		const backU = this._backPlate?.material?.userData?.uniforms ?? this._backPlate?.material?.uniforms;
		const backSideU = this._backBackSide?.material?.userData?.uniforms ?? this._backBackSide?.material?.uniforms;
		setAboutDissolveProgress(backU, backDissolve);
		setAboutDissolveProgress(backSideU, backDissolve);
		if (backU?.uDissolveMode) backU.uDissolveMode.value = backMode;
		if (backSideU?.uDissolveMode) backSideU.uDissolveMode.value = backMode;

		for (const key of ["outerCell", "OuterCell", "OuterCellSeam", "outerCellSeam"]) {
			const mat = this._materialsByKey?.[key];
			if (!mat) continue;
			mat.depthWrite = dissolve < 0.85;
			mat.transparent = true;
			mat.visible = dissolve < 1;
		}
		// At 1 the dissolve shader discards every fragment. Stop submitting those
		// surfaces, but retain their nodes/children and restore on the first reverse frame.
		if (this._materialsByKey?.frontGlass) this._materialsByKey.frontGlass.visible = dissolve < 1;
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
			this._frontBackSide.material.visible = dissolve < 1;
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
		 * Blue Edge lattice: dissolve stage 2.0→3.0 (story 1→2).
		 */
		const pcbCfg = ABOUT_PARTICLES;
		const revealStart = pcbCfg.revealStoryStart ?? 1.5;
		const revealEnd = Math.max(revealStart + 1e-4, pcbCfg.revealStoryEnd ?? 2);
		const pcbReveal = THREE.MathUtils.clamp((s - revealStart) / (revealEnd - revealStart), 0, 1);
		const pcbAppearMode = pcbCfg.appearMode ?? 4;
		this._particles?.setRevealProgress?.(pcbReveal, pcbAppearMode);

		/** Stage 3: soft-clear PCB particles around AboutEpicTextPlane. */
		const clearStart = pcbCfg.textZoneClearStoryStart ?? 3;
		const clearEnd = Math.max(clearStart + 1e-4, pcbCfg.textZoneClearStoryEnd ?? 3.45);
		const zoneClear = THREE.MathUtils.clamp((s - clearStart) / (clearEnd - clearStart), 0, 1);
		this._particles?.setTextZoneClearProgress?.(zoneClear, this._model);
		this._epicText?.setStoryProgress?.(s, this._readAboutForwardLeaveProgress());

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

				/** Keep AboutModel / LookAt / Camera targets — story scrubbed from GLB clips. */
				const model = normalizeAboutGltfScene(gltf.scene);
				this._gltfStoryAnim?.dispose?.();
				this._gltfStoryAnim = createAboutGltfStoryAnimRig(model, gltf.animations);

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

				if (ABOUT_MODEL_TARGET_SIZE > 0) {
					const initialBox = computeAboutContentBox(model);
					const initialSize = initialBox.getSize(new THREE.Vector3());
					const scale = ABOUT_MODEL_TARGET_SIZE / Math.max(initialSize.x, initialSize.y, initialSize.z, 0.001);
					model.scale.setScalar(scale);
					model.updateMatrixWorld(true);
				}

				this.modelRoot.add(model);
				this._model = model;
				this._contentMotionRoot = model.getObjectByName("AboutUsContent");
				this._modelPivot = model.getObjectByName("AboutModel") ?? model;
				// Measure once under the curtain, excluding camera helpers and epic text.
				// The cached local centre then follows the authored model pose in O(1).
				const contentBox = computeAboutContentBox(model);
				contentBox.getCenter(this._modelPivotLocal);
				this._modelPivot.worldToLocal(this._modelPivotLocal);
				const contentSize = contentBox.getSize(this._motionOffset);
				this._motionScale = Math.max(contentSize.x, contentSize.y, contentSize.z) / Math.max(this.root.scale.x, 0.001);
				this._frontPlate = model.getObjectByName("Front") ?? null;
				this._backPlate = model.getObjectByName("Back") ?? null;
				this._frontBackSide = model.getObjectByName("FrontBackSide") ?? null;
				this._backBackSide = model.getObjectByName("BackBackSide") ?? null;

				/** Procedural FX only — mesh TRS comes from GLB clips. */
				this._particles?.dispose();
				this._particles = this._insideLarge
					? createAboutInsideParticles(this._insideLarge, {
							mobile: this._viewport.mobile,
							silhouetteMesh: this._insideLarge,
						})
					: null;
				this._edgeParticles?.dispose();
				this._edgeParticles = this._edgeForParticlesMesh ? createAboutEdgeParticles(this._edgeForParticlesMesh, this._materialsConfig.edgeParticles) : null;

				this._epicText?.dispose();
				this._epicText = new AboutEpicTextController();
				return this._epicText.attach(model, store.siteLocale).then(() => {
					if (this._disposed) return false;
					this._applyStoryProgress(this._readAboutStoryProgress());
					return true;
				});
			})
			.catch((error) => {
				console.error("[AboutScene] AboutUsModel load failed", error);
				return false;
			});
	}

	/**
	 * Camera / lookAt from GLB story clips.
	 * Short/mobile only nudge FOV/distance from layout extras.
	 */
	_resolveStageCamera() {
		const pose = this._gltfStoryAnim?.sampleCamera?.()
			?? { x: 0, y: 1.2, z: 8.2, lookAtX: 0, lookAtY: 0, lookAtZ: 0, fov: 34, rotX: 0, rotY: 0, rotZ: 0, useLookAt: true, fovIsVertical: false };
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
			fovIsVertical: pose.fovIsVertical === true,
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

	isDragOrbitEnabled() {
		return true;
	}

	getDragOrbitTarget(_camera, frame) {
		if (this._modelPivot) {
			return this._modelPivot.localToWorld(this._dragOrbitTarget.copy(this._modelPivotLocal));
		}
		const cam = this._resolveStageCamera();
		const progress = Number.isFinite(frame?.sceneProgress) ? frame.sceneProgress : 0;
		return this._dragOrbitTarget.set(
			cam.lookAtX,
			cam.lookAtY - progress * CAMERA_SCROLL_Y,
			cam.lookAtZ,
		);
	}

	applyCamera(camera, frame) {
		const cam = this._resolveStageCamera();
		const sceneProgress = frame?.sceneProgress ?? 0;
		const aspect = camera.aspect > 1e-4 ? camera.aspect : 16 / 9;
		/** Fallback pose FOV is Blender horizontal; glTF PerspectiveCamera.fov is already vertical. */
		const verticalFov = cam.fovIsVertical
			? cam.fov
			: blenderHorizontalFovToThreeVertical(cam.fov, aspect);

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

	_updateModelMotion(delta, frame) {
		const motion = this._contentMotionRoot;
		if (!motion || !this._modelPivot || !this.store.appStarted) return;
		const active = this._routeActive || this._mixPreview || frame?.sceneRole === "current"
			|| Math.abs(Number(frame?.carouselProgress) || 0) > 0.0001;
		if (!active) return;
		const dt = Math.max(0, Math.min(0.05, delta));
		this._motionTime += dt;
		const pointerAllowed = !frame?.pointerBlocked && !frame?.pointerDown;
		const px = pointerAllowed ? THREE.MathUtils.clamp(Number(frame?.pointer?.x) || 0, -1, 1) : 0;
		const py = pointerAllowed ? THREE.MathUtils.clamp(Number(frame?.pointer?.y) || 0, -1, 1) : 0;
		this._pointerTiltX = THREE.MathUtils.damp(this._pointerTiltX, -py * 0.018, 3, dt);
		this._pointerTiltY = THREE.MathUtils.damp(this._pointerTiltY, px * 0.025, 3, dt);

		// Rotate content around its own animated centre; camera/look-at helpers
		// remain outside this group and keep their original story trajectory.
		this._modelPivot.localToWorld(this._motionCenter.copy(this._modelPivotLocal));
		motion.worldToLocal(this._motionCenter);
		const t = this._motionTime;
		motion.rotation.set(
			this._pointerTiltX + Math.sin(t * 0.58) * 0.007,
			this._pointerTiltY + Math.sin(t * 0.43) * 0.009,
			Math.sin(t * 0.37) * 0.004,
		);
		motion.position.copy(this._motionCenter).sub(this._motionOffset.copy(this._motionCenter).applyQuaternion(motion.quaternion));
		motion.position.x += Math.sin(t * 0.41) * this._motionScale * 0.002;
		motion.position.y += Math.sin(t * 0.67) * this._motionScale * 0.004;
	}

	update(delta, frame) {
		if (this._disposed) return;
		const safeDelta = THREE.MathUtils.clamp(Number(delta) || 0, 0, 0.1);
		this._elapsed += safeDelta;

		this._particles?.update(this._elapsed, safeDelta);
		this._materialsByKey?.frontGlass?.userData?.setTime?.(this._elapsed);
		this._materialsByKey?.sideHud?.userData?.setTime?.(this._elapsed);
		this._frontBackSide?.material?.userData?.setTime?.(this._elapsed);
		this._backPlate?.material?.userData?.setTime?.(this._elapsed);
		this._backBackSide?.material?.userData?.setTime?.(this._elapsed);
		this._materialsByKey?.heartBody?.userData?.setTime?.(this._elapsed);
		this._materialsByKey?.outerCell?.userData?.setTime?.(this._elapsed);
		this._materialsByKey?.OuterCellSeam?.userData?.setTime?.(this._elapsed);
		this._materialsByKey?.outerCellSeam?.userData?.setTime?.(this._elapsed);
		this._materialsByKey?.NeonMaterial?.userData?.setTime?.(this._elapsed);
		this._edgeParticles?.addTime?.(safeDelta);

		const storyProgress = this._readAboutStoryProgress();
		if (storyProgress !== this._storyProgress || this._gltfStoryAnim) {
			this._applyStoryProgress(storyProgress);
		}
		this._updateModelMotion(safeDelta, frame);

		const pointer = frame?.pointerBlocked ? { x: 0, y: 0 } : (frame?.pointer ?? { x: 0, y: 0 });
		this._epicText?.update?.(this._elapsed, pointer, safeDelta, normalizeSiteLocale(store.siteLocale));

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
		this._showWarmupDrawNodes();
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
		this._gltfStoryAnim?.dispose?.();
		this._gltfStoryAnim = null;
		this._epicText?.dispose();
		this._epicText = null;
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
		this._modelPivot = null;
		this._contentMotionRoot = null;
		this._haloMat?.dispose();
		this.threeScene.clear();
		this.threeScene = null;
	}
}
