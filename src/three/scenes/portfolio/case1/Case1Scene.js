import * as THREE from "three";
import { easing } from "maath";
import { createGLTFLoader, enrichGLTFResult } from "@/three/assets/gltfLoader.js";
import { ROUTE_TRANSITION_ENTER_MS } from "@/config/routeTransition.js";
import { computeRouteSceneVisibility } from "@/three/scenes/utils/routeSceneVisibility.js";
import { freezeHiddenRoot, restoreRootForShow } from "@/three/scenes/utils/sceneRoot.js";
import { isCase1Path } from "./case1Config.js";
import { case1PostProcessConfig } from "./case1PostProcessConfig.js";

const SCALE_HIDE_EPS = 0.001;

const LOGO_NODE_NAMES = [
	"logoCircle",
	"logoCircleContour",
	"logoFire",
	"logoFireContour",
	"separator",
	"numberFifty",
	"numberFiftyContour",
];

/**
 * Кейс НИПИГАЗ (/portfolio/01): орбиты + GLB-логотип.
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
		this.root.add(this.case1Model);

		this.nipigasCircles = new THREE.Group();
		this.case1Model.add(this.nipigasCircles);

		this.nipigasLogo = new THREE.Group();
		this.nipigasLogo.scale.setScalar(0.75);
		this.case1Model.add(this.nipigasLogo);

		this.circle1 = null;
		this.circle2 = null;
		this.circle3 = null;

		this.directionalLight = new THREE.DirectionalLight(0xffffff, 1);
		this.directionalLight.position.set(-5, 13.5, 9);
		this.threeScene.add(new THREE.AmbientLight(0xffffff, 0.45));
		this.threeScene.add(this.directionalLight);

		this.loaded = false;
		this.showCase = false;
		this.activePage = false;
		this.enterTimer = null;
		this.lastRouteKey = "";
		this.exitHideComplete = false;
		this.pointerDown = false;
		this._mixPreview = false;

		this.disposables = [];

		/** Live radius grain blur (скролл → 0…blurRadiusMax). */
		this.grainBlurRadius = { current: 0 };
		this._carouselEnterPending = false;

		this._hideRoot();
		this._loadAssets();
	}

	_loadAssets() {
		const gltfLoader = createGLTFLoader();
		const textureLoader = new THREE.TextureLoader();

		Promise.all([
			gltfLoader.loadAsync("/models/case1/NipigasLogoModel.glb"),
			textureLoader.loadAsync("/images/c1.png"),
		])
			.then(([gltfRaw, circleTexture]) => {
				if (!this.threeScene) {
					return;
				}

				const gltf = enrichGLTFResult(gltfRaw);

				const maxAniso = this.renderer.capabilities.getMaxAnisotropy?.() ?? 16;
				circleTexture.anisotropy = maxAniso;
				circleTexture.colorSpace = THREE.SRGBColorSpace;
				this.disposables.push(circleTexture);

				this._buildCircles(circleTexture);
				this._buildLogo(gltf);
				this.loaded = true;
			})
			.catch((err) => {
				console.error("[Case1Scene] load failed", err);
			});
	}

	_buildCircles(circleTexture) {
		const circlesMaterial = new THREE.MeshStandardMaterial({
			color: 0xffffff,
			emissive: new THREE.Color(0.2, 0.6, 1),
			transparent: true,
			depthWrite: false,
			toneMapped: false,
			emissiveIntensity: 2,
			map: circleTexture,
			side: THREE.DoubleSide,
		});
		this.disposables.push(circlesMaterial);

		const circleDefs = [
			{ rotation: [2.2, 0.6, 0], scale: 27 },
			{ rotation: [1.8, 0.2, 0], scale: 23 },
			{ rotation: [1.88, 0.15, 0], scale: 15 },
		];

		const refs = [];
		for (const def of circleDefs) {
			const geometry = new THREE.PlaneGeometry(1, 1, 16);
			const mesh = new THREE.Mesh(geometry, circlesMaterial);
			mesh.rotation.set(def.rotation[0], def.rotation[1], def.rotation[2]);
			mesh.scale.setScalar(def.scale);
			this.nipigasCircles.add(mesh);
			this.disposables.push(geometry);
			refs.push(mesh);
		}

		[this.circle1, this.circle2, this.circle3] = refs;
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

	_hideRoot() {
		this.root.visible = false;
		this.root.scale.set(0, 0, 0);
		this.activePage = false;
		this._carouselEnterPending = true;
	}

	_clearEnterTimer() {
		if (this.enterTimer !== null) {
			clearTimeout(this.enterTimer);
			this.enterTimer = null;
		}
	}

	_scheduleActivate() {
		this._clearEnterTimer();
		this.exitHideComplete = false;
		this.activePage = false;
		this.root.visible = true;
		this.root.scale.set(0, 0, 0);
		this.root.position.set(0, 0, 0);
		restoreRootForShow(this.root);

		this.enterTimer = setTimeout(() => {
			this.activePage = true;
			this.enterTimer = null;
		}, ROUTE_TRANSITION_ENTER_MS);
	}

	/** Reset при уходе с кейса. */
	resetCarouselState() {
		this._clearEnterTimer();
		this.activePage = false;
		this.showCase = false;
		this.store.scroll = 0;
		this.grainBlurRadius.current = 0;
		this._hideRoot();
	}

	/** Анимация появления — scale-in, только после reset. */
	playEnterAnimation() {
		if (!this._carouselEnterPending) {
			return;
		}

		if (!this.loaded || this.activePage || this.enterTimer !== null) {
			return;
		}

		if (this.root.scale.x < SCALE_HIDE_EPS) {
			this._carouselEnterPending = false;
			this._scheduleActivate();
		}
	}

	setRouteState({ currentPage, teleportPage, routePhase }) {
		const routeKey = `${currentPage}|${teleportPage}|${routePhase}`;
		if (routeKey === this.lastRouteKey) {
			return;
		}
		this.lastRouteKey = routeKey;

		const { show, shouldWake, displayed } = computeRouteSceneVisibility({
			currentPage,
			teleportPage,
			routePhase,
			matchPage: isCase1Path,
		});

		if (displayed && shouldWake) {
			this.store.scroll = 0;
			this.grainBlurRadius.current = 0;
		}

		if (!show) {
			this._clearEnterTimer();
			this.activePage = false;
			this.showCase = false;
			return;
		}

		this.showCase = true;

		if (shouldWake && !this.activePage && this.enterTimer === null && this.root.scale.x < SCALE_HIDE_EPS) {
			this.playEnterAnimation();
		}
	}

	setPointerState({ pointerDown }) {
		this.pointerDown = pointerDown;
	}

	/** Превью кейса в hex-mix hub → case до смены роута. */
	setMixPreviewActive(active) {
		this._mixPreview = active === true;

		if (!this._mixPreview) {
			return;
		}

		this._clearEnterTimer();
		this.exitHideComplete = false;
		this.showCase = true;
		this.activePage = true;
		this.root.visible = true;
		restoreRootForShow(this.root);
	}

	shouldKeepUpdating() {
		return Boolean(this.root?.visible || this.showCase || this._mixPreview);
	}

	/** Сцена уходит — рисуем поверх home до конца scale-out. */
	shouldRenderOverlay() {
		return this.loaded && this.root.visible && !this.showCase && !this.exitHideComplete;
	}

	shouldRender() {
		return this.loaded && this.root.visible && (this.showCase || this._mixPreview);
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
		if (this.showCase && this.activePage) {
			camera.position.x = 0;
			camera.position.z = 9;
			camera.lookAt(0, camera.position.y, 0);
			return;
		}
		camera.position.set(0, 0, 9);
		camera.lookAt(0, 0, 0);
	}

	update(delta, frame) {
		const camera = frame?.camera;
		const pointer = frame?.pointer ?? { x: 0, y: 0 };
		const viewportWidth = frame?.viewportWidth ?? window.innerWidth;

		if (!this.loaded || !this.root) {
			return;
		}

		this.grainBlurRadius.current = 0;

		if (this.showCase !== true && this.root.visible === false && this.exitHideComplete) {
			return;
		}

		if (this.activePage) {
			restoreRootForShow(this.root);

			if (!this.circle1 || !this.circle2 || !this.circle3) {
				return;
			}

			if (camera) {
				easing.damp(camera.position, "y", 0 - this.store.scroll * 35, 0.22, delta);
				camera.lookAt(0, camera.position.y, 0);
			}

			const scroll = this.store.scroll ?? 0;
			const scrollMid = scroll > 0.35 && scroll <= 0.9;
			if (scrollMid) {
				easing.damp3(this.directionalLight.position, [-5, 0, 50], 1, delta);
			} else {
				easing.damp3(this.directionalLight.position, [-5, 13.5, 9], 1, delta);
			}

			this.root.visible = true;

			const orbitSpeed = this.pointerDown ? 0.3 : 0.05;
			this.circle1.rotation.z += delta * orbitSpeed;
			this.circle2.rotation.z += delta * orbitSpeed;
			this.circle3.rotation.z += delta * -orbitSpeed;

			const pointerX = pointer.x ?? 0;
			const pointerY = pointer.y ?? 0;

			if (viewportWidth <= 768) {
				easing.damp3(this.root.position, [0, -0.4, 0], 0, delta);
				easing.damp3(
					this.case1Model.position,
					[0, Math.min(scroll * 40, 10), 0],
					2.5,
					delta,
				);
				easing.damp3(
					this.nipigasCircles.rotation,
					[0.65 + pointerY * 0.2, -0.35 + pointerX * 0.2, 0.1],
					1,
					delta,
				);
				easing.damp3(
					this.nipigasLogo.rotation,
					[0.2 + pointerY * 0.2, -0.5 + pointerX * 0.2, 0],
					1,
					delta,
				);
				easing.damp3(this.root.rotation, [0, 0, 0], 1, delta);
				easing.damp3(this.root.scale, [0.7, 0.7, 0.7], 1, delta);
			} else {
				easing.damp3(
					this.nipigasCircles.rotation,
					[0.65 + pointerY * 0.2, -0.35 + pointerX * 0.2, 0.1],
					1,
					delta,
				);
				easing.damp3(
					this.nipigasLogo.rotation,
					[0.2 + pointerY * 0.2, -0.5 + pointerX * 0.2, 0],
					1,
					delta,
				);
				easing.damp3(this.case1Model.position, [0, -0.3, 0], 0.5, delta);
				easing.damp3(this.root.position, [1.7, 0.0, 0], 0.5, delta);
				easing.damp3(this.root.scale, [1.1, 1.1, 1.1], 1, delta);
			}
			return;
		}

		easing.damp3(this.root.scale, [0, 0, 0], 0.2, delta);
		const sx = Math.abs(this.root.scale.x);
		const sy = Math.abs(this.root.scale.y);
		const sz = Math.abs(this.root.scale.z);
		if (sx <= SCALE_HIDE_EPS && sy <= SCALE_HIDE_EPS && sz <= SCALE_HIDE_EPS) {
			this.root.visible = false;
			this.exitHideComplete = true;
			freezeHiddenRoot(this.root);
		}
	}

	dispose() {
		this._clearEnterTimer();
		this.threeScene = null;

		for (const item of this.disposables) {
			item?.dispose?.();
		}
		this.disposables = [];
	}
}
