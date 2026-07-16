import * as THREE from "three";
import { PLACEHOLDER_SCENE_DEFINITIONS } from "./sceneDefinitions.js";
import { resolveSceneId } from "./resolveSceneId.js";
import { getSceneCarousel } from "../render/transition/carouselPage.js";
import { isCarouselRoutePage } from "../render/transition/SceneCarousel.js";
import { getHexShaderProgress } from "../render/overlay/hexShaderProgress.js";
import { SceneCarouselLifecycleDispatcher } from "./lifecycle/SceneCarouselLifecycleDispatcher.js";
import { DigitalWhaleScene } from "./home/DigitalWhaleScene.js";
import { PlaceholderScene } from "./types/PlaceholderScene.js";
import { PortfolioHubScene } from "./portfolio/PortfolioHubScene.js";
import { Case1Scene } from "./portfolio/case1/Case1Scene.js";
import { Case3Scene } from "./portfolio/case3/Case3Scene.js";
import { AboutScene } from "./about/AboutScene.js";

function createLayerRenderTarget(renderer, width, height, gfx) {
	const dpr = renderer.getPixelRatio();
	const useHdr = gfx?.bloomHdr !== false;
	const target = new THREE.WebGLRenderTarget(Math.floor(width * dpr), Math.floor(height * dpr), {
		type: useHdr ? THREE.HalfFloatType : THREE.UnsignedByteType,
		minFilter: THREE.LinearFilter,
		magFilter: THREE.LinearFilter,
		depthBuffer: true,
		stencilBuffer: false,
	});
	// Linear HDR RT — emissive > 1 не clamp'ится до bloom (sRGB 8-bit ломал свечение).
	target.texture.colorSpace = useHdr ? THREE.LinearSRGBColorSpace : THREE.SRGBColorSpace;
	return target;
}

/**
 * Контентные сцены: direct render моделей в RT (bloom — ModelsPostProcessPipeline).
 */
export class SceneManager {
	constructor(renderer, camera, options = {}) {
		this.disposed = false;
		this.renderer = renderer;
		this.camera = camera;
		this.store = options.store;
		this.getPointer = options.getPointer ?? (() => ({ x: 0, y: 0 }));
		this.getViewportPointer = options.getViewportPointer ?? this.getPointer;
		this.getPointerDown = options.getPointerDown ?? (() => false);
		this.getPointerBlocked = options.getPointerBlocked ?? (() => false);
		this.gfx = options.gfx ?? {
			bloomMipmap: true,
			bloomLevels: 3,
			bloomRadius: 0.62,
		};

		this.scenes = new Map();
		this.activeId = "home";
		/** Универсальные model-layer RT: A = source/single, B = target во время mix. */
		this.layerTargets = { a: null, b: null };
		this.size = { w: 0, h: 0 };
		this.lastDelta = 0;
		/** @type {string | null} */
		this._caseMixPreviewId = null;
		this.routeState = {
			currentPage: "/",
			teleportPage: "/",
			routePhase: "idle",
			appStarted: false,
		};

		this.scenes.set("home", new DigitalWhaleScene(this.gfx));
		this.scenes.get("home")?.initHeroText?.(this.renderer);
		this.scenes.set("portfolioHub", new PortfolioHubScene());
		this.scenes.set("case01", new Case1Scene(this.renderer, this.store));
		this.scenes.set("case03", new Case3Scene(this.renderer, this.store));
		this.scenes.set("about", new AboutScene(this.store));

		for (const def of PLACEHOLDER_SCENE_DEFINITIONS) {
			if (def.id === "case03" || def.id === "about") continue;
			this.scenes.set(def.id, new PlaceholderScene(def, this.store));
		}

		this.ready = false;
		const sceneReadyPromises = [...this.scenes.values()]
			.map((scene) => scene.readyPromise)
			.filter((promise) => promise && typeof promise.then === "function");
		this.readyPromise = Promise.allSettled(sceneReadyPromises).then((results) => {
			this.ready = true;
			return results;
		});
		this._carouselLifecycle = new SceneCarouselLifecycleDispatcher((sceneId) => this.scenes.get(sceneId));
	}

	isCarouselHubActive() {
		return isCarouselRoutePage(this.routeState.currentPage) || getSceneCarousel().isHexNavigationActive();
	}

	_getCarouselActiveIdSet() {
		const carousel = getSceneCarousel();
		return new Set(carousel.getActiveSceneIds(getHexShaderProgress()));
	}

