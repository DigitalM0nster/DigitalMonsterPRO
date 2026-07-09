import * as THREE from "three";
import { BackgroundPipeline } from "../render/background/BackgroundPipeline.js";
import { ScreenCompositor } from "../render/toScreen/ScreenCompositor.js";
import { updateSiteGrainBlurRadius } from "../render/toScreen/siteGrainBlurRuntime.js";
import { case1PostProcessConfig } from "../scenes/portfolio/case1/case1PostProcessConfig.js";
import { SceneTransitionPass } from "../render/transition/SceneTransitionPass.js";
import { HexGridOverlayPass } from "../render/overlay/HexGridOverlayPass.js";
import { SceneManager } from "../scenes/SceneManager.js";
import { disposeSharedDracoLoader } from "../assets/gltfLoader.js";
import { getGraphicsConfig, getGraphicsTier, getGraphicsTierDiagnostics, resolveRendererPixelRatio } from "../../utils/getGraphicsTier.js";
import { applyDigitalWhaleConfigForTier } from "../scenes/home/digitalWhaleConfig.js";
import { isPostProcessBypassedFromUrl } from "../../utils/postProcessTestFlags.js";
import { HexGridOverlayDevTools } from "../dev/HexGridOverlayDevTools.js";
import { disposeDevPanelHotkeys } from "../dev/devPanelHotkeys.js";
import { ModelsPostProcessPipeline } from "../render/models/ModelsPostProcessPipeline.js";
import { AdaptiveFrameSkipper } from "../render/adaptiveFrameSkip.js";
import { createWebGLRenderer } from "../renderer/configureWebGLRenderer.js";
import { getHexShaderProgress } from "../render/overlay/hexShaderProgress.js";
import { hexGridOverlayDefaults } from "../render/overlay/hexGridOverlayConfig.js";
import { getSceneCarousel, initCarouselScroll, syncCarouselFromPage, disposeCarouselScroll } from "../render/transition/carouselPage.js";
import { SCENE_ID_TO_PAGE } from "../render/transition/SceneCarousel.js";
import { sceneIdToPage } from "../scenes/portfolio/hub/projectsData.js";
import { getCasePanelTransitionCanvasState } from "@/portfolio/core/casePanelTransitionBridge.js";
import { disposeHexTransitionSound, preloadHexTransitionSound, updateHexTransitionSound } from "../../sounds/hexTransitionSound.js";
import { disposeUnderwaterSound, preloadUnderwaterSound, updateUnderwaterSound } from "../../sounds/underwaterSound.js";

const NO_GRAIN_BLUR = { enabled: false, radius: 0 };
/** Idle home: mix progress ≈ 0 — hex/bloom/composite не нужны. */
const IDLE_HOME_HEX_EPS = 0.0001;
const CANVAS_POINTER_BLOCKER_SELECTOR = '[data-canvas-pointer-blocker="true"]';

function isCanvasPointerBlocked(event) {
	const target = event?.target;
	return target instanceof Element && Boolean(target.closest(CANVAS_POINTER_BLOCKER_SELECTOR));
}

/**
 * Главный 3D-движок: чистый THREE.js.
 */
export class DigitalMonsterThreeApp {
	constructor(container, options) {
		this.container = container;
		this.store = options.store;
		this.onResize = this.onResize.bind(this);
		this.setRendered = options.setRendered ?? (() => {});
		this.onWebGLContextLost = options.onWebGLContextLost ?? (() => {});

		const tier = getGraphicsTier();
		applyDigitalWhaleConfigForTier(tier);
		const gfx = getGraphicsConfig(tier);
		this.gfxTier = tier;
		this.gfx = gfx;
		this.noPostProcess = gfx.noPostProcess === true || isPostProcessBypassedFromUrl();

		this.canvas = document.createElement("canvas");
		this.canvas.style.display = "block";
		this.canvas.style.width = "100%";
		this.canvas.style.height = "100%";
		container.appendChild(this.canvas);

		try {
			this.renderer = createWebGLRenderer({
				canvas: this.canvas,
				alpha: false,
				antialias: gfx.antialias,
				powerPreference: gfx.powerPreference,
			});
		} catch (error) {
			this.canvas.remove();
			throw error;
		}
		this._webglLost = false;
		this._onContextLost = (event) => {
			event.preventDefault();
			this._handleWebGLContextLost("webglcontextlost");
		};
		this._onContextRestored = () => {
			this._webglLost = false;
		};
		this.canvas.addEventListener("webglcontextlost", this._onContextLost, false);
		this.canvas.addEventListener("webglcontextrestored", this._onContextRestored, false);
		this.renderer.outputColorSpace = THREE.SRGBColorSpace;
		this.renderer.setClearColor(0x000000, 1);

		this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 150);
		this.camera.position.set(0, 0, 9);

