import * as THREE from "three";
import { BackgroundPipeline } from "../render/background/BackgroundPipeline.js";
import { ScreenCompositor } from "../render/toScreen/ScreenCompositor.js";
import { updateSiteGrainBlurRadius } from "../render/toScreen/siteGrainBlurRuntime.js";
import { case1PostProcessConfig } from "../scenes/portfolio/case1/case1PostProcessConfig.js";
import { HexGridOverlayPass } from "../render/overlay/HexGridOverlayPass.js";
import { SceneManager } from "../scenes/SceneManager.js";
import { disposeSharedDracoLoader } from "../assets/gltfLoader.js";
import { getGraphicsConfig, getGraphicsTier, getGraphicsTierDiagnostics, resolveRendererPixelRatio } from "../../utils/getGraphicsTier.js";
import { applyDigitalWhaleConfigForTier } from "../scenes/home/digitalWhaleConfig.js";
import { isPostProcessBypassedFromUrl } from "../../utils/postProcessTestFlags.js";
import { ModelsPostProcessPipeline } from "../render/models/ModelsPostProcessPipeline.js";
import { AdaptiveFrameSkipper } from "../render/adaptiveFrameSkip.js";
import { createWebGLRenderer } from "../renderer/configureWebGLRenderer.js";
import { getHexRevealFromTop, getHexShaderProgress } from "../render/overlay/hexShaderProgress.js";
import { hexGridOverlayDefaults } from "../render/overlay/hexGridOverlayConfig.js";
import { getSceneCarousel, initCarouselScroll, syncCarouselFromPage, disposeCarouselScroll } from "@/three/render/transition/carouselPage.js";
import { CAROUSEL_SCENE_IDS, SCENE_ID_TO_PAGE } from "../render/transition/SceneCarousel.js";
import { isPortfolioCasePath, sceneIdToPage } from "../scenes/portfolio/hub/projectsData.js";
import { resolveSceneId } from "../scenes/resolveSceneId.js";
import { disposeHexTransitionSound, preloadHexTransitionSound, updateHexTransitionSound } from "../../sounds/hexTransitionSound.js";
import { disposeUnderwaterSound, preloadUnderwaterSound, updateUnderwaterSound } from "../../sounds/underwaterSound.js";
import { cancelSharedAnimationFrame, requestSharedAnimationFrame } from "@/utils/sharedAnimationFrame.js";
import { warmCasePanelHudUnderCurtain } from "@/portfolio/ui/CaseStudyCanvas/warmCasePanelHudUnderCurtain.js";
import { warmAboutPanelHudUnderCurtain } from "@/about/warmAboutPanelHudUnderCurtain.js";
import { getAboutPanelHudEnterProgress, getAboutPanelHudState } from "@/about/aboutPanelHudBridge.js";
import { armAboutPanelHudForRoute } from "@/about/aboutPanelHudStory.js";
import { getCasePanelHudEnterProgress } from "@/portfolio/core/casePanelHudBridge.js";
import { createCaseStudyArcOverlay, disposeCaseStudyArcOverlay, syncCaseStudyArcOverlay } from "@/three/scenes/portfolio/caseStudyArc/caseStudyArcHost.js";
import { BackgroundLiquidDevTools } from "../dev/BackgroundLiquidDevTools.js";
import { CaseStudyArcDevTools } from "../dev/CaseStudyArcDevTools.js";
import { CaseStudyStageRailDevTools } from "../dev/CaseStudyStageRailDevTools.js";
import { ProgressDevTools } from "../dev/ProgressDevTools.js";
import { isDevFastPreloader } from "../../utils/devFastPreloader.js";

const NO_GRAIN_BLUR = { enabled: false, radius: 0 };
/** DEV: skip HUD paints + all-scene/hex RT marathon under the curtain. */
const DEV_FAST_PRELOADER = isDevFastPreloader();
/** Idle home: mix progress ≈ 0 — hex/bloom/composite не нужны. */
const IDLE_HOME_HEX_EPS = 0.0001;
const CANVAS_POINTER_BLOCKER_SELECTOR = '[data-canvas-pointer-blocker="true"]';

function isCanvasPointerBlocked(event) {
	const target = event?.target;
	return target instanceof Element && Boolean(target.closest(CANVAS_POINTER_BLOCKER_SELECTOR));
}

function yieldToNextPaint() {
	return new Promise((resolve) => requestSharedAnimationFrame(() => resolve()));
}

/**
 * Preloader-friendly yield: two rAFs so the loader chrome can paint after a GPU spike.
 * Use between scene RT draws / hex warm steps — not for tiny uniform tweaks.
 */
