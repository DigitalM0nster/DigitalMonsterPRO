import * as THREE from "three";
import { easing } from "maath";
import { createGLTFLoader, enrichGLTFResult } from "@/three/assets/gltfLoader.js";
import { ROUTE_TRANSITION_ENTER_MS } from "@/config/routeTransition.js";
import { restoreRootForShow } from "@/three/scenes/utils/sceneRoot.js";
import { Case1RingDevTools } from "@/three/dev/Case1RingDevTools.js";
import {
	createCaseStudyPanelHud,
	disposeCaseStudyPanelHud,
	syncCaseStudyPanelHud,
} from "@/three/scenes/portfolio/caseStudyText/caseStudyPanelHudHost.js";
import { createCaseSceneLifecycle } from "@/three/scenes/portfolio/caseLifecycle/caseSceneLifecycle.js";
import { isCase1Path } from "./case1Config.js";
import { case1RingConfig, cloneCase1RingConfig } from "./case1RingConfig.js";
import {
	applyCase1RingFadeUniforms,
	createCase1RingFadeMaterial,
	resolveCase1RingLayerStyle,
} from "./case1RingFadeMaterial.js";

const CASE_SCENE_ID = "case01";
const DESKTOP_ROOT_SCALE = 1.1;
const MOBILE_ROOT_SCALE = 0.7;

const LOGO_NODE_NAMES = [
	"logoCircle",
	"logoCircleContour",
	"logoFire",
	"logoFireContour",
	"separator",
	"numberFifty",
	"numberFiftyContour",
];

/** ring_test.glb: R1 яркий белый, R2 мягкий белый, R3 тусклый синий с затуханием. */
const RING_LAYER_DEFS = [
	{ name: "R1", speedKey: "speedR1" },
	{ name: "R2", speedKey: "speedR2" },
	{ name: "R3", speedKey: "speedR3" },
];

/**
 * Кейс НИПИГАЗ (/portfolio/01): ring_test.glb + GLB-логотип.
 * Dev: клавиша 8 / ?case1Dev=1
 */
export class Case1Scene {
	constructor(renderer, store) {
		this.renderer = renderer;
		this.store = store;

		this.threeScene = new THREE.Scene();
		this.root = new THREE.Group();
		this.threeScene.add(this.root);

		this.case1Model = new THREE.Group();
		this.case1Model.scale.setScalar(0.275);
		// Desktop rest pose — avoid first-frame jump 0 → -0.3 on hex enter.
		this.case1Model.position.set(0, -0.3, 0);
		this.root.position.set(1.7, 0, 0);
		this.root.add(this.case1Model);

		this.nipigasCircles = new THREE.Group();
		this.case1Model.add(this.nipigasCircles);

		this.nipigasLogo = new THREE.Group();
		this.nipigasLogo.scale.setScalar(0.75);
		this.case1Model.add(this.nipigasLogo);

		/** @type {THREE.Group | null} */
		this.ringAssembly = null;
		/** @type {{ name: string, speedKey: string, spinner: THREE.Object3D, materials: THREE.Material[] }[]} */
		this.ringSpins = [];
		this.ringConfig = cloneCase1RingConfig();

		this.directionalLight = new THREE.DirectionalLight(0xffffff, 1);
		this.directionalLight.position.set(-5, 13.5, 9);
		this.threeScene.add(new THREE.AmbientLight(0xffffff, 0.45));
		this.threeScene.add(this.directionalLight);

		this.loaded = false;
		this.showCase = false;
		this.activePage = false;
		this.enterTimer = null;
		this.exitHideComplete = false;
		this.pointerDown = false;
		this._mixPreview = false;
		this._allowExitOverlay = true;
		/** Snap root/model/camera to idle case pose once (hex enter / route wake). */
		this._poseNeedsSnap = false;

		this.disposables = [];

		/** Live radius grain blur (скролл → 0…blurRadiusMax). */
		this.grainBlurRadius = { current: 0 };

		this.ringDevTools = import.meta.env.DEV ? new Case1RingDevTools(this) : null;

		/** Panel HUD: hex → models RT; idle → after-bloom screen overlay (sharp). */
		this.panelHud = createCaseStudyPanelHud(this.threeScene);

		this.lifecycle = createCaseSceneLifecycle(this, {
			sceneId: CASE_SCENE_ID,
			matchPage: isCase1Path,
			getRoot: () => this.root,
			getStore: () => this.store,
			getPanelHud: () => this.panelHud,
			isLoaded: () => this.loaded,
			hideScale: 0,
			hooks: {
				onFreshEnter: () => {
					this.grainBlurRadius.current = 0;
				},
				onEnterShow: () => {
					this._scheduleActivate();
				},
				onMixPreviewShow: () => {
					this._snapPresentationPose();
					this._poseNeedsSnap = true;
				},
				onExitHold: (frame) => {
					const viewportWidth = frame?.viewportWidth ?? window.innerWidth;
					this._holdPresentationScale(viewportWidth);
					this._applyCaseCamera(frame?.camera ?? null);
				},
				onHide: () => {
					this._clearEnterTimer();
					this._poseNeedsSnap = false;
				},
			},
		});

		this.lifecycle.hideRoot();
		this._loadAssets();
	}

