import * as THREE from "three";
import { PLACEHOLDER_SCENE_DEFINITIONS } from "./sceneDefinitions.js";
import { resolveSceneId } from "./resolveSceneId.js";
import { getSceneCarousel } from "@/three/render/transition/carouselPage.js";
import { CAROUSEL_SCENE_IDS, isCarouselRoutePage } from "../render/transition/SceneCarousel.js";
import { getHexRevealFromTop, getHexShaderProgress } from "../render/overlay/hexShaderProgress.js";
import { resolveHexHitOwnerSceneId, yNormFromTopFromNdcY } from "../render/overlay/hexHitOwnership.js";
import { SceneCarouselLifecycleDispatcher } from "./lifecycle/SceneCarouselLifecycleDispatcher.js";
import { DigitalWhaleScene } from "./home/DigitalWhaleScene.js";
import { PlaceholderScene } from "./types/PlaceholderScene.js";
import { PortfolioHubScene } from "./portfolio/PortfolioHubScene.js";
import { Case1Scene } from "./portfolio/case1/Case1Scene.js";
import { BelkaScene } from "./portfolio/case6/BelkaScene.js";
import { Mmk1CapabilityScene } from "./capabilities/mmk1/Mmk1CapabilityScene.js";
import { CapabilityWorldScene } from "./capabilities/CapabilityWorldScene.js";
import { CAPABILITIES } from "@/pages/capabilities/data/capabilities.js";
import { AboutScene } from "./about/AboutScene.js";
import { ContactsScene } from "./contacts/ContactsScene.js";
import { SceneDragOrbitController } from "./interaction/SceneDragOrbitController.js";

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
		this.size = { w: 0, h: 0, dpr: 0 };
		this.lastDelta = 0;
		/** @type {string | null} */
		this._caseMixPreviewId = null;
		/** Cached case panel HUD meshes — avoid scanning all scenes twice per frame. */
		this._casePanelHuds = null;
		this.sceneDragOrbit = new SceneDragOrbitController();
		this.routeState = {
			currentPage: "/",
			teleportPage: "/",
			routePhase: "idle",
			appStarted: false,
		};

		this.scenes.set("home", new DigitalWhaleScene(this.gfx));
		this.scenes.get("home")?.initHeroText?.(this.renderer);
		this.scenes.set("portfolioHub", new PortfolioHubScene({ inputElement: this.renderer.domElement }));
		this.scenes.set(CAPABILITIES[0].sceneId, new Mmk1CapabilityScene(this.renderer, this.store));
		for (const capability of CAPABILITIES.slice(1)) {
			this.scenes.set(
				capability.sceneId,
				new CapabilityWorldScene(this.renderer, this.store, capability),
			);
		}
		this.scenes.set("case01", new Case1Scene(this.renderer, this.store));
		this.scenes.set("case06", new BelkaScene(this.renderer, this.store));
		this.scenes.set("about", new AboutScene(this.store));
		this.scenes.set("contacts", new ContactsScene(this.store));

		for (const def of PLACEHOLDER_SCENE_DEFINITIONS) {
			if (def.id === "case04" || def.id === "case06" || def.id === "about" || def.id === "contacts") continue;
			this.scenes.set(def.id, new PlaceholderScene(def, this.store));
		}

		this.ready = false;
		const sceneReadyPromises = [...this.scenes.entries()]
			.filter(([, scene]) => scene.readyPromise && typeof scene.readyPromise.then === "function")
			.map(([sceneId, scene]) => Promise.resolve(scene.readyPromise).then((result) => {
				if (result === false) {
					throw new Error(`[SceneManager] ${sceneId} reported an unsuccessful prepare`);
				}
				return result;
			}));
		this.readyPromise = Promise.all(sceneReadyPromises).then((results) => {
			this.ready = true;
			return results;
		});
		this._carouselLifecycle = new SceneCarouselLifecycleDispatcher((sceneId) => this.scenes.get(sceneId));
	}

	isCarouselHubActive() {
		const carousel = getSceneCarousel();
		return isCarouselRoutePage(this.routeState.currentPage) || carousel.isHexNavigationActive() || carousel.isNavigationSettleActive() || carousel.isCaseBoundaryDrive();
	}

	_getCarouselActiveIdSet() {
		const carousel = getSceneCarousel();
		return new Set(carousel.getActiveSceneIds(getHexShaderProgress()));
	}

	/**
	 * Page content hits: settled current page, or during hex/carousel mix the
	 * scene that owns the pointer's screen-Y band (see hexHitOwnership.js).
	 * Neighbors stay live for render/reverse, but must not steal the other band.
	 * @returns {string | null}
	 */
	_resolveInteractiveSceneContext(carousel, carouselHub) {
		if (this.getPointerBlocked()) {
			return { sceneId: null, orbitSceneId: null };
		}

		const pointer = this.getViewportPointer() ?? this.getPointer();
		const yNormFromTop = yNormFromTopFromNdcY(pointer?.y ?? 0);
		const { sourceId, targetId } = carousel.getMixSourceTargetIds();
		const mixProgress = getHexShaderProgress();

		if (mixProgress > 0.001) {
			const sceneId = resolveHexHitOwnerSceneId({
				yNormFromTop,
				mixProgress,
				revealFromTop: getHexRevealFromTop(),
				sourceId,
				targetId,
			});
			return { sceneId, orbitSceneId: sceneId };
		}

		// Hex click just started (progress≈0) or awaitingRoute edge: full screen = source.
		if (carousel.isInteractionLocked()) {
			const sceneId = sourceId ?? carousel.currentId;
			return { sceneId, orbitSceneId: sceneId };
		}

		if (carouselHub) {
			return {
				sceneId: carousel.currentId,
				orbitSceneId: carousel.currentId,
			};
		}
		return { sceneId: this.activeId, orbitSceneId: this.activeId };
	}

	/** @param {boolean} acceptsPointer */
	_withInteractionFrame(frame, acceptsPointer) {
		if (acceptsPointer) {
			return { ...frame, interactionEnabled: true };
		}
		return {
			...frame,
			pointer: { x: 0, y: 0 },
			pointerDown: false,
			pointerBlocked: true,
			interactionEnabled: false,
		};
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
		carousel.confirmCaseBoundaryRoute(nextId);
		const settleWasConfirmed = carousel.confirmNavigationSettleRoute(nextId);
		const routeWasConfirmed = carousel.confirmHexNavigationRoute(nextId);
		// The confirmation callback can immediately start a queued transition.
		// In that case this route is only an intermediate frame and must not play
		// its normal scene-enter animation.
		this.routeState.suppressSceneEnter = (routeWasConfirmed || settleWasConfirmed) && carousel.isInteractionLocked();

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
		return (
			scene?.getScreenOverlayState?.() ?? {
				canvas: scene?.getScreenOverlayCanvas?.() ?? null,
				revision: 0,
			}
		);
	}

	setSceneOverlayDomPresentation(sceneId, active, container) {
		this.scenes.get(sceneId)?.setDomPresentation?.(active, container);
	}

	isSceneOverlayDomPresentationActive(sceneId) {
		return this.scenes.get(sceneId)?.isDomPresentationActive?.() === true;
	}

	/** @returns {import('./portfolio/caseStudyText/CaseStudyPanelHudMesh.js').CaseStudyPanelHudMesh[]} */
	_getCasePanelHudList() {
		if (!this._casePanelHuds) {
			const list = [];
			for (const scene of this.scenes.values()) {
				if (scene?.panelHud) {
					list.push(scene.panelHud);
				}
			}
			this._casePanelHuds = list;
		}
		return this._casePanelHuds;
	}

	/** Case panel HUD presenters (WebGL left text) — for compose mode / screen overlay. */
	forEachCasePanelHud(visitor) {
		for (const hud of this._getCasePanelHudList()) {
			visitor(hud);
		}
	}

	/** Open case's left HUD (or null). */
	getActiveCasePanelHud() {
		return this.getActiveScene()?.panelHud ?? null;
	}

	/**
	 * Click-hex mix-preview target HUD (not during case-boundary scroll).
	 * @param {string | null | undefined} previewSceneId
	 */
	getCasePanelHudBySceneId(previewSceneId) {
		if (!previewSceneId) {
			return null;
		}
		return this.scenes.get(previewSceneId)?.panelHud ?? null;
	}

	/** Two rAFs between compiles so preloader chrome can paint after a shader spike. */
	_yieldWarmupBreath() {
		return new Promise((resolve) => {
			requestAnimationFrame(() => {
				requestAnimationFrame(() => resolve());
			});
		});
	}

	/** Компилирует материалы сцен под прелоадером, отдавая браузеру кадр между сценами. */
	async warmupPrograms(options = {}) {
		const onlyIds = Array.isArray(options.sceneIds) && options.sceneIds.length ? new Set(options.sceneIds) : null;
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
				if (onlyIds && !onlyIds.has(id)) {
					continue;
				}
				const scene = sceneObj.getScene?.();
				if (!scene) {
					continue;
				}

				await this._yieldWarmupBreath();

				// Force-visible so prepare-hidden overlays (hero, case HUD, dormant hub)
				// still compile under the preloader curtain.
				const temporarilyVisible = [];
				scene.traverse((object) => {
					if (object.visible === false) {
						temporarilyVisible.push(object);
						object.visible = true;
					}
				});

				try {
					const frame = this._withSceneProgressFrame(this.getFrameContext(), id, getSceneCarousel());
					sceneObj.applyCamera?.(this.camera, frame);
					this.renderer.compile(scene, this.camera);
				} catch (error) {
					throw new Error(`[SceneManager] shader warm-up failed for ${id}`, { cause: error });
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
			// Passive visual response must survive hex Y-band hit ownership. The
			// interaction frame may zero `pointer`, but never this viewport signal.
			visualPointer: pointer,
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
		const dpr = this.renderer.getPixelRatio();
		if (this.size.w === width && this.size.h === height && this.size.dpr === dpr) {
			return;
		}
		this.size = { w: width, h: height, dpr };

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

	/**
	 * First real draw under the preloader curtain (compile ≠ draw).
	 * Sync helper — prefer {@link warmupSceneDrawChunked} so update and GPU split across paints.
	 * @param {string} sceneId
	 * @param {"a"|"b"} [mixSlot]
	 * @returns {THREE.Texture | null}
	 */
	warmupSceneDraw(sceneId, mixSlot = "b", renderOptions = {}) {
		const sceneObj = this.scenes.get(sceneId);
		const target = this._getMixLayerRenderTarget(sceneId, mixSlot);
		if (!sceneObj || !target || this._isContextLost()) {
			return null;
		}

		const warmToken = sceneObj.beginWarmupDraw?.() ?? null;
		try {
			this._warmupSceneUpdate(sceneId, sceneObj);
			return this._renderSceneLayer(sceneId, target, { ...renderOptions, force: true });
		} finally {
			sceneObj.endWarmupDraw?.(warmToken);
		}
	}

	/**
	 * Careful preloader draw: wake+update on one paint, GPU draw on the next.
	 * Keeps the loader UI responsive — never stack update+heavy RT in one sync spike.
	 * @param {string} sceneId
	 * @param {"a"|"b"} mixSlot
	 * @param {() => Promise<void>} yieldFn
	 * @param {{ force?: boolean }} [renderOptions]
	 * @returns {Promise<THREE.Texture | null>}
	 */
	async warmupSceneDrawChunked(sceneId, mixSlot, yieldFn, renderOptions = {}) {
		const sceneObj = this.scenes.get(sceneId);
		const target = this._getMixLayerRenderTarget(sceneId, mixSlot);
		if (!sceneObj || !target || this._isContextLost()) {
			return null;
		}

		const warmToken = sceneObj.beginWarmupDraw?.() ?? null;
		try {
			this._warmupSceneUpdate(sceneId, sceneObj);
			await yieldFn();
			if (this.disposed || this._isContextLost()) {
				return null;
			}
			return this._renderSceneLayer(sceneId, target, { ...renderOptions, force: true });
		} finally {
			sceneObj.endWarmupDraw?.(warmToken);
		}
	}

	_warmupSceneUpdate(sceneId, sceneObj) {
		const frame = this._withSceneProgressFrame(this.getFrameContext(), sceneId, getSceneCarousel());
		const updateFrame = this._withInteractionFrame(frame, false);
		sceneObj.setPointerState?.({ pointerDown: false, pointerBlocked: true });
		sceneObj.update?.(1 / 60, updateFrame);
	}

	/**
	 * Warm order: ring leave/enter neighbors first, then cases.
	 * One scene per chunked draw — never batch multiple RT draws in one frame.
	 */
	getWarmupDrawSceneIds() {
		const ids = [...this.scenes.keys()];
		const ring = CAROUSEL_SCENE_IDS.filter((id) => this.scenes.has(id));
		const cases = ids.filter((id) => id.startsWith("case"));
		const rest = ids.filter((id) => !ring.includes(id) && !cases.includes(id));
		return [...ring, ...cases, ...rest];
	}

	update(delta) {
		this.lastDelta = delta;
		this._syncCaseMixPreview();
		const frame = this.getFrameContext();
		const carouselHub = this.isCarouselHubActive();
		const carousel = getSceneCarousel();
		const carouselActiveIds = carouselHub ? this._getCarouselActiveIdSet() : null;
		const interaction = this._resolveInteractiveSceneContext(carousel, carouselHub);
		const interactiveId = interaction.sceneId;
		const interactiveScene = interactiveId ? this.scenes.get(interactiveId) : null;
		this.sceneDragOrbit.update(delta, {
			sceneId: interaction.orbitSceneId,
			pointer: frame.visualPointer,
			pointerDown: frame.pointerDown,
			enabled: Boolean(
				interactiveId
					&& interactiveScene?.isDragOrbitEnabled?.(frame) === true
					&& !frame.pointerBlocked
					&& !carousel.isInteractionLocked()
					&& getHexShaderProgress() <= 0.001
			),
		});
		const dragBlocksScenePointer = this.sceneDragOrbit.isBlockingScenePointer();

		for (const [id, scene] of this.scenes.entries()) {
			const isActive = scene === this.getActiveScene();
			const inCarousel = carouselActiveIds?.has(id) ?? false;
			const acceptsPointer = id === interactiveId && !dragBlocksScenePointer;
			const pointerState = {
				pointerDown: acceptsPointer ? frame.pointerDown : false,
				pointerBlocked: !acceptsPointer || frame.pointerBlocked,
			};

			if (carouselHub) {
				if (inCarousel) {
					const sceneFrame = this._withInteractionFrame(this._withSceneProgressFrame(frame, id, carousel), acceptsPointer);
					scene.setPointerState?.(pointerState);
					scene.update?.(delta, sceneFrame);
				} else if (scene.shouldKeepUpdating?.()) {
					// Case scenes leaving via hex — update for exit, never accept hub/page hits.
					scene.setPointerState?.({ pointerDown: false, pointerBlocked: true });
					scene.update?.(delta, this._withInteractionFrame(frame, false));
				}
				continue;
			}

			if (isActive || scene.shouldKeepUpdating?.()) {
				scene.setPointerState?.(pointerState);
				scene.update?.(delta, this._withInteractionFrame(frame, acceptsPointer));
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
		// React may have committed the nearest rest route one frame before the
		// fast-settle transaction changed to `awaitingRoute`. Re-check the already
		// displayed route here so the handshake cannot deadlock waiting for a prop
		// change that has already happened.
		const displayedSceneId = resolveSceneId(this.routeState.currentPage);
		const settleWasConfirmed = carousel.confirmNavigationSettleRoute(displayedSceneId);
		if (settleWasConfirmed && carousel.isInteractionLocked()) {
			this.routeState.suppressSceneEnter = true;
		}
	}

	/** Старт hex — reset target, mix-target warm, source leave prepare. */
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

	/**
	 * @param {string} sceneId
	 * @param {THREE.WebGLRenderTarget | null | undefined} layerTarget
	 * @param {{ force?: boolean }} [options] force — skip shouldRender empty-clear (preloader warm)
	 */
	_renderSceneLayer(sceneId, layerTarget, options = {}) {
		const sceneObj = this.scenes.get(sceneId);
		const target = layerTarget ?? this._getLayerRenderTarget();
		if (!sceneObj || !target) {
			return null;
		}

		if (sceneId?.startsWith("capabilities:") && sceneObj.shouldRender?.() === false) {
			sceneObj.prepareCarouselMixTarget?.();
		}

		if (
			!options.force
			&& sceneObj.shouldRender?.() === false
		) {
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
		this.sceneDragOrbit.apply(this.camera, sceneId, {
			orbitTarget: sceneObj.getDragOrbitTarget?.(this.camera, layerFrame) ?? null,
		});

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

		return this._renderSceneLayer(sceneId, this._getLayerRenderTarget());
	}

	dispose() {
		this.disposed = true;
		this.sceneDragOrbit?.dispose();
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