	setRouteState({ currentPage, teleportPage, routePhase, appStarted }) {
		this.routeState = {
			currentPage: currentPage ?? this.routeState.currentPage,
			teleportPage: teleportPage ?? this.routeState.teleportPage,
			routePhase: routePhase ?? this.routeState.routePhase,
			appStarted: appStarted ?? this.routeState.appStarted,
		};

		const nextId = resolveSceneId(this.routeState.currentPage);
		if (this.scenes.has(nextId)) {
			this.activeId = nextId;
		}
		const carousel = getSceneCarousel();
		const routeWasConfirmed = carousel.confirmHexNavigationRoute(nextId);
		// The confirmation callback can immediately start a queued transition.
		// In that case this route is only an intermediate frame and must not play
		// its normal scene-enter animation.
		this.routeState.suppressSceneEnter = routeWasConfirmed && carousel.isHexNavigationActive();

		for (const scene of this.scenes.values()) {
			scene.setRouteState?.(this.routeState);
		}
	}

	getActiveSceneId() {
		return this.activeId;
	}

	getActiveScene() {
		return this.scenes.get(this.activeId) ?? null;
	}

	requiresContinuousRender() {
		return this.getActiveScene()?.requiresContinuousRender?.() !== false;
	}

	getSceneById(id) {
		return this.scenes.get(id) ?? null;
	}

	getSceneOverlayCanvas(sceneId) {
		return this.scenes.get(sceneId)?.getScreenOverlayCanvas?.() ?? null;
	}

	getSceneOverlayState(sceneId) {
		const scene = this.scenes.get(sceneId);
		return scene?.getScreenOverlayState?.() ?? {
			canvas: scene?.getScreenOverlayCanvas?.() ?? null,
			revision: 0,
		};
	}

	setSceneOverlayDomPresentation(sceneId, active, container) {
		this.scenes.get(sceneId)?.setDomPresentation?.(active, container);
	}

	isSceneOverlayDomPresentationActive(sceneId) {
		return this.scenes.get(sceneId)?.isDomPresentationActive?.() === true;
	}

	/** Case panel HUD presenters (WebGL left text) — for compose mode / screen overlay. */
	forEachCasePanelHud(visitor) {
		for (const scene of this.scenes.values()) {
			if (scene?.panelHud) {
				visitor(scene.panelHud);
			}
		}
	}

	/** Компилирует материалы всех сцен под прелоадером, отдавая браузеру кадр между сценами. */
	async warmupPrograms() {
		const cameraState = {
			position: this.camera.position.clone(),
			quaternion: this.camera.quaternion.clone(),
			up: this.camera.up.clone(),
			fov: this.camera.fov,
			near: this.camera.near,
			far: this.camera.far,
			zoom: this.camera.zoom,
		};

		try {
			for (const [id, sceneObj] of this.scenes.entries()) {
				if (this.disposed) {
					return;
				}
				const scene = sceneObj.getScene?.();
				if (!scene) {
					continue;
				}

				await new Promise((resolve) => requestAnimationFrame(() => resolve()));

				const temporarilyVisible = [];
				if (id !== "home") {
					scene.traverse((object) => {
						if (object.visible === false) {
							temporarilyVisible.push(object);
							object.visible = true;
						}
					});
				}

				try {
					const frame = this._withSceneProgressFrame(this.getFrameContext(), id, getSceneCarousel());
					sceneObj.applyCamera?.(this.camera, frame);
					this.renderer.compile(scene, this.camera);
				} catch (error) {
					console.warn(`[SceneManager] shader warm-up failed for ${id}`, error);
				} finally {
					for (const object of temporarilyVisible) {
						object.visible = false;
					}
				}
			}
		} finally {
			this.camera.position.copy(cameraState.position);
			this.camera.quaternion.copy(cameraState.quaternion);
			this.camera.up.copy(cameraState.up);
			this.camera.fov = cameraState.fov;
			this.camera.near = cameraState.near;
			this.camera.far = cameraState.far;
			this.camera.zoom = cameraState.zoom;
			this.camera.updateProjectionMatrix();
		}
	}

	getBloomRevealForSceneId(sceneId) {
		const scene = this.scenes.get(sceneId);
		if (!scene) {
			return 0;
		}
		return scene.getModelsBloomLogoReveal?.() ?? 1;
	}

	getBloomRevealForMix(sourceId, targetId, progress) {
		const p = THREE.MathUtils.clamp(progress, 0, 1);
		const sourceReveal = this.getBloomRevealForSceneId(sourceId);
		const targetReveal = this.getBloomRevealForSceneId(targetId);
		return sourceReveal * (1 - p) + targetReveal * p;
	}