function yieldForPreloaderBreath() {
	return new Promise((resolve) => {
		requestSharedAnimationFrame(() => {
			requestSharedAnimationFrame(() => resolve());
		});
	});
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
		this.liquidDevTools = import.meta.env.DEV
			? new BackgroundLiquidDevTools({
					getPipeline: () => this.backgroundPipeline,
				})
			: null;
		this.progressDevTools = import.meta.env.DEV ? new ProgressDevTools() : null;
		this.caseArcDevTools = import.meta.env.DEV ? new CaseStudyArcDevTools() : null;
		this.caseStageRailDevTools = import.meta.env.DEV ? new CaseStudyStageRailDevTools() : null;
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
		this.sceneOverlayTextures = new Map();
		this.sceneTransitionProgress = 0;
		this.hexGridOverlay = new HexGridOverlayPass(this.renderer);
		this.caseStudyArc = createCaseStudyArcOverlay();
		this._overlaySize = new THREE.Vector2();

		this.currentPage = "/";
		this.teleportPage = "/";
		this.routeTransition = options.routeTransition;
		this.startApp = false;

		this.dprCap = gfx.dprCap;
		this.dprFloor = gfx.dprFloor ?? null;
		this._lastDprLogKey = "";
		this._renderSize = { w: 0, h: 0, dpr: 0 };
		this.defaultPixelRatio = resolveRendererPixelRatio(tier, window.devicePixelRatio);
		this.setPixelRatio(this.defaultPixelRatio);

		this.clock = new THREE.Clock();
		this.frameSkipper = new AdaptiveFrameSkipper();
		this._caseFrameDelta = 0;
		this.rafId = null;
		this.disposed = false;
		this.renderedNotified = false;
		this.ready = false;
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
		this.preparePromise = this._prepareApplication();
	}

	/**
	 * Preloader warm gate (target model): wait assets → create late UI meshes →
	 * compile → real RT draw of every scene + hex leave pairs.
	 * Start must not unlock before this settles. compile() alone is not enough.
	 */
	async _prepareApplication() {
		try {
			if (DEV_FAST_PRELOADER) {
				// Don't block Start on every case GLB — only landing + home + background.
				const landingId = resolveSceneId(this.teleportPage || this.currentPage || "/");
				const criticalIds = new Set(["home", landingId]);
				const waits = [this.backgroundPipeline.readyPromise];
				for (const id of criticalIds) {
					const promise = this.sceneManager.getSceneById(id)?.readyPromise;
					if (promise) {
						waits.push(promise);
					}
				}
				await Promise.allSettled(waits);
				console.info(`[three] DEV fast preloader — waiting only for [${[...criticalIds].join(", ")}] (use ?fullWarm=1 to restore)`);
			} else {
				await Promise.all([this.sceneManager.readyPromise, this.backgroundPipeline.readyPromise]);
			}
			if (this.disposed) {
				return false;
			}

			await yieldToNextPaint();
			// Late UI under curtain, then compile (hero includes scroll-hint meshes).
			this.sceneManager.getSceneById("home")?.prepareHeroTextUnderCurtain?.();

			if (!DEV_FAST_PRELOADER) {
				await yieldToNextPaint();
				// Case HUD Canvas2D → CanvasTexture upload for every renderTextInScene case.
				await warmCasePanelHudUnderCurtain({
					sceneManager: this.sceneManager,
					renderer: this.renderer,
				});
				if (this.disposed) {
					return false;
				}

				await yieldToNextPaint();
				await warmAboutPanelHudUnderCurtain({
					sceneManager: this.sceneManager,
					renderer: this.renderer,
				});
				if (this.disposed) {
					return false;
				}
			}

			this.sceneManager.warmupRenderTargets();

			await this.sceneManager.warmupPrograms();
			if (this.disposed) {
				return false;
			}

			// Pipeline dry-run after all prepared materials exist (re-run if you add
			// another late prepare step that creates new ShaderMaterials).
			await this._warmupRenderPipeline();
			return true;
		} catch (error) {
			console.warn("[three] preload warm-up failed; continuing with runtime compilation", error);
			return false;
		} finally {
			if (!this.disposed) {
				this.ready = true;
			}
		}
	}

	async _warmupRenderPipeline() {
		await yieldToNextPaint();
		const backgroundTexture = this.backgroundPipeline.renderCarouselBackground(0) ?? this.backgroundPipeline.lastTexture;

		await yieldToNextPaint();
		const mix = this.sceneManager.renderModelsFrame({ skipIdleTargetLayer: true });
		const modelsTexture = mix?.sourceModels ?? null;
		const fullA = this.screenCompositor.compositeToLayerTarget(this.renderer, "a", backgroundTexture, modelsTexture, NO_GRAIN_BLUR);

		await yieldToNextPaint();
		const fullB = this.screenCompositor.compositeToLayerTarget(this.renderer, "b", backgroundTexture, modelsTexture, NO_GRAIN_BLUR);
		this.hexGridOverlay.setTextures(fullA, fullB);
		const hexTexture = this.hexGridOverlay.renderModelsMixToTexture(this.renderer) ?? fullA;

		await yieldToNextPaint();
		const warmedTexture = this.noPostProcess ? hexTexture : this.modelsPostProcess.applyBloom(hexTexture, 0, 1);
		this.screenCompositor.drawToScreen(this.renderer, null, warmedTexture ?? hexTexture, NO_GRAIN_BLUR);

		// Contract: every interactive scene + leave hex pairs get a REAL draw under
		// the curtain. compile() alone left case deep-link → home cold on HUD exit.
		// DEV fast path: one pipeline dry-run is enough to unlock Start while iterating.
		if (!DEV_FAST_PRELOADER) {
			await this._warmupAllScenesAndHexPairs(backgroundTexture);
		}

		await yieldToNextPaint();
		this._renderFrame(0);
	}

	/**
	 * Preloader honesty gate: real RT draw of every scene + leave hex pairs.
	 * Strictly sequential — one heavy GPU step per breath so the loader UI stays live.
	 */
	async _warmupAllScenesAndHexPairs(backgroundTexture) {
		const sceneIds = this.sceneManager.getWarmupDrawSceneIds();
		/** @type {Set<string>} */
		const drawnIds = new Set();
		const breath = () => yieldForPreloaderBreath();

		// Pass 1: one scene per chunk (update → breath → GPU draw).
		for (const sceneId of sceneIds) {
			if (this.disposed) {
				return;
			}
			await breath();
			const texture = await this.sceneManager.warmupSceneDrawChunked(sceneId, "a", breath);
			if (texture) {
				drawnIds.add(sceneId);
			}
		}

		// Pass 2: home + hub again — first InstancedMesh/ocean frame often still allocates.
		for (const sceneId of ["home", "portfolioHub"]) {
			if (this.disposed || !drawnIds.has(sceneId)) {
				continue;
			}
			await breath();
			await this.sceneManager.warmupSceneDrawChunked(sceneId, "b", breath);
		}

		const hexPairs = this._resolveWarmupHexPairs(sceneIds);
		const prevProgress = this.hexGridOverlay.material?.uniforms?.progress?.value ?? 0;

		for (const [sourceId, targetId] of hexPairs) {
			if (this.disposed) {
				break;
			}
			if (!drawnIds.has(sourceId) || !drawnIds.has(targetId)) {
				continue;
			}

			// Never stack two scene RTs + hex + bloom in one frame.
			await breath();
			const sourceTex = await this.sceneManager.warmupSceneDrawChunked(sourceId, "a", breath);
			if (!sourceTex || this.disposed) {
				continue;
			}

			await breath();
			const targetTex = await this.sceneManager.warmupSceneDrawChunked(targetId, "b", breath);
			if (!targetTex || this.disposed) {
				continue;
			}

			// Match runtime bake: home stays on black; everyone else gets liquid under models.
			const bgA = sourceId === "home" ? null : backgroundTexture;
			const bgB = targetId === "home" ? null : backgroundTexture;

			await breath();
			const fullA = this.screenCompositor.compositeToLayerTarget(this.renderer, "a", bgA, sourceTex, NO_GRAIN_BLUR);

			await breath();
			const fullB = this.screenCompositor.compositeToLayerTarget(this.renderer, "b", bgB, targetTex, NO_GRAIN_BLUR);

			await breath();
			this.hexGridOverlay.setTextures(fullA, fullB);
			this.hexGridOverlay.setProgress(0.55);
			const hexTexture = this.hexGridOverlay.renderModelsMixToTexture(this.renderer) ?? fullA;

			await breath();
			const warmed = this.noPostProcess ? hexTexture : this.modelsPostProcess.applyBloom(hexTexture, 0, 1);
			this.screenCompositor.drawToScreen(this.renderer, null, warmed ?? hexTexture, NO_GRAIN_BLUR);
		}

		this.hexGridOverlay.setProgress(prevProgress);
	}

	/**
	 * Every menu-reachable hex pair — not only ring-adjacent.
	 * Deep-link About → Home is a skip-neighbor jump; adjacent-only warm left it cold.
	 * @param {string[]} sceneIds
	 * @returns {Array<[string, string]>}
	 */
	_resolveWarmupHexPairs(sceneIds) {
		const idSet = new Set(sceneIds);
		/** @type {Array<[string, string]>} */
		const pairs = [];
		const seen = new Set();
		const pushPair = (a, b) => {
			if (!a || !b || a === b || !idSet.has(a) || !idSet.has(b)) {
				return;
			}
			const key = `${a}->${b}`;
			if (seen.has(key)) {
				return;
			}
			seen.add(key);
			pairs.push([a, b]);
		};

		const ring = CAROUSEL_SCENE_IDS.filter((id) => idSet.has(id));
		// Directed complete graph on the ring (menu / dots can jump any→any).
		for (const a of ring) {
			for (const b of ring) {
				pushPair(a, b);
			}
		}

		const caseIds = sceneIds.filter((id) => id.startsWith("case"));
		for (const caseId of caseIds) {
			pushPair(caseId, "home");
			pushPair("home", caseId);
			pushPair(caseId, "portfolioHub");
			pushPair("portfolioHub", caseId);
		}

		// Deep-link honesty: run active→home as the final pair (first-click leave path).
		const activeId = this.sceneManager.getActiveSceneId();
		if (activeId && activeId !== "home" && idSet.has(activeId) && idSet.has("home")) {
			const leaveKey = `${activeId}->home`;
			const withoutLeave = pairs.filter(([a, b]) => `${a}->${b}` !== leaveKey);
			withoutLeave.push([activeId, "home"]);
			return withoutLeave;
		}

		return pairs;
	}

	_getHexShaderProgress() {
		return getHexShaderProgress();
	}

	_syncHexShaderProgress() {
		const progress = this._getHexShaderProgress();
		this.sceneTransitionProgress = progress;
		this.hexGridOverlay.setProgress(progress);
		this.hexGridOverlay.setRevealFromTop(getHexRevealFromTop());
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
		// Sync viewport Y before click so hex hit-band ownership matches pointerdown.
		this._onViewportPointerMove(event);
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

	/**
	 * Карусель hex:
	 * - Home: чёрный фон; liquid только на стороне не-home (иначе дыры кита → liquid).
	 * - About / portfolio hub: liquid baked under models (near-black glass must not hit
	 *   luminance soft-key → blue liquid wash). About left HUD also bakes into this RT
	 *   on leave — not screen hex-cut.
	 * - Остальные: content на чёрной пластине → hex → keyed liquid (без warp фона).
	 */
	_renderCarouselHexFrame(delta, mix, reveal, grainBlur, bgOptions, noPost) {
		const pageA = sceneIdToPage(mix.sourceId) ?? SCENE_ID_TO_PAGE[mix.sourceId];
		const pageB = sceneIdToPage(mix.targetId) ?? SCENE_ID_TO_PAGE[mix.targetId];
		const hexProgress = this._getHexShaderProgress();
		const skipTargetLayer = hexProgress <= 0.0001 || mix.sourceId === mix.targetId;
		const bypassHexMix = hexProgress <= 0.0001;
		const involvesHome = pageA === "/" || pageB === "/";
		// About Front/Heart and hub plates are intentionally near-black — soft luminance key
		// treats them as empty plate and replaces with liquid. Bake liquid under models.
		const involvesAbout = pageA === "/about" || pageB === "/about" || mix.sourceId === "about" || mix.targetId === "about";
		const involvesPortfolioHub = mix.sourceId === "portfolioHub" || mix.targetId === "portfolioHub";
		const bakeBackgroundUnderModels = involvesHome || involvesAbout || involvesPortfolioHub;

		const sharedBackground = this.backgroundPipeline.renderCarouselBackground(delta, bgOptions) ?? this.backgroundPipeline.lastTexture;
		// Home never uses site liquid — even if the other carousel page already changed.
		const sourceBackground = pageA === "/" ? null : sharedBackground;

		const sourceOverlay = this._getPanelOverlayTextureForScene(mix.sourceId);

		if (bypassHexMix) {
			const fullA = this.screenCompositor.compositeToLayerTarget(this.renderer, "a", sourceBackground, mix.sourceModels, grainBlur, sourceOverlay);
			const frameTexture = noPost || reveal <= 0.0001 ? fullA : this.modelsPostProcess.applyBloom(fullA, delta, reveal);
			this.screenCompositor.drawToScreen(this.renderer, null, frameTexture, NO_GRAIN_BLUR);
			return;
		}

		// Home/About/hub ↔ *: per-side bake, no post-hex luminance key (eats near-black models).
		// Left HUD bakes into the hex RT here — screen hex-cut ghosts black cells
		// through the transparent text band (see _renderCasePanelHudScreenOverlays).
		if (bakeBackgroundUnderModels) {
			const bgA = pageA === "/" ? null : sharedBackground;
			const bgB = pageB === "/" ? null : sharedBackground;
			const contentA = this.screenCompositor.compositeToLayerTarget(this.renderer, "a", bgA, mix.sourceModels, grainBlur, this._getHexBakeOverlayTexture(mix.sourceId));

			let contentB = contentA;
			if (!skipTargetLayer) {
				contentB = this.screenCompositor.compositeToLayerTarget(this.renderer, "b", bgB, mix.targetModels, grainBlur, this._getHexBakeOverlayTexture(mix.targetId));
			}

			// Same UV warp on source (A) and target (B) — do not disable for case leave.
			this.hexGridOverlay.setSourceTextureEffectStrength(1);
			this.hexGridOverlay.setTextures(contentA, contentB);
			const hexTexture = this.hexGridOverlay.renderModelsMixToTexture(this.renderer) ?? contentA;
			const frameTexture = noPost || reveal <= 0.0001 ? hexTexture : this.modelsPostProcess.applyBloom(hexTexture, delta, reveal);
			this.screenCompositor.drawToScreen(this.renderer, null, frameTexture, NO_GRAIN_BLUR);
			return;
		}

		// Other pages: opaque black plate → hex → keyed liquid (screen-stable).
		// Case left HUD bakes into the hex RT (same as About) — not screen hex-cut.
		const contentA = this.screenCompositor.compositeToLayerTarget(this.renderer, "a", null, mix.sourceModels, grainBlur, this._getHexBakeOverlayTexture(mix.sourceId));

		let contentB = contentA;
		if (!skipTargetLayer) {
			contentB = this.screenCompositor.compositeToLayerTarget(this.renderer, "b", null, mix.targetModels, grainBlur, this._getHexBakeOverlayTexture(mix.targetId));
		}

		this.hexGridOverlay.setSourceTextureEffectStrength(1);
		this.hexGridOverlay.setTextures(contentA, contentB);
		const hexTexture = this.hexGridOverlay.renderModelsMixToTexture(this.renderer) ?? contentA;

		const baked = this.screenCompositor.compositeHexOverLiquidToLayer(this.renderer, "a", sharedBackground, hexTexture);
		const frameTexture = noPost || reveal <= 0.0001 ? baked : this.modelsPostProcess.applyBloom(baked, delta, reveal);
		this.screenCompositor.drawToScreen(this.renderer, null, frameTexture, NO_GRAIN_BLUR);
	}

	_getPanelOverlayTextureForScene(sceneId) {
		// Idle path / non-hex: case left HUD stays screen-overlay (sharp). Arc/chrome DOM
		// are never baked. Hex leave uses `_getHexBakeOverlayTexture` instead.
		if (sceneId?.startsWith("case")) {
			return null;
		}
		return this._getSceneOverlayTexture(sceneId);
	}

	/**
	 * Overlay fed into a hex layer RT. Left HUD (About + open case) bakes here so the
	 * wipe owns the glyphs — including portfolio→about at mix≈0.5 (About is target).
	 * Screen overlay stays off while About is in the hex mix (no double draw).
	 * Arc / project-nav chrome stay live DOM.
	 */
	_getHexBakeOverlayTexture(sceneId) {
		if (sceneId === "about") {
			return this._getAboutPanelHudHexOverlayTexture();
		}
		if (sceneId?.startsWith("case")) {
			return this._getCasePanelHudHexOverlayTexture(sceneId);
		}
		return this._getPanelOverlayTextureForScene(sceneId);
	}

	/** @returns {THREE.Texture | null} */
	_getAboutPanelHudHexOverlayTexture() {
		const carousel = getSceneCarousel();
		// Abort settle on About: leftover |progress| must not keep a static bake —
		// screen mosaic owns the band again (same gate as aboutInHexMix below).
		if (carousel.currentId === "about" && !carousel.isAboutBoundaryDrive() && !carousel.isHexNavigationActive()) {
			return null;
		}
		const aboutHud = this.sceneManager.getSceneById("about")?.panelHud;
		if (!aboutHud) {
			return null;
		}
		// Warm GPU texture must ride the hex target layer before route commit.
		// Arm show (enterProgress=null) as soon as About is in the wipe — scene
		// update can lag one frame behind carousel progress on the commit handoff.
		if (this.store?.appStarted) {
			const story = Number(this.store.aboutExperience?.storyProgress) || 0;
			armAboutPanelHudForRoute(story);
		}
		const bridge = getAboutPanelHudState();
		if (bridge.fromCanvas?.width) {
			aboutHud.syncFromBridge?.();
		}
		const texture = aboutHud.fromTexture;
		if (!texture?.image?.width) {
			return null;
		}
		// Keep UI sampling NoColorSpace even if a compositor path stamped sRGB.
		if (texture.colorSpace !== THREE.NoColorSpace) {
			texture.colorSpace = THREE.NoColorSpace;
		}
		return texture;
	}

	/**
	 * Leaving/open case left text only. Target case during hub→case / case→case keeps
	 * enterProgress=0 until after hex — do not flash warm glyphs into the wipe.
	 * @returns {THREE.Texture | null}
	 */
	_getCasePanelHudHexOverlayTexture(sceneId) {
		const hud = this.sceneManager.getCasePanelHudBySceneId(sceneId);
		if (!hud) {
			return null;
		}
		if (hud !== this.sceneManager.getActiveCasePanelHud()) {
			return null;
		}
		const enter = getCasePanelHudEnterProgress();
		const idleOrShown = enter == null || enter >= 0.999;
		if (!idleOrShown) {
			return null;
		}
		hud.syncFromBridge?.();
		const texture = hud.fromTexture;
		if (!texture?.image?.width) {
			return null;
		}
		return texture;
	}

	_getSceneOverlayTexture(sceneId) {
		const state = this.sceneManager.getSceneOverlayState(sceneId);
		const canvas = state.canvas;
		this.sceneOverlayTextures ??= new Map();
		const existing = this.sceneOverlayTextures.get(sceneId);

		if (!canvas?.width || !canvas?.height) {
			existing?.texture?.dispose();
			this.sceneOverlayTextures.delete(sceneId);
			return null;
		}

		let entry = existing;
		if (!entry || entry.canvas !== canvas || entry.width !== canvas.width || entry.height !== canvas.height) {
			entry?.texture?.dispose();
			const texture = new THREE.CanvasTexture(canvas);
			texture.colorSpace = THREE.SRGBColorSpace;
			texture.minFilter = THREE.NearestFilter;
			texture.magFilter = THREE.NearestFilter;
			texture.generateMipmaps = false;
			texture.needsUpdate = true;
			entry = { canvas, width: canvas.width, height: canvas.height, texture, revision: -1 };
			this.sceneOverlayTextures.set(sceneId, entry);
		}

		if (entry.revision !== state.revision) {
			entry.texture.needsUpdate = true;
			entry.revision = state.revision;
		}
		entry.texture.userData.screenRegion = state.region ?? null;
		return entry.texture;
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
		const progress = this.sceneTransitionProgress;
		const lite = this.gfx.litePipeline === true;
		const noPost = this.noPostProcess === true;
		const onCarousel = this.sceneManager.isCarouselHubActive();
		const bgOptions = noPost ? { skipLiquid: true } : undefined;

		const hexActive = this._getHexShaderProgress() > 0.0001;
		const caseOpen = Boolean(this.store.openedCase);
		// Left HUD compose/hide is folded into _renderCasePanelHudScreenOverlays
		// (one pass over cached HUDs). When case closed, hide all immediately.
		if (!caseOpen) {
			this.sceneManager.forEachCasePanelHud((hud) => {
				hud.setComposeMode("models");
				if (hud.visible) {
					hud.setVisible(false);
					hud.clearHexCut?.();
				}
			});
		}
		// Home scroll-hint is page-owned chrome (SITE_TRANSITION.md).
		// Do NOT gate on carousel.currentId — after home→case hex, currentId stays
		// "home" (cases are not ring ids) and the hint leaked onto the case page.
		{
			const homeHero = this.sceneManager.getSceneById("home")?.heroTitle;
			const onHomePage = !caseOpen && this.currentPage === "/";
			const carousel = getSceneCarousel();
			const homeInHexPair = hexActive && (carousel.getMixSourceTargetIds?.()?.sourceId === "home" || carousel.getMixSourceTargetIds?.()?.targetId === "home");
			if (homeHero && onHomePage) {
				homeHero.setScrollHintComposeMode?.(hexActive ? "models" : "screen");
			} else if (homeHero && !onHomePage && !homeInHexPair) {
				homeHero.hideScrollHint?.();
			}
		}

		const mix = this.sceneManager.renderModelsFrame({
			skipIdleTargetLayer: false,
		});

		// Right-arc vignette on bg+models only — HUD composites after bloom, stays bright.
		this.screenCompositor.setCaseStudyEdgeShade({
			enabled: Boolean(this.store.openedCase),
			delta,
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
				this._renderCasePanelHudScreenOverlays();
				this._renderHomeScrollHintOverlay();
				return;
			}
			this._renderCarouselHexFrame(delta, mix, reveal, grainBlur, bgOptions, noPost);
			this._renderCasePanelHudScreenOverlays();
			this._renderHomeScrollHintOverlay();
			return;
		}

		// Тот же full-frame путь, что у последнего hex-кадра: без скачка compositing/brightness.
		const fullFrame = this.screenCompositor.compositeToLayerTarget(this.renderer, "a", this.backgroundPipeline.lastTexture, mix.sourceModels, grainBlur);
		const frameTexture = noPost || reveal <= 0.0001 ? fullFrame : this.modelsPostProcess.applyBloom(fullFrame, delta, reveal);
		this.screenCompositor.drawToScreen(this.renderer, null, frameTexture, NO_GRAIN_BLUR);
		this._renderCasePanelHudScreenOverlays();
		this._renderHomeScrollHintOverlay();
	}

	_renderCasePanelHudScreenOverlays() {
		const carousel = getSceneCarousel();
		const caseOpen = Boolean(this.store.openedCase);
		const hexProgress = this._getHexShaderProgress();

		if (caseOpen) {
			// Idle: sharp screen overlay after bloom. Hex leave: left text is baked into
			// the hex RT — do not screen-draw with per-cell cut (black fills in the
			// transparent band). Arc / project-nav stay live DOM either way.
			const activeHud = this.sceneManager.getActiveCasePanelHud();
			const caseScrollMix = carousel.isCaseBoundaryDrive();
			const previewId = !caseScrollMix ? carousel.getHexMixTargetSceneId() : null;
			const previewHud = this.sceneManager.getCasePanelHudBySceneId(previewId);
			const hexLive = caseScrollMix || carousel.isHexNavigationActive();
			const hexOwnsLeftHud = hexLive && hexProgress > 0.0001;
			this.sceneManager.forEachCasePanelHud((hud) => {
				const allow = hud === activeHud || hud === previewHud;
				if (!allow) {
					if (hud.visible) {
						hud.setComposeMode("models");
						hud.setVisible(false);
						hud.clearHexCut?.();
					}
					return;
				}
				hud.clearHexCut?.();
				if (hexOwnsLeftHud) {
					// Baked into hex layer — do not screen-overlay.
					if (hud === activeHud) {
						hud.syncFromBridge?.();
					}
					return;
				}
				hud.setComposeMode("screen");
				hud.setVisible(true);
				hud.renderScreenOverlay(this.renderer);
			});
		} else {
			// About left HUD — idle: screen overlay after bloom.
			// Hex mix: baked into About layer (no screen). Do NOT key screen on
			// `currentPage === "/about"` — after leave commit carousel is already
			// portfolio while React page lags one frame → About text flashes on hub.
			// Gate hex-owns-HUD like case (`boundary || clickHex`), not leftover
			// |progress| alone — abort leave settles progress→0 while still on About
			// and must resume screen mosaic immediately.
			const aboutHud = this.sceneManager.getSceneById("about")?.panelHud;
			const mixIds = carousel.getMixSourceTargetIds?.() ?? {};
			const aboutMixParticipant = mixIds.sourceId === "about" || mixIds.targetId === "about";
			const aboutHexActive = carousel.isAboutBoundaryDrive() || carousel.isHexNavigationActive() || carousel.currentId !== "about";
			const aboutInHexMix = hexProgress > 0.0001 && aboutMixParticipant && aboutHexActive;
			const aboutScreenLive = carousel.currentId === "about" && !aboutInHexMix;
			if (aboutHud && (aboutScreenLive || aboutInHexMix)) {
				const aboutBridge = getAboutPanelHudState();
				let aboutEnter = getAboutPanelHudEnterProgress();
				const hasContent = Boolean(aboutBridge.fromCanvas?.width || aboutHud.fromTexture);
				// Warm leaves enterProgress=0 (hidden). Never screen-draw that state on
				// live About — one frame of blank text1 after portfolio→about hex.
				if (aboutScreenLive && hasContent && aboutEnter === 0 && this.store?.appStarted) {
					armAboutPanelHudForRoute(Number(this.store.aboutExperience?.storyProgress) || 0);
					aboutEnter = getAboutPanelHudEnterProgress();
				}
				const hiddenIdle = !hasContent && aboutEnter === 0;
				if (hiddenIdle && aboutScreenLive) {
					aboutHud.setVisible(false);
					aboutHud.clearHexCut?.();
				} else if (aboutInHexMix) {
					if (aboutBridge.fromCanvas?.width) {
						aboutHud.syncFromBridge();
					}
					aboutHud.clearHexCut?.();
				} else {
					aboutHud.setComposeMode("screen");
					aboutHud.setVisible(true);
					aboutHud.syncFromBridge();
					aboutHud.clearHexCut?.();
					aboutHud.renderScreenOverlay(this.renderer);
				}
			} else if (aboutHud) {
				if (aboutHud.visible) {
					aboutHud.setVisible(false);
				}
				aboutHud.clearHexCut?.();
			}
		}

		// Right arc: site chrome — keep during case→case even if openedCase flickers.
		this.renderer.getSize(this._overlaySize);
		const isMobile = this._overlaySize.x < 768;
		syncCaseStudyArcOverlay(this.caseStudyArc, {
			showCase: true,
			viewportW: this._overlaySize.x,
			viewportH: this._overlaySize.y,
			isMobile,
		});
		if (this.caseStudyArc?.visible) {
			this.caseStudyArc.renderScreenOverlay(this.renderer);
		}
	}

	_renderHomeScrollHintOverlay() {
		// Visual page ownership — not carousel.currentId (stale after home→case).
		if (this.store.openedCase || this.currentPage !== "/") {
			return;
		}
		const carousel = getSceneCarousel();
		if (carousel.isHexNavigationActive?.() || carousel.isCaseBoundaryDrive?.()) {
			return;
		}
		if (this._getHexShaderProgress() > 0.0001) {
			return;
		}
		const home = this.sceneManager.getSceneById("home");
		home?.heroTitle?.renderScrollHintOverlay?.(this.renderer);
	}

	/** Состояние рендера карусели → store (debug-панель). */
	_syncCarouselRenderState() {
		if (!this.sceneManager.isCarouselHubActive()) {
			if (import.meta.env.DEV) {
				this.store.sceneCarouselRenderMode = "off";
				this.store.sceneCarouselRenderingIds = [];
			}
			this.store.sceneCarouselClickTransitionActive = false;
			this.store.sceneCarouselClickPhase = "idle";
			this.store.sceneCarouselClickTargetId = null;
			return;
		}

		const carousel = getSceneCarousel();
		const hexProgress = this._getHexShaderProgress();
		if (import.meta.env.DEV) {
			const renderingIds = carousel.getActiveSceneIds(hexProgress);
			this.store.sceneCarouselRenderMode = renderingIds.length > 1 ? "mix" : "single";
			this.store.sceneCarouselRenderingIds = renderingIds;
			this.store.sceneCarouselPreviousId = carousel.previousId;
			this.store.sceneCarouselNextId = carousel.nextId;
			this.store.sceneCarouselSceneProgress = carousel.getSceneProgressSnapshot();
		}
		this.store.sceneCarouselCurrentId = carousel.currentId;
		this.store.hexShaderProgress = hexProgress;
		this.store.sceneCarouselProgress = carousel.progress;
		this.store.sceneCarouselProgressTarget = carousel.progressTarget;
		this.store.sceneCarouselClickTransitionActive = carousel.isInteractionLocked();
		this.store.sceneCarouselClickPhase = carousel.getHexNavigationPhase();
		this.store.sceneCarouselClickTargetId = carousel.getHexTargetSceneId();
	}

	setPixelRatio(dpr) {
		this.renderer.setPixelRatio(dpr);
		this.onResize();
	}

	_resolveRenderFpsCap() {
		const tierCap = this.gfx.renderFpsCap ?? 0;
		if (!isPortfolioCasePath(this.currentPage)) {
			return tierCap;
		}
		const caseIsStatic = (this.routeTransition?.phase ?? "idle") === "idle" && this.sceneManager.requiresContinuousRender() === false;
		const caseCap = caseIsStatic ? (this.gfx.staticCaseRenderFpsCap ?? 8) : (this.gfx.caseRenderFpsCap ?? 24);
		return tierCap > 0 ? Math.min(tierCap, caseCap) : caseCap;
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
		const renderCap = this._resolveRenderFpsCap();
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
			this._caseFrameDelta = 0;
			// Page-owned home chrome: drop «листайте вниз» the instant we leave "/".
			// Do not wait for hex end — carousel.currentId can stay "home" after home→case.
			if (next.currentPage !== "/") {
				this.sceneManager.getSceneById("home")?.heroTitle?.hideScrollHint?.();
			}
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
		this.hexGridOverlay.setSize(w, h);
		this.screenCompositor.setSize(w, h, this.renderer);
		this._logRendererPixelRatio();
	}

	_notifyRenderedOnce() {
		if (this.renderedNotified || !this.ready) {
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
			cancelSharedAnimationFrame(this.rafId);
			this.rafId = null;
		}

		this.onWebGLContextLost(reason);
	}

	start() {
		const tick = () => {
			if (this.disposed) {
				return;
			}
			this.rafId = requestSharedAnimationFrame(tick);

			const delta = this.clock.getDelta();
			const onPortfolioCase = isPortfolioCasePath(this.currentPage);
			const adaptiveSkipRender = this.frameSkipper.shouldSkipRender({
				tier: this.gfxTier,
				renderFpsCap: this._resolveRenderFpsCap(),
			});
			const carousel = getSceneCarousel();
			const skipRender = adaptiveSkipRender;
			this.store.renderFps = Math.round(this.frameSkipper.getFps());
			this.store.renderFrameSkipped = skipRender;

			let sceneDelta = delta;
			if (onPortfolioCase) {
				this._caseFrameDelta = Math.min(0.1, this._caseFrameDelta + delta);
				sceneDelta = this._caseFrameDelta;
			}
			if (!onPortfolioCase || !skipRender) {
				this.sceneManager.update(sceneDelta);
				if (onPortfolioCase) {
					this._caseFrameDelta = 0;
				}
			}
			this._syncNativeCursor();

			const routePhase = this.routeTransition?.phase ?? "idle";
			const hexProgress = this._getHexShaderProgress();
			const hexQuiet = hexProgress <= 0.0001;
			// On skipped case frames: keep liquid time via backgroundPipeline, but skip
			// carousel/hex store churn and underwater/hex audio when nothing is transitioning.
			const lightCaseSkip = skipRender && onPortfolioCase && routePhase === "idle" && hexQuiet;

			if (this.sceneManager.isCarouselHubActive() && !hexGridOverlayDefaults._devOverrideProgress) {
				// A background-tab/DevTools pause can make Clock return a multi-second
				// delta. Feeding that into the carousel's rest curve can erase a fresh
				// About entry overshoot before visual progress gets its first frame.
				carousel.update(Math.min(delta, 0.05));
				this.sceneManager.afterCarouselUpdate(carousel);
			}

			if (!lightCaseSkip) {
				updateHexTransitionSound(delta, getSceneCarousel(), {
					currentPage: this.currentPage,
					teleportPage: this.teleportPage,
					routePhase,
				});
				updateUnderwaterSound(delta, {
					currentPage: this.currentPage,
					routePhase,
					homeScene: this.sceneManager.getSceneById("home"),
					carousel: getSceneCarousel(),
					mixProgress: hexProgress,
				});
				this._syncHexShaderProgress();
				this._syncCarouselRenderState();
			} else {
				this.sceneTransitionProgress = hexProgress;
			}

			this.backgroundPipeline.update(delta, {
				skipLiquid: this.noPostProcess,
				skipRender,
			});

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
		disposeCaseStudyArcOverlay(this.caseStudyArc);
		this.caseStudyArc = null;
		if (this.rafId !== null) {
			cancelSharedAnimationFrame(this.rafId);
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
		this.liquidDevTools?.dispose?.();
		this.liquidDevTools = null;
		this.progressDevTools?.dispose?.();
		this.progressDevTools = null;
		this.caseArcDevTools?.dispose?.();
		this.caseArcDevTools = null;
		this.caseStageRailDevTools?.dispose?.();
		this.caseStageRailDevTools = null;
		this.backgroundPipeline.dispose();
		disposeCarouselScroll();
		disposeHexTransitionSound();
		disposeUnderwaterSound();
		this.modelsPostProcess.dispose();
		this.sceneManager.dispose();
		for (const entry of this.sceneOverlayTextures?.values?.() ?? []) {
			entry.texture?.dispose();
		}
		this.sceneOverlayTextures?.clear?.();
		this.hexGridOverlay.dispose();
		this.screenCompositor.dispose();
		disposeSharedDracoLoader();
		this.renderer?.dispose?.();
		this.canvas.remove();
	}
}