	getRingConfig() {
		return this.ringConfig;
	}

	applyRingConfig(config = this.ringConfig) {
		this.ringConfig = cloneCase1RingConfig(config);
		Object.assign(case1RingConfig, this.ringConfig);

		if (this.nipigasCircles) {
			this.nipigasCircles.scale.setScalar(this.ringConfig.scale);
		}

		if (this.ringAssembly) {
			this.ringAssembly.rotation.set(this.ringConfig.tiltX, this.ringConfig.tiltY, this.ringConfig.tiltZ);
		}

		for (const spin of this.ringSpins) {
			spin.speed = this.ringConfig[spin.speedKey] ?? spin.speed;
			for (const material of spin.materials) {
				if (material.userData?.isCase1RingFade) {
					applyCase1RingFadeUniforms(material, this.ringConfig, spin.name);
				}
			}
		}
	}

	_loadAssets() {
		const gltfLoader = createGLTFLoader();

		Promise.all([
			gltfLoader.loadAsync("/models/case1/NipigasLogoModel.glb"),
			gltfLoader.loadAsync("/models/case1/ring_test.glb"),
		])
			.then(([logoGltfRaw, ringsGltfRaw]) => {
				if (!this.threeScene) {
					return;
				}

				const logoGltf = enrichGLTFResult(logoGltfRaw);
				this._buildRings(ringsGltfRaw.scene);
				this._buildLogo(logoGltf);
				this.applyRingConfig(this.ringConfig);
				this.ringDevTools?.bindScene(this);
				this.loaded = true;

				// setRouteState/playEnter мог вызвать до load — без повторного wake сцена вечно scale=0.
				if (this._mixPreview) {
					this.lifecycle.setMixPreviewActive(true);
				} else if (this.showCase) {
					this.lifecycle.setEnterPending(true);
					this.playEnterAnimation();
				}
			})
			.catch((err) => {
				console.error("[Case1Scene] load failed", err);
			});
	}