	getFrameContext() {
		const pointer = this.getViewportPointer();
		const carousel = getSceneCarousel();
		const cssW = this.size.w || window.innerWidth;
		const cssH = this.size.h || window.innerHeight;
		const dpr = this.renderer.getPixelRatio();

		return {
			camera: this.camera,
			store: this.store,
			pointer,
			pointerDown: this.getPointerDown(),
			pointerBlocked: this.getPointerBlocked(),
			viewportWidth: Math.floor(cssW * dpr),
			viewportHeight: Math.floor(cssH * dpr),
			activeSceneId: carousel.currentId,
			currentPage: this.routeState.currentPage,
		};
	}

	setSize(width, height) {
		if (width <= 0 || height <= 0) {
			return;
		}
		if (this.size.w === width && this.size.h === height) {
			return;
		}
		this.size = { w: width, h: height };

		for (const scene of this.scenes.values()) {
			scene.onViewportResize?.(width, height);
		}

		for (const key of ["a", "b"]) {
			this.layerTargets[key]?.dispose();
			this.layerTargets[key] = createLayerRenderTarget(this.renderer, width, height, this.gfx);
		}
	}

	warmupRenderTargets() {
		const targets = [this.layerTargets.a, this.layerTargets.b].filter(Boolean);
		if (targets.length === 0 || this._isContextLost()) {
			return;
		}

		const previousTarget = this.renderer.getRenderTarget();
		const previousAutoClear = this.renderer.autoClear;
		const previousClearColor = this.renderer.getClearColor(new THREE.Color());
		const previousClearAlpha = this.renderer.getClearAlpha();

		try {
			this.renderer.autoClear = true;
			this.renderer.setClearColor(0x000000, 0);
			for (const target of targets) {
				this.renderer.setRenderTarget(target);
				this.renderer.clear(true, true, true);
			}
		} finally {
			this.renderer.setRenderTarget(previousTarget);
			this.renderer.autoClear = previousAutoClear;
			this.renderer.setClearColor(previousClearColor, previousClearAlpha);
		}
	}

	update(delta) {
		this.lastDelta = delta;
		this._syncCaseMixPreview();
		const frame = this.getFrameContext();
		const carouselHub = this.isCarouselHubActive();
		const carousel = getSceneCarousel();
		const carouselActiveIds = carouselHub ? this._getCarouselActiveIdSet() : null;

		for (const [id, scene] of this.scenes.entries()) {
			const isActive = scene === this.getActiveScene();
			const inCarousel = carouselActiveIds?.has(id) ?? false;

			if (carouselHub) {
				if (inCarousel) {
					scene.setPointerState?.({ pointerDown: frame.pointerDown, pointerBlocked: frame.pointerBlocked });
					scene.update?.(delta, this._withSceneProgressFrame(frame, id, carousel));
				} else if (scene.shouldKeepUpdating?.()) {
					// Case scenes leaving via hex still need exit cleanup after the hub is active.
					scene.setPointerState?.({ pointerDown: frame.pointerDown, pointerBlocked: frame.pointerBlocked });
					scene.update?.(delta, frame);
				}
				continue;
			}

			if (isActive || scene.shouldKeepUpdating?.()) {
				scene.setPointerState?.({ pointerDown: frame.pointerDown, pointerBlocked: frame.pointerBlocked });
				scene.update?.(delta, frame);
			}
		}
	}

	_withSceneProgressFrame(frame, sceneId, carousel) {
		return {
			...frame,
			sceneId,
			carouselProgress: carousel.progress,
			sceneProgress: carousel.getSceneProgress(sceneId),
			sceneProgressTarget: carousel.getSceneProgressTarget(sceneId),
			sceneRole: carousel.getSceneProgressRole(sceneId),
		};
	}

	/** После SceneCarousel.update — reset по ролям кольца. */
	afterCarouselUpdate(carousel) {
		this._carouselLifecycle.onCarouselFrame(carousel);
	}

	/** Старт hex-перехода — reset target, подготовка source. */
	onHexNavigationStart(carousel, payload) {
		this._carouselLifecycle.onHexNavigationStart(carousel, payload);
	}

	_syncCaseMixPreview() {
		const carousel = getSceneCarousel();
		const previewId = carousel.getHexMixTargetSceneId();

		if (this._caseMixPreviewId === previewId) {
			return;
		}

		if (this._caseMixPreviewId) {
			this.scenes.get(this._caseMixPreviewId)?.setMixPreviewActive?.(false);
		}

		this._caseMixPreviewId = previewId;

		if (previewId) {
			this.scenes.get(previewId)?.setMixPreviewActive?.(true);
		}
	}