		this.pointer = { x: 0, y: 0 };
		this.viewportPointer = { x: 0, y: 0 };
		this.pointerDown = false;
		this.pointerBlocked = false;
		this._onPointerMove = this._onPointerMove.bind(this);
		this._onViewportPointerMove = this._onViewportPointerMove.bind(this);
		this._onPointerDown = this._onPointerDown.bind(this);
		this._onPointerUp = this._onPointerUp.bind(this);

		this.backgroundPipeline = new BackgroundPipeline(this.renderer, this.camera, this.store);
		this.sceneManager = new SceneManager(this.renderer, this.camera, {
			store: this.store,
			getPointer: () => this.pointer,
			getViewportPointer: () => this.viewportPointer,
			getPointerDown: () => this.pointerDown,
			getPointerBlocked: () => this.pointerBlocked,
			gfx,
		});
		this.modelsPostProcess = new ModelsPostProcessPipeline(this.renderer, gfx);
		this.screenCompositor = new ScreenCompositor();
		this.casePanelTransitionTexture = null;
		this.casePanelTransitionRevision = -1;
		this.sceneTransitionPass = new SceneTransitionPass(this.renderer);
		this.hexGridOverlay = new HexGridOverlayPass(this.renderer);
		this.hexGridDevTools = import.meta.env.DEV ? new HexGridOverlayDevTools(() => this.hexGridOverlay) : null;

		this.currentPage = "/";
		this.teleportPage = "/";
		this.routeTransition = options.routeTransition;
		this.startApp = false;

		this.dprCap = gfx.dprCap;
		this.dprFloor = gfx.dprFloor ?? null;
		this._lastDprLogKey = "";
		this._renderSize = { w: 0, h: 0, dpr: 0 };
		this.setPixelRatio(resolveRendererPixelRatio(tier, window.devicePixelRatio));

		this.clock = new THREE.Clock();
		this.frameSkipper = new AdaptiveFrameSkipper();
		this.rafId = null;
		this.disposed = false;
		this.renderedNotified = false;
		this._nativeCursorIsPointer = null;