	_buildRings(ringsScene) {
		const layers = [];
		for (const def of RING_LAYER_DEFS) {
			const ring = ringsScene.getObjectByName(def.name);
			if (!ring) {
				if (import.meta.env.DEV) {
					console.warn("[Case1Scene] ring layer not found:", def.name);
				}
				continue;
			}
			// R3 в GLB со scale ≈2.55 — не сбрасывать authored scale.
			const authoredScale = ring.scale.clone();
			ring.position.set(0, 0, 0);
			ring.rotation.set(0, 0, 0);
			ring.scale.copy(authoredScale);
			layers.push({ def, ring });
		}

		if (layers.length === 0) {
			this.ringSpins = [];
			this.ringAssembly = null;
			return;
		}

		// Считаем общий центр: в GLB геометрия и node.translation сильно сдвинуты.
		const measureRoot = new THREE.Group();
		for (const { ring } of layers) {
			measureRoot.add(ring);
		}
		measureRoot.updateMatrixWorld(true);
		const center = new THREE.Box3().setFromObject(measureRoot).getCenter(new THREE.Vector3());

		const assembly = new THREE.Group();
		assembly.name = "ringTestAssembly";
		this.nipigasCircles.add(assembly);
		this.ringAssembly = assembly;

		this.ringSpins = [];
		for (const { def, ring } of layers) {
			const materials = this._styleGlbRing(ring, def.name);
			const spinner = new THREE.Group();
			spinner.name = `${def.name}Spin`;
			spinner.add(ring);
			ring.position.copy(center).negate();
			assembly.add(spinner);
			this.ringSpins.push({
				name: def.name,
				speedKey: def.speedKey,
				spinner,
				materials,
				speed: this.ringConfig[def.speedKey] ?? 0,
			});
		}
	}

	/** R1/R2 белые, R3 тусклый синий + depth fade. */
	_styleGlbRing(ring, layerName) {
		const materials = [];
		const style = resolveCase1RingLayerStyle(this.ringConfig, layerName);

		const styleObject = (object) => {
			if (object.geometry) {
				this.disposables.push(object.geometry);
			}

			if (!object.isMesh && !object.isLine && !object.isLineSegments) {
				return;
			}

			const material = createCase1RingFadeMaterial({
				color: style.color,
				opacity: object.isMesh ? style.opacity : Math.min(1, style.opacity + 0.05),
				coreColor: style.coreColor,
				coreMix: style.coreMix,
				bloomBoost: style.bloomBoost,
				depthNear: this.ringConfig.depthNear,
				depthFar: this.ringConfig.depthFar,
				fadeNear: style.fadeNear,
				fadeFar: style.fadeFar,
				depthPower: this.ringConfig.depthPower,
			});
			this.disposables.push(material);
			materials.push(material);
			object.material = material;
			object.frustumCulled = false;
			const isR1 = layerName === "R1";
			const isR3 = layerName === "R3";
			object.renderOrder = isR1 ? 5 : isR3 ? 2 : 4;
		};

		if (ring.isMesh || ring.isLine || ring.isLineSegments) {
			styleObject(ring);
		}
		ring.traverse((object) => {
			if (object === ring) {
				return;
			}
			styleObject(object);
		});

		return materials;
	}

	_buildLogo(gltf) {
		const contourMat = gltf.materials?.contourMat;
		if (contourMat) {
			contourMat.color.setRGB(0, 1, 2);
			contourMat.emissive.setRGB(0, 1, 2);
			contourMat.emissiveIntensity = 0.9;
			contourMat.toneMapped = false;
		}

		const logoMaterial = new THREE.MeshStandardMaterial({
			color: "#008c95",
			roughness: 0,
			metalness: 1,
			transparent: true,
			opacity: 1,
			depthTest: true,
			depthWrite: true,
			side: THREE.DoubleSide,
			toneMapped: true,
		});
		this.disposables.push(logoMaterial);

		const contourNodes = new Set(["logoCircleContour", "logoFireContour", "numberFiftyContour"]);

		for (const name of LOGO_NODE_NAMES) {
			const source = gltf.nodes?.[name] ?? gltf.scene.getObjectByName(name);
			if (!source?.isMesh) {
				if (import.meta.env.DEV) {
					console.warn("[Case1Scene] mesh not found:", name);
				}
				continue;
			}

			const mesh = source.clone();
			if (!contourNodes.has(name)) {
				mesh.material = logoMaterial;
			}

			this.nipigasLogo.add(mesh);
		}
	}