	_getLayerRenderTarget() {
		return this.layerTargets.a;
	}

	/** Универсальный RT для source/target слоя hex-mix. */
	_getMixLayerRenderTarget(sceneId, mixSlot) {
		void sceneId;
		return this.layerTargets[mixSlot] ?? this.layerTargets.a;
	}

	renderCarouselMix(options = {}) {
		const carousel = getSceneCarousel();
		const { sourceId, targetId } = carousel.getMixSourceTargetIds();
		const hexProgress = options.hexProgress ?? getHexShaderProgress();
		const skipIdleTarget = hexProgress <= 0.0001 || options.skipIdleTargetLayer === true;

		const sourceModels = this._renderSceneLayer(sourceId, this._getMixLayerRenderTarget(sourceId, "a"));
		const targetModels = sourceId === targetId || skipIdleTarget
			? sourceModels
			: this._renderSceneLayer(targetId, this._getMixLayerRenderTarget(targetId, "b"));

		return {
			sourceId,
			targetId,
			sourceModels,
			targetModels,
		};
	}

	/**
	 * @param {{ skipIdleTargetLayer?: boolean }} [options]
	 */
	renderModelsFrame(options = {}) {
		if (this.isCarouselHubActive()) {
			return this.renderCarouselMix(options);
		}

		const texture = this.renderActiveScene();
		const sceneId = this.activeId;

		return {
			sourceId: sceneId,
			targetId: sceneId,
			sourceModels: texture,
			targetModels: texture,
		};
	}

	_isContextLost() {
		const gl = this.renderer.getContext();
		return !gl || gl.isContextLost();
	}

	_renderSceneLayer(sceneId, layerTarget) {
		const sceneObj = this.scenes.get(sceneId);
		const target = layerTarget ?? this._getLayerRenderTarget(sceneId);
		if (!sceneObj || !target) {
			return null;
		}

		if (sceneObj.shouldRender?.() === false) {
			const prevTarget = this.renderer.getRenderTarget();
			const prevAutoClear = this.renderer.autoClear;
			this.renderer.setRenderTarget(target);
			this.renderer.autoClear = true;
			this.renderer.setClearColor(0x000000, 0);
			this.renderer.clear(true, true, true);
			this.renderer.setRenderTarget(prevTarget);
			this.renderer.autoClear = prevAutoClear;
			return target.texture;
		}

		const threeScene = sceneObj.getScene?.();
		if (!threeScene) {
			return null;
		}

		if (this._isContextLost()) {
			return null;
		}

		const frame = this.getFrameContext();
		const carousel = getSceneCarousel();
		const layerFrame = this._withSceneProgressFrame(frame, sceneId, carousel);
		sceneObj.applyCamera?.(this.camera, layerFrame);

		const prevTarget = this.renderer.getRenderTarget();
		const prevAutoClear = this.renderer.autoClear;
		const prevToneMapping = this.renderer.toneMapping;

		this.renderer.setRenderTarget(target);
		this.renderer.autoClear = true;
		// HDR в RT: без tone mapping, иначе emissive clamp'ится до bloom.
		this.renderer.toneMapping = THREE.NoToneMapping;
		this.renderer.setClearColor(0x000000, 0);
		this.renderer.clear(true, true, true);
		this.renderer.render(threeScene, this.camera);

		this.renderer.toneMapping = prevToneMapping;
		this.renderer.setRenderTarget(prevTarget);
		this.renderer.autoClear = prevAutoClear;

		return target.texture;
	}

	_getSceneToRender() {
		for (const scene of this.scenes.values()) {
			if (scene.shouldRenderOverlay?.()) {
				return scene;
			}
		}

		const active = this.getActiveScene();
		if (active?.shouldRender?.()) {
			return active;
		}

		return null;
	}

	renderActiveScene() {
		const renderScene = this._getSceneToRender();
		if (!renderScene || !this.layerTargets.a) {
			return null;
		}

		const sceneId = [...this.scenes.entries()].find(([, scene]) => scene === renderScene)?.[0];
		if (!sceneId) {
			return null;
		}

		return this._renderSceneLayer(sceneId, this.layerTargets.a);
	}

	dispose() {
		this.disposed = true;
		for (const scene of this.scenes.values()) {
			scene.dispose?.();
		}
		this.scenes.clear();
		for (const key of ["a", "b"]) {
			this.layerTargets[key]?.dispose();
			this.layerTargets[key] = null;
		}
	}
}