		window.addEventListener("resize", this.onResize);
		this._resizeObserver =
			typeof ResizeObserver !== "undefined"
				? new ResizeObserver(() => {
						this.onResize();
					})
				: null;
		this._resizeObserver?.observe(container);
		window.addEventListener("pointermove", this._onViewportPointerMove, { passive: true });
		window.addEventListener("pointerdown", this._onPointerDown);
		window.addEventListener("pointerup", this._onPointerUp);
		this.canvas.addEventListener("pointermove", this._onPointerMove);
		this.canvas.addEventListener("pointerup", this._onPointerUp);
		this.canvas.addEventListener("pointercancel", this._onPointerUp);
		syncCarouselFromPage(this.currentPage);
		initCarouselScroll(() => this.currentPage);
		const carousel = getSceneCarousel();
		carousel.setOnHexLifecycleStart((payload) => {
			this.sceneManager.onHexNavigationStart(carousel, payload);
		});
		this._syncHexShaderProgress();
		this.onResize();
	}

	_getHexShaderProgress() {
		return getHexShaderProgress();
	}

	_syncHexShaderProgress() {
		const progress = this._getHexShaderProgress();
		this.sceneTransitionPass.setProgress(progress);
		this.hexGridOverlay.setOptions({ progress });
	}

	_onPointerMove(event) {
		if (isCanvasPointerBlocked(event)) {
			this._clearInteractivePointer();
			return;
		}
		this.pointerBlocked = false;

		const rect = this.canvas.getBoundingClientRect();
		if (rect.width <= 0 || rect.height <= 0) {
			return;
		}
		this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		this.pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
	}

	/** NDC по всему окну — для наклона сетки хаба над HTML-меню. */
	_onViewportPointerMove(event) {
		const w = window.innerWidth;
		const h = window.innerHeight;
		if (w <= 0 || h <= 0) {
			return;
		}
		this.viewportPointer.x = (event.clientX / w) * 2 - 1;
		this.viewportPointer.y = -((event.clientY / h) * 2 - 1);

		if (isCanvasPointerBlocked(event)) {
			this._clearInteractivePointer();
			return;
		}
		this.pointerBlocked = false;
	}

	_onPointerDown(event) {
		// Только ЛКМ — иначе отпускание ПКМ открывает кейс как клик.
		if (event.button !== 0 || isCanvasPointerBlocked(event)) {
			this._clearInteractivePointer();
			return;
		}
		this.pointerBlocked = false;
		this.pointerDown = true;
	}

	_onPointerUp(event) {
		if (event?.button !== undefined && event.button !== 0) {
			return;
		}
		if (isCanvasPointerBlocked(event)) {
			this._clearInteractivePointer();
			return;
		}
		this.pointerBlocked = false;
		this.pointerDown = false;
	}

	_clearInteractivePointer() {
		this.pointerBlocked = true;
		this.pointer.x = 2;
		this.pointer.y = 2;
		this.pointerDown = false;
	}

	_buildGrainBlur(delta, progress, lite, noPost) {
		const grainBlurRadius = noPost
			? 0
			: lite && this.gfxTier === "low"
				? 0
				: updateSiteGrainBlurRadius(delta, {
						scroll: this.store.scroll,
						carouselProgress: progress,
						viewportWidth: this.container.clientWidth || window.innerWidth,
						openedCase: this.store.openedCase,
					});

		return {
			enabled: !noPost && !lite && case1PostProcessConfig.grainBlur.enabled !== false,
			radius: grainBlurRadius,
		};
	}

	/** B1: idle `/` — whale-scene RT сразу на экран (без hex, bloom, composite-слоя). */
	_shouldUseIdleHomeDirectPipeline(mix) {
		if (this.currentPage !== "/") {
			return false;
		}

		const hexProgress = this._getHexShaderProgress();
		return mix.sourceId === "home" && mix.targetId === "home" && hexProgress <= IDLE_HOME_HEX_EPS;
	}

	_renderIdleHomeDirectFrame(mix) {
		this.screenCompositor.drawToScreen(this.renderer, null, mix.sourceModels, NO_GRAIN_BLUR);
	}

	/** Карусель: полный кадр A/B (фон + модели) → hex → bloom → экран. */
	_renderCarouselHexFrame(delta, mix, reveal, grainBlur, bgOptions, noPost) {
		const pageA = sceneIdToPage(mix.sourceId) ?? SCENE_ID_TO_PAGE[mix.sourceId];
		const pageB = sceneIdToPage(mix.targetId) ?? SCENE_ID_TO_PAGE[mix.targetId];
		const hexProgress = this._getHexShaderProgress();
		const skipTargetLayer = hexProgress <= 0.0001 || mix.sourceId === mix.targetId;
		// Idle: одна сцена, переход не идёт — hex fullscreen pass не нужен.
		const bypassHexMix = hexProgress <= 0.0001 && mix.sourceId === mix.targetId;

		// Один liquid-фон для обеих сцен: яркость/scale уже плавно обновлены в BackgroundPipeline.update().
		const sharedBackground = this.backgroundPipeline.renderCarouselBackground(delta, bgOptions) ?? this.backgroundPipeline.lastTexture;
		const bgA = pageA === "/" ? null : sharedBackground;
		const panelOverlay = mix.sourceId.startsWith("case") ? this._getCasePanelTransitionTexture() : null;
		const fullA = this.screenCompositor.compositeToLayerTarget(this.renderer, "a", bgA, mix.sourceModels, grainBlur, panelOverlay);

		let fullB = fullA;
		if (!skipTargetLayer) {
			const bgB = pageB === "/" ? null : sharedBackground;
			fullB = this.screenCompositor.compositeToLayerTarget(this.renderer, "b", bgB, mix.targetModels, grainBlur);
		}

		let hexTexture = fullA;
		if (!bypassHexMix) {
			this.hexGridOverlay.setTextures(fullA, fullB);
			hexTexture = this.hexGridOverlay.renderModelsMixToTexture(this.renderer) ?? fullA;
		}

		const frameTexture = noPost ? hexTexture : this.modelsPostProcess.applyBloom(hexTexture, delta, reveal);

		// grain уже внутри full RT; на экран — только итоговый кадр.
		this.screenCompositor.drawToScreen(this.renderer, null, frameTexture, NO_GRAIN_BLUR);
	}

	_getCasePanelTransitionTexture() {
		const state = getCasePanelTransitionCanvasState();
		if (!state.canvas) {
			this.casePanelTransitionTexture?.dispose();
			this.casePanelTransitionTexture = null;
			this.casePanelTransitionRevision = state.revision;
			return null;
		}

		if (state.revision !== this.casePanelTransitionRevision) {
			this.casePanelTransitionTexture?.dispose();
			this.casePanelTransitionTexture = new THREE.CanvasTexture(state.canvas);
			this.casePanelTransitionTexture.colorSpace = THREE.SRGBColorSpace;
			this.casePanelTransitionTexture.minFilter = THREE.LinearFilter;
			this.casePanelTransitionTexture.magFilter = THREE.LinearFilter;
			this.casePanelTransitionTexture.generateMipmaps = false;
			this.casePanelTransitionTexture.needsUpdate = true;
			this.casePanelTransitionRevision = state.revision;
		}

		return this.casePanelTransitionTexture;
	}

	/**
	 * litePipeline: экономия на фоне/bloom/grain в покое.
	 * Hex-mix на карусели — полный кадр (фон + модели) на всех tier.
	 * ?noPost — без liquid, bloom, grain (hex остаётся).
	 */
	_renderFrame(delta) {
		if (this._webglLost || this.renderer?.getContext()?.isContextLost?.()) {
			return;
		}

		try {
			this._renderFrameInner(delta);
		} catch (error) {
			console.error("[three] render frame failed", error);
			this._handleWebGLContextLost("render");
		}
	}

	_renderFrameInner(delta) {
		const progress = this.sceneTransitionPass.getProgress();
		const lite = this.gfx.litePipeline === true;
		const noPost = this.noPostProcess === true;
		const onCarousel = this.sceneManager.isCarouselHubActive();
		const bgOptions = noPost ? { skipLiquid: true } : undefined;

		const mix = this.sceneManager.renderModelsFrame({
			skipIdleTargetLayer: false,
		});

		const reveal = noPost
			? 0
			: onCarousel
				? this.sceneManager.getBloomRevealForMix(mix.sourceId, mix.targetId, progress)
				: this.sceneManager.getBloomRevealForSceneId(this.sceneManager.getActiveSceneId());

		const grainBlur = this._buildGrainBlur(delta, progress, lite, noPost);

		if (onCarousel) {
			if (this._shouldUseIdleHomeDirectPipeline(mix)) {
				this._renderIdleHomeDirectFrame(mix);
				return;
			}
			this._renderCarouselHexFrame(delta, mix, reveal, grainBlur, bgOptions, noPost);
			return;
		}

		// Тот же full-frame путь, что у последнего hex-кадра: без скачка compositing/brightness.
		const fullFrame = this.screenCompositor.compositeToLayerTarget(this.renderer, "a", this.backgroundPipeline.lastTexture, mix.sourceModels, grainBlur);
		const frameTexture = noPost ? fullFrame : this.modelsPostProcess.applyBloom(fullFrame, delta, reveal);
		this.screenCompositor.drawToScreen(this.renderer, null, frameTexture, NO_GRAIN_BLUR);
	}

	/** Состояние рендера карусели → store (debug-панель). */
	_syncCarouselRenderState() {
		if (!this.sceneManager.isCarouselHubActive()) {
			this.store.sceneCarouselRenderMode = "off";
			this.store.sceneCarouselRenderingIds = [];
			this.store.sceneCarouselClickTransitionActive = false;
			return;
		}

		const carousel = getSceneCarousel();
		const hexProgress = this._getHexShaderProgress();
		const renderingIds = carousel.getActiveSceneIds(hexProgress);

		this.store.sceneCarouselRenderMode = renderingIds.length > 1 ? "mix" : "single";
		this.store.sceneCarouselRenderingIds = renderingIds;
		this.store.sceneCarouselCurrentId = carousel.currentId;
		this.store.sceneCarouselPreviousId = carousel.previousId;
		this.store.sceneCarouselNextId = carousel.nextId;
		this.store.hexShaderProgress = hexProgress;
		this.store.sceneCarouselProgress = carousel.progress;
		this.store.sceneCarouselProgressTarget = carousel.progressTarget;
		this.store.sceneCarouselSceneProgress = carousel.getSceneProgressSnapshot();
		this.store.sceneCarouselClickTransitionActive = carousel.isInteractionLocked();
	}

	setPixelRatio(dpr) {
		this.renderer.setPixelRatio(dpr);
		this.onResize();
	}

	/** В консоль: с каким DPR реально рендерим (без спама каждый кадр). */
	_logRendererPixelRatio() {
		const dpr = this.renderer.getPixelRatio();
		const buffer = this.renderer.getDrawingBufferSize(new THREE.Vector2());
		const cssW = this.container.clientWidth || window.innerWidth;
		const cssH = this.container.clientHeight || window.innerHeight;
		const key = `${dpr}|${buffer.x}|${buffer.y}`;

		if (this._lastDprLogKey === key) {
			return;
		}
		this._lastDprLogKey = key;
		const lite = this.gfx.litePipeline === true;
		const renderCap = this.gfx.renderFpsCap;
		const noPost = this.noPostProcess ? " · noPost" : "";
		const diag = getGraphicsTierDiagnostics();
		const memLabel = diag.memoryGb != null ? `${diag.memoryGb}GB` : "n/a";
		console.info(
			`[DigitalMonsterThree] tier=${this.gfxTier}${lite ? " · litePipeline" : ""}${noPost}${renderCap ? ` · renderCap=${renderCap}fps` : ""} · DPR=${dpr} · буфер ${buffer.x}×${buffer.y} · CSS ${Math.round(cssW)}×${Math.round(cssH)}`,
		);
		console.info(
			`[DigitalMonsterThree] tier detect: score=${diag.score} · ${diag.cores}c · RAM ${memLabel}${diag.mobile ? " · mobile" : " · desktop"}${diag.forced ? ` · forced=${diag.forced}` : ""}`,
		);
		if (this.noPostProcess) {
			const reason = this.gfx.noPostProcess ? "tier=low" : "?noPost";
			console.info(`[DigitalMonsterThree] post-process OFF — liquid, bloom, grain blur skipped (${reason}) · hex mix ON`);
		}
	}

	setProps(next) {
		const prevPage = this.currentPage;

		if (next.currentPage !== undefined) {
			this.currentPage = next.currentPage;
		}
		if (next.teleportPage !== undefined) {
			this.teleportPage = next.teleportPage;
		}
		if (next.routeTransition !== undefined) {
			this.routeTransition = next.routeTransition;
		}
		if (next.startApp !== undefined) {
			this.startApp = next.startApp === true;
			if (this.startApp) {
				void preloadHexTransitionSound();
				void preloadUnderwaterSound();
			}
		}

		if (next.currentPage !== undefined && next.currentPage !== prevPage) {
			syncCarouselFromPage(next.currentPage);
		}

		this.sceneManager.setRouteState({
			currentPage: this.currentPage,
			teleportPage: this.teleportPage,
			routePhase: this.routeTransition?.phase ?? "idle",
			appStarted: this.startApp,
		});
		this._syncHexShaderProgress();
		this._syncCarouselRenderState();

		this.backgroundPipeline.setRouteState({
			currentPage: this.currentPage,
			teleportPage: this.teleportPage,
			routePhase: this.routeTransition?.phase ?? "idle",
		});
	}

	onResize() {
		if (this._webglLost || !this.renderer?.getContext()) {
			return;
		}

		const w = this.container.clientWidth || window.innerWidth;
		const h = this.container.clientHeight || window.innerHeight;
		const dpr = this.renderer.getPixelRatio();
		if (w <= 0 || h <= 0) {
			return;
		}
		if (this._renderSize.w === w && this._renderSize.h === h && this._renderSize.dpr === dpr) {
			return;
		}
		this._renderSize = { w, h, dpr };

		this.renderer.setSize(w, h, false);
		this.camera.aspect = w / h;
		this.camera.updateProjectionMatrix();
		this.backgroundPipeline.setSize(w, h);
		this.sceneManager.setSize(w, h);
		this.modelsPostProcess.setSize(w, h);
		this.sceneTransitionPass.setSize(w, h);
		this.hexGridOverlay.setSize(w, h);
		this.screenCompositor.setSize(w, h, this.renderer);
		this._logRendererPixelRatio();
	}

	_notifyRenderedOnce() {
		if (this.renderedNotified || !this.sceneManager.ready) {
			return;
		}
		this.renderedNotified = true;
		queueMicrotask(() => this.setRendered(true));
	}

	_syncNativeCursor() {
		const isPointer = Boolean(this.store.cursor.caseHovered || this.store.cursor.projectListHovered || this.store.cursor.caseNavHovered);
		if (isPointer === this._nativeCursorIsPointer) {
			return;
		}

		this._nativeCursorIsPointer = isPointer;
		const cursor = isPointer ? "pointer" : "default";
		this.container.style.cursor = cursor;
		this.canvas.style.cursor = cursor;
	}

	_handleWebGLContextLost(reason) {
		if (this._webglLost || this.disposed) {
			return;
		}

		this._webglLost = true;
		console.warn("[three] WebGL context lost:", reason);

		if (this.rafId !== null) {
			cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}

		this.onWebGLContextLost(reason);
	}

	start() {
		const tick = () => {
			if (this.disposed) {
				return;
			}
			this.rafId = requestAnimationFrame(tick);

			const delta = this.clock.getDelta();

			this.sceneManager.update(delta);
			this._syncNativeCursor();

			if (this.sceneManager.isCarouselHubActive() && !hexGridOverlayDefaults._devOverrideProgress) {
				getSceneCarousel().update(delta);
				this.sceneManager.afterCarouselUpdate(getSceneCarousel());
			}

			updateHexTransitionSound(delta, getSceneCarousel(), {
				currentPage: this.currentPage,
				teleportPage: this.teleportPage,
				routePhase: this.routeTransition?.phase ?? "idle",
			});
			updateUnderwaterSound(delta, {
				currentPage: this.currentPage,
				routePhase: this.routeTransition?.phase ?? "idle",
				homeScene: this.sceneManager.getSceneById("home"),
				carousel: getSceneCarousel(),
				mixProgress: this._getHexShaderProgress(),
			});

			this._syncHexShaderProgress();
			this._syncCarouselRenderState();

			this.backgroundPipeline.update(delta, this.noPostProcess ? { skipLiquid: true } : undefined);

			const skipRender = this.frameSkipper.shouldSkipRender({
				tier: this.gfxTier,
				renderFpsCap: this.gfx.renderFpsCap ?? 0,
			});
			this.store.renderFps = Math.round(this.frameSkipper.getFps());
			this.store.renderFrameSkipped = skipRender;

			if (!skipRender) {
				this._renderFrame(delta);
			}

			this._notifyRenderedOnce();
		};
		tick();
	}

	dispose() {
		this.disposed = true;
		this.container.style.cursor = "";
		this.canvas.style.cursor = "";
		this.store.cursor.caseHovered = false;
		this.store.cursor.projectListHovered = false;
		this.store.cursor.caseNavHovered = false;
		if (this.rafId !== null) {
			cancelAnimationFrame(this.rafId);
		}
		window.removeEventListener("resize", this.onResize);
		this._resizeObserver?.disconnect();
		this._resizeObserver = null;
		window.removeEventListener("pointermove", this._onViewportPointerMove);
		window.removeEventListener("pointerdown", this._onPointerDown);
		window.removeEventListener("pointerup", this._onPointerUp);
		this.canvas.removeEventListener("pointermove", this._onPointerMove);
		this.canvas.removeEventListener("pointerup", this._onPointerUp);
		this.canvas.removeEventListener("pointercancel", this._onPointerUp);
		this.canvas.removeEventListener("webglcontextlost", this._onContextLost, false);
		this.canvas.removeEventListener("webglcontextrestored", this._onContextRestored, false);
		this.backgroundPipeline.dispose();
		this.hexGridDevTools?.dispose();
		disposeDevPanelHotkeys();
		disposeCarouselScroll();
		disposeHexTransitionSound();
		disposeUnderwaterSound();
		this.modelsPostProcess.dispose();
		this.sceneManager.dispose();
		this.sceneTransitionPass.dispose();
		this.casePanelTransitionTexture?.dispose();
		this.casePanelTransitionTexture = null;
		this.hexGridOverlay.dispose();
		this.screenCompositor.dispose();
		disposeSharedDracoLoader();
		this.renderer?.dispose?.();
		this.canvas.remove();
	}
}