	/**
	 * Idle presentation pose — must match update() targets so hex
	 * mix does not start at origin and slide into place.
	 * @param {number} [viewportWidth]
	 * @param {THREE.Camera | null} [camera]
	 * @param {{ x?: number, y?: number } | null} [pointer]
	 */
	_snapPresentationPose(
		viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1280,
		camera = null,
		pointer = null,
	) {
		const scroll = this.lifecycle.resolveCameraScroll();
		this.directionalLight.position.set(-5, 13.5, 9);

		if (viewportWidth <= 768) {
			this.root.position.set(0, -0.4, 0);
			this.case1Model.position.set(0, Math.min(scroll * 40, 10), 0);
			this.root.scale.set(MOBILE_ROOT_SCALE, MOBILE_ROOT_SCALE, MOBILE_ROOT_SCALE);
		} else {
			this.root.position.set(1.7, 0, 0);
			this.case1Model.position.set(0, -0.3, 0);
			this.root.scale.set(DESKTOP_ROOT_SCALE, DESKTOP_ROOT_SCALE, DESKTOP_ROOT_SCALE);
		}

		this.root.rotation.set(0, 0, 0);
		const pointerX = pointer?.x ?? 0;
		const pointerY = pointer?.y ?? 0;
		const tilt = this.ringConfig.pointerTilt;
		this.nipigasCircles.rotation.set(pointerY * tilt, pointerX * tilt, 0);
		this.nipigasLogo.rotation.set(0.2 + pointerY * 0.2, -0.5 + pointerX * 0.2, 0);

		if (camera) {
			camera.position.set(0, 0 - scroll * 35, 9);
			camera.lookAt(0, camera.position.y, 0);
		}
	}

	_holdPresentationScale(viewportWidth) {
		if (viewportWidth <= 768) {
			this.root.scale.set(MOBILE_ROOT_SCALE, MOBILE_ROOT_SCALE, MOBILE_ROOT_SCALE);
			this.root.position.set(0, -0.4, 0);
		} else {
			this.root.scale.set(DESKTOP_ROOT_SCALE, DESKTOP_ROOT_SCALE, DESKTOP_ROOT_SCALE);
			this.root.position.set(1.7, 0, 0);
			this.case1Model.position.set(0, -0.3, 0);
		}
	}

	_applyCaseCamera(camera) {
		if (!camera) {
			return;
		}
		const scroll = this.lifecycle.resolveCameraScroll();
		camera.position.set(0, 0 - scroll * 35, 9);
		camera.lookAt(0, camera.position.y, 0);
	}

	_clearEnterTimer() {
		if (this.enterTimer !== null) {
			clearTimeout(this.enterTimer);
			this.enterTimer = null;
		}
	}

	_scheduleActivate() {
		this._clearEnterTimer();
		this.lifecycle.clearExitCameraFreeze();
		this.lifecycle.setActivePage(false);
		this.root.visible = true;
		this.root.scale.set(0, 0, 0);
		restoreRootForShow(this.root);
		this._snapPresentationPose();
		this._poseNeedsSnap = true;

		this.enterTimer = setTimeout(() => {
			this.lifecycle.setActivePage(true);
			this._poseNeedsSnap = true;
			this.panelHud?.setVisible(true);
			this.enterTimer = null;
		}, ROUTE_TRANSITION_ENTER_MS);
	}

	resetCarouselState() {
		this._clearEnterTimer();
		this.grainBlurRadius.current = 0;
		this.lifecycle.resetCarouselState();
	}

	playEnterAnimation() {
		this.lifecycle.playEnterAnimation();
	}

	setRouteState(routeState) {
		this.lifecycle.setRouteState(routeState);
	}

	setPointerState({ pointerDown }) {
		this.pointerDown = pointerDown;
	}

	setMixPreviewActive(active) {
		this.lifecycle.setMixPreviewActive(active);
	}

	shouldKeepUpdating() {
		return this.lifecycle.shouldKeepUpdating();
	}

	shouldRenderOverlay() {
		return this.lifecycle.shouldRenderOverlay();
	}

	shouldRender() {
		return this.lifecycle.shouldRender();
	}

	getScene() {
		return this.threeScene;
	}

	getModelsBloomLogoReveal() {
		return this.activePage ? 1 : 0;
	}

	getModelsGrainBlurConfig() {
		return { enabled: false };
	}

	applyCamera(camera) {
		if (!this.lifecycle.isFramingActive()) {
			camera.position.set(0, 0, 9);
			camera.lookAt(0, 0, 0);
			return;
		}

		if (this._poseNeedsSnap) {
			this._snapPresentationPose(
				typeof window !== "undefined" ? window.innerWidth : 1280,
				camera,
			);
			this._poseNeedsSnap = false;
			return;
		}

		this._applyCaseCamera(camera);
	}

	update(delta, frame) {
		const camera = frame?.camera;
		const pointer = frame?.pointer ?? { x: 0, y: 0 };
		const viewportWidth = frame?.viewportWidth ?? window.innerWidth;

		if (!this.loaded || !this.root) {
			return;
		}

		syncCaseStudyPanelHud(this.panelHud, {
			showCase: this.showCase,
			mixPreview: this._mixPreview,
			store: this.store,
		});

		this.grainBlurRadius.current = 0;

		const phase = this.lifecycle.updateExit(frame);
		if (phase !== "active") {
			return;
		}

		if (!this.activePage) {
			return;
		}

		restoreRootForShow(this.root);
		this.root.visible = true;

		if (this._poseNeedsSnap) {
			this._snapPresentationPose(viewportWidth, camera ?? null, pointer);
			this._poseNeedsSnap = false;
		}

		const scroll = this.lifecycle.resolveCameraScroll();
		this._applyCaseCamera(camera);

		const scrollMid = scroll > 0.35 && scroll <= 0.9;
		if (scrollMid) {
			easing.damp3(this.directionalLight.position, [-5, 0, 50], 1, delta);
		} else {
			this.directionalLight.position.set(-5, 13.5, 9);
		}

		const cfg = this.ringConfig;
		const spinAxis = cfg.spinAxis === "x" || cfg.spinAxis === "z" ? cfg.spinAxis : "y";
		const spinMul = this.pointerDown ? cfg.pointerSpinMul : 1;
		for (const spin of this.ringSpins) {
			spin.spinner.rotation[spinAxis] += delta * spin.speed * spinMul;
		}

		const pointerX = pointer.x ?? 0;
		const pointerY = pointer.y ?? 0;
		const pointerTilt = cfg.pointerTilt;

		if (viewportWidth <= 768) {
			this.root.position.set(0, -0.4, 0);
			this.root.rotation.set(0, 0, 0);
			this.root.scale.set(MOBILE_ROOT_SCALE, MOBILE_ROOT_SCALE, MOBILE_ROOT_SCALE);
			easing.damp3(
				this.case1Model.position,
				[0, Math.min(scroll * 40, 10), 0],
				2.5,
				delta,
			);
			easing.damp3(
				this.nipigasCircles.rotation,
				[pointerY * pointerTilt, pointerX * pointerTilt, 0],
				1,
				delta,
			);
			easing.damp3(
				this.nipigasLogo.rotation,
				[0.2 + pointerY * 0.2, -0.5 + pointerX * 0.2, 0],
				1,
				delta,
			);
		} else {
			this.root.position.set(1.7, 0, 0);
			this.root.scale.set(DESKTOP_ROOT_SCALE, DESKTOP_ROOT_SCALE, DESKTOP_ROOT_SCALE);
			this.case1Model.position.set(0, -0.3, 0);
			easing.damp3(
				this.nipigasCircles.rotation,
				[pointerY * pointerTilt, pointerX * pointerTilt, 0],
				1,
				delta,
			);
			easing.damp3(
				this.nipigasLogo.rotation,
				[0.2 + pointerY * 0.2, -0.5 + pointerX * 0.2, 0],
				1,
				delta,
			);
		}
	}

	dispose() {
		this._clearEnterTimer();
		this.ringDevTools?.dispose();
		this.ringDevTools = null;
		disposeCaseStudyPanelHud(this.panelHud);
		this.panelHud = null;
		this.threeScene = null;

		for (const item of this.disposables) {
			item?.dispose?.();
		}
		this.disposables = [];
	}
}
