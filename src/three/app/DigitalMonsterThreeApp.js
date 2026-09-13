import * as THREE from "three";
import { getScenePixelRatio, setScenePixelRatio, resolveOutputPixelRatio } from "../renderer/renderResolution.js";
import { syncVisibleViewport } from "../renderer/syncVisibleViewport.js";
import { publishSceneViewportResize } from "../renderer/sceneViewportEvents.js";
import { getHexVisibleBands } from "../render/overlay/hexVisibleBands.js";
import { PreparationScheduler, resolveFullWarm } from "./preparationScheduler.js";
import { warmScreenOverlay } from "../renderer/warmScreenOverlay.js";
import { waitForCompiledPrograms } from "../renderer/compileSceneChunked.js";
import { prepareSceneCanvasInterfaces } from "@/app/prepareSceneCanvasInterfaces.js";
import { DeviceTiltInput } from "../interaction/DeviceTiltInput.js";
import { BackgroundPipeline } from "../render/background/BackgroundPipeline.js";
import { ScreenCompositor } from "../render/toScreen/ScreenCompositor.js";
import { updateSiteGrainBlurRadius } from "../render/toScreen/siteGrainBlurRuntime.js";
import { case1PostProcessConfig } from "../scenes/portfolio/case1/case1PostProcessConfig.js";
import { HexGridOverlayPass } from "../render/overlay/HexGridOverlayPass.js";
import { SceneManager } from "../scenes/SceneManager.js";
import { disposeSharedDracoLoader } from "../assets/gltfLoader.js";
import { getGraphicsConfig, getGraphicsTier, getGraphicsTierDiagnostics, resolveRendererPixelRatio, setCalibratedGraphicsTier, isMobileGraphicsDevice } from "@/functions/getGraphicsTier.js";
import { applyDigitalWhaleConfigForTier } from "../scenes/home/digitalWhaleConfig.js";
import { isPostProcessBypassedFromUrl } from "@/functions/postProcessTestFlags.js";
import { ModelsPostProcessPipeline } from "../render/models/ModelsPostProcessPipeline.js";
import { AdaptiveFrameSkipper } from "../render/adaptiveFrameSkip.js";
import { createWebGLRenderer } from "../renderer/configureWebGLRenderer.js";
import { calibrateGraphicsTier } from "../renderer/calibrateGraphicsTier.js";
import { shouldTrialHighDpr, measurePreparedHighDpr } from "../renderer/highDprTrial.js";
import { getHexRevealFromTop, getHexShaderProgress } from "../render/overlay/hexShaderProgress.js";
import { hexGridOverlayDefaults } from "../render/overlay/hexGridOverlayConfig.js";
import { getSceneCarousel, initCarouselScroll, syncCarouselFromPage, disposeCarouselScroll } from "@/three/render/transition/carouselPage.js";
import { CAROUSEL_SCENE_IDS, SCENE_ID_TO_PAGE } from "../render/transition/SceneCarousel.js";
import { isPortfolioCasePath, sceneIdToPage } from "../scenes/portfolio/hub/projectsData.js";
import { disposeHexTransitionSound, preloadHexTransitionSound, updateHexTransitionSound } from "../../sounds/hexTransitionSound.js";
import { disposeUnderwaterSound, preloadUnderwaterSound, updateUnderwaterSound } from "../../sounds/underwaterSound.js";
import { cancelSharedAnimationFrame, requestSharedAnimationFrame } from "@/functions/sharedAnimationFrame.js";
import { warmCasePanelHudUnderCurtain } from "@/pages/portfolio/ui/CaseStudyCanvas/warmCasePanelHudUnderCurtain.js";
import { warmAboutPanelHudUnderCurtain } from "@/pages/about/warmAboutPanelHudUnderCurtain.js";
import { getAboutPanelHudEnterProgress, getAboutPanelHudState } from "@/pages/about/aboutPanelHudBridge.js";
import { armAboutPanelHudForRoute } from "@/pages/about/aboutPanelHudStory.js";
import { getCasePanelHudEnterProgress } from "@/pages/portfolio/core/casePanelHudBridge.js";
import { isCapabilitySceneId } from "@/pages/capabilities/data/capabilities.js";
import { createSiteArcOverlay, disposeSiteArcOverlay, syncSiteArcOverlay } from "@/components/SiteArc/three/siteArcHost.js";
import { AboutEpicTextDevTools } from "../dev/AboutEpicTextDevTools.js";
import { BackgroundLiquidDevTools } from "../dev/BackgroundLiquidDevTools.js";
import { SiteArcDevTools } from "../dev/SiteArcDevTools.js";
import { CaseStudyStageRailDevTools } from "../dev/CaseStudyStageRailDevTools.js";
import { BelkaOrbitsDevTools } from "../dev/BelkaOrbitsDevTools.js";
import { ProgressDevTools } from "../dev/ProgressDevTools.js";
import { PortfolioCameraDevTools } from "../dev/PortfolioCameraDevTools.js";
import { OceanDevTools } from "../dev/OceanDevTools.js";
import { MediumHomeDevTools } from "../dev/MediumHomeDevTools.js";
import { LowHomeDevTools } from "../dev/LowHomeDevTools.js";
import { Mmk1CameraDevTools } from "../dev/Mmk1CameraDevTools.js";

const NO_GRAIN_BLUR = { enabled: false, radius: 0 };
const CAPABILITY_HUD_SCENES = ["capabilities:syntheticCore", "capabilities:spatialMatrix"];
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
 * Главный 3D-движок: чистый THREE.js.
 */
export class DigitalMonsterThreeApp {
	constructor(container, options) {
		this.container = container;
		this.store = options.store;
		this.store.preparationProgress = 0;
		this.onResize = this.onResize.bind(this);
		this._scheduleResize = this._scheduleResize.bind(this);
		this._resizeFrame = null;
		this._resizeTimer = null;
		this.setRendered = options.setRendered ?? (() => {});
		this.onWebGLContextLost = options.onWebGLContextLost ?? (() => {});

		const hardwareTier = getGraphicsTier();
		const provisionalGfx = getGraphicsConfig(hardwareTier);

		this.canvas = document.createElement("canvas");
		this.canvas.style.display = "block";
		this.canvas.style.width = "100%";
		this.canvas.style.height = "100%";
		container.appendChild(this.canvas);

		try {
			this.renderer = createWebGLRenderer({
				canvas: this.canvas,
				alpha: false,
				antialias: provisionalGfx.antialias,
				powerPreference: provisionalGfx.powerPreference,
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

		const calibration = calibrateGraphicsTier(this.renderer, hardwareTier);
		const tier = calibration.tier;
		setCalibratedGraphicsTier(tier, calibration);
		applyDigitalWhaleConfigForTier(tier);
		const gfx = getGraphicsConfig(tier);
		this.gfxTier = tier;
		this.gfx = gfx;
		this.noPostProcess = gfx.noPostProcess === true || isPostProcessBypassedFromUrl();
		this.store.graphicsTier = tier;
		this.store.graphicsDprCap = gfx.dprCap;
		this.store.graphicsDprFloor = gfx.dprFloor ?? null;
		this.store.graphicsDpr = resolveRendererPixelRatio(tier, window.devicePixelRatio);
		this.store.sparklesCount = gfx.sparkles;
		this.store.reduceBackgroundBlur = gfx.reduceBackgroundBlur;
		this.store.graphicsAntialias = gfx.antialias;
		this.store.graphicsBloomMipmap = gfx.bloomMipmap;
		this.store.graphicsBloomLevels = gfx.bloomLevels;
		this.store.graphicsBloomRadius = gfx.bloomRadius;
		this.store.graphicsPowerPreference = gfx.powerPreference;

		this.camera = new THREE.PerspectiveCamera(40, 1, 0.01, 200);
		this.camera.position.set(0, 0, 9);

		this.pointer = { x: 0, y: 0 };
		this.deviceTilt = new DeviceTiltInput();
		this._inputKind = window.matchMedia("(pointer: coarse)").matches ? "touch" : "mouse";
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
		this.aboutEpicTextDevTools = import.meta.env.DEV ? new AboutEpicTextDevTools() : null;
		this.belkaOrbitsDevTools = import.meta.env.DEV
			? new BelkaOrbitsDevTools({
					getScene: () => this.sceneManager?.getSceneById?.("case06") ?? null,
				})
			: null;
		this.siteArcDevTools = import.meta.env.DEV ? new SiteArcDevTools() : null;
		this.caseStageRailDevTools = import.meta.env.DEV ? new CaseStudyStageRailDevTools() : null;
		this.sceneManager = new SceneManager(this.renderer, this.camera, {
			store: this.store,
			getPointer: () => this.pointer,
			getViewportPointer: () => this.viewportPointer,
			getVisualPointer: () => this._inputKind === "touch" && !this.pointerDown && this.deviceTilt.available ? this.deviceTilt.pointer : this.viewportPointer,
			getPointerDown: () => this.pointerDown,
			getPointerBlocked: () => this.pointerBlocked,
			gfx,
		});
		this.oceanDevTools = import.meta.env.DEV
			? new OceanDevTools({
					getScene: () => this.sceneManager?.getSceneById?.("home") ?? null,
				})
			: null;
		this.mediumHomeDevTools = import.meta.env.DEV && this.gfxTier === "medium"
			? new MediumHomeDevTools({ getScene: () => this.sceneManager?.getSceneById("home") }) : null;
		this.lowHomeDevTools = import.meta.env.DEV && this.gfxTier === "low"
			? new LowHomeDevTools({ getScene: () => this.sceneManager?.getSceneById("home") }) : null;
		this.portfolioCameraDevTools = import.meta.env.DEV
			? new PortfolioCameraDevTools({
					getScene: () => this.sceneManager?.getSceneById?.("portfolioHub") ?? null,
					getCamera: () => this.camera,
				})
			: null;
		this.mmk1CameraDevTools = import.meta.env.DEV
			? new Mmk1CameraDevTools({
					getScene: () => this.sceneManager?.getSceneById?.("capabilities:mmk1") ?? null,
					getCityScene: () => this.sceneManager?.getSceneById?.("capabilities:spatialMatrix") ?? null,
					getCamera: () => this.camera,
				})
			: null;
		this.modelsPostProcess = new ModelsPostProcessPipeline(this.renderer, gfx);
		this.screenCompositor = new ScreenCompositor();
		this.sceneOverlayTextures = new Map();
		this.sceneTransitionProgress = 0;
		this.hexGridOverlay = new HexGridOverlayPass(this.renderer);
		this.siteArc = createSiteArcOverlay();
		this._overlaySize = new THREE.Vector2();

		this.currentPage = "/";
		this.teleportPage = "/";
		this.routeTransition = options.routeTransition;
		this.startApp = false;

		this.dprCap = gfx.dprCap;
		this.dprFloor = gfx.dprFloor ?? null;
		this._lastDprLogKey = "";
		this._renderSize = { w: 0, h: 0, dpr: 0 };
		this._baselinePixelRatio = resolveRendererPixelRatio(tier, window.devicePixelRatio);
		this._highDprTrialPending = shouldTrialHighDpr({ tier, width: window.innerWidth,
			baselineDpr: this._baselinePixelRatio });
		this.fullWarm = resolveFullWarm();
		this.defaultPixelRatio = this._highDprTrialPending ? 2 : this._baselinePixelRatio;
		this.store.graphicsDpr = this.defaultPixelRatio;
		this.setPixelRatio(this.defaultPixelRatio);

		this.clock = new THREE.Clock();
		this.frameSkipper = new AdaptiveFrameSkipper();
		this._caseFrameDelta = 0;
		this.rafId = null;
		this.disposed = false;
		this._hexBandsEnabled = new URLSearchParams(window.location.search).get("hexBands") !== "full";
		this._directHexBloomEnabled = new URLSearchParams(window.location.search).get("hexBloomCopy") !== "1";
		this.renderedNotified = false;
		this.ready = false;
		this._nativeCursor = null;

		window.addEventListener("resize", this._scheduleResize);
		window.visualViewport?.addEventListener("resize", this._scheduleResize);
		this._resizeObserver =
			typeof ResizeObserver !== "undefined"
				? new ResizeObserver(() => {
						this._scheduleResize();
					})
				: null;
		this._resizeObserver?.observe(container);
		// Capture keeps passive scene parallax alive above DOM chrome whose
		// handlers may stop pointermove propagation (left menu, HUD, arc).
		window.addEventListener("pointermove", this._onViewportPointerMove, {
			passive: true,
			capture: true,
		});
		window.addEventListener("pointerdown", this._onPointerDown);
		window.addEventListener("pointerup", this._onPointerUp);
		this.canvas.addEventListener("pointermove", this._onPointerMove);
		this.canvas.addEventListener("pointerup", this._onPointerUp);
		this.canvas.addEventListener("pointercancel", this._onPointerUp);
		this.canvas.addEventListener("lostpointercapture", this._onPointerUp);
		syncCarouselFromPage(this.currentPage);
		initCarouselScroll(() => this.currentPage);
		const carousel = getSceneCarousel();
		carousel.setOnHexLifecycleStart((payload) => {
			this.sceneManager.onHexNavigationStart(carousel, payload);
		});
		this._syncHexShaderProgress();
		this.onResize();
		this.preparationScheduler = new PreparationScheduler({
			nextFrame: yieldToNextPaint, cancelled: () => this.disposed || this._webglLost,
		});
		this.preparePromise = this._prepareApplication();
		if (this.mediumHomeDevTools) this.preparePromise.then(() => this.mediumHomeDevTools?.apply());
		if (this.lowHomeDevTools) this.preparePromise.then(() => this.lowHomeDevTools?.apply());
	}

	/**
	 * Preloader warm gate (target model): wait assets → create late UI meshes →
	 * compile → real RT draw of every scene + hex leave pairs.
	 * Start must not unlock before this settles. compile() alone is not enough.
	 */
	async _prepareApplication() {
		this.preparationStartedAt = performance.now();
		this.preparationStage = "scene-assets";
		if (!this.fullWarm) {
			const homePrepared = this.sceneManager.readyPromise
				.then(async () => {
					if (this.disposed || this._webglLost) return false;
					const home = this.sceneManager.getSceneById("home");
					await home?.prepareHeroTextUnderCurtain?.();
					if (this.disposed || this._webglLost) return false;
					await home?.prepareResourcesUnderCurtain?.(this.renderer, this.preparationScheduler);
					return !this.disposed && !this._webglLost;
				})
				.catch((error) => {
					this.prepareError = error;
					console.error("[three] development scene preparation failed", error);
					return false;
				});
			// Fast dev skips the site-wide warm traversal, not Low's visible effect.
			// Wait before Start and before restoring the Low panel's saved uniform.
			if (this.gfxTier === "low" && !await homePrepared) return false;
			this.ready = true;
			this._setPreparationProgress(1);
			return true;
		}
		try {
			// Report completed scene resources, not elapsed time or downloaded bytes.
			let completedScenes = 0;
			const scenes = [...this.sceneManager.scenes.values()];
			for (const scene of scenes) {
				Promise.resolve(scene.readyPromise).then(() => {
					this._setPreparationProgress(0.25 * (++completedScenes / scenes.length));
				}, () => {}); // The canonical readyPromise below owns failure handling.
			}
			await Promise.all([this.sceneManager.readyPromise, this.backgroundPipeline.readyPromise]);
			if (this.disposed) {
				return false;
			}
			// All model consumers are ready; decoded geometry no longer needs the
			// Draco workers or their WASM heaps during GPU warming and navigation.
			disposeSharedDracoLoader();

			await yieldToNextPaint();
			// Late UI under curtain, then compile (hero includes scroll-hint meshes).
			this.preparationStage = "home-typography";
			await this.sceneManager.getSceneById("home")?.prepareHeroTextUnderCurtain?.();
			if (this.disposed || this._webglLost) return false;
			this._setPreparationProgress(0.29);

			await yieldToNextPaint();
			// Case and capability HUD canvases/textures for every locale.
			this.preparationStage = "case-typography";
			await warmCasePanelHudUnderCurtain({
				sceneManager: this.sceneManager,
				renderer: this.renderer,
			});
			this._setPreparationProgress(0.32);
			if (this.disposed) {
				return false;
			}

			await yieldToNextPaint();
			this.preparationStage = "about-typography";
			await warmAboutPanelHudUnderCurtain({
				sceneManager: this.sceneManager,
				renderer: this.renderer,
			});
			this.preparationStage = "scene-interfaces";
			await prepareSceneCanvasInterfaces(this.sceneManager, this.renderer, this.preparationScheduler);
			await this.siteArc.labels.prepare(this.renderer);
			this._setPreparationProgress(0.35);
			if (this.disposed) {
				return false;
			}

			await this.preparationScheduler.run(() => this.sceneManager.warmupRenderTargets(), { gpu: true });
			this._setPreparationProgress(0.36);

			this.preparationStage = "shader-compilation";
			const pendingCompiles = [];
			await this.sceneManager.warmupPrograms({ scheduler: this.preparationScheduler, pendingCompiles,
				onProgress: (done, total) => this._setPreparationProgress(0.36 + 0.16 * done / total),
			});
			this._setPreparationProgress(0.52);
			this.preparationStage = "interface-gpu-warmup";
			await this._warmupScreenOverlays(pendingCompiles);
			if (this.disposed) {
				return false;
			}

			// Pipeline dry-run after all prepared materials exist (re-run if you add
			// another late prepare step that creates new ShaderMaterials).
			await this._warmupRenderPipeline();
			await this._calibratePreparedHighDpr();
			if (!this.disposed && !this._webglLost) {
				const failedProgram = this.renderer.info.programs.find((program) => program.diagnostics?.runnable === false);
				if (failedProgram) throw new Error(`Shader program ${failedProgram.name || failedProgram.id} could not compile`);
				this.ready = true;
				this.preparationStage = "ready";
				this.preparationPair = null;
				this._setPreparationProgress(1);
				return true;
			}
			return false;
		} catch (error) {
			if (this.disposed) return false;
			this.prepareError = error;
			console.error("[three] allWarm preparation failed; Start remains locked", error);
			return false;
		}
	}

	_setPreparationProgress(progress) {
		if (this.disposed || this._webglLost) return;
		this.store.preparationProgress = Math.max(this.store.preparationProgress, Math.min(1, progress));
	}

	async _warmupRenderPipeline() {
		this.preparationStage = "compositor-gpu-warmup";
		const scheduler = this.preparationScheduler;
		await this.backgroundPipeline.prepareProgramsUnderCurtain(scheduler);
		const backgroundTexture = await scheduler.run(() =>
			this.backgroundPipeline.renderCarouselBackground(0) ?? this.backgroundPipeline.lastTexture, { gpu: true });
		await this.screenCompositor.prepareProgramsUnderCurtain(this.renderer, scheduler, backgroundTexture);
		this._setPreparationProgress(0.66);
		await this.hexGridOverlay.prepareProgramsUnderCurtain(scheduler);

		// Every directed pair gets its own real hex draw. All pairs feed the same
		// hex RT into the same bloom/output programs, so warm those shared passes once.
		const hexTexture = await this._warmupAllScenesAndHexPairs(backgroundTexture);
		if (!hexTexture) throw new Error("[three] allWarm produced no hex texture");
		if (!this.noPostProcess) await this.modelsPostProcess.bloom.prepareProgramsUnderCurtain(scheduler);
		let warmedTexture = this.noPostProcess ? hexTexture : await scheduler.run(() =>
			this.modelsPostProcess.applyBloom(hexTexture, 0, 1), { gpu: true });
		const hexTarget = this.hexGridOverlay.modelsMixTarget;
		if (this._directHexBloomEnabled && isMobileGraphicsDevice() && !this.noPostProcess
			&& hexTexture === hexTarget?.texture && this.modelsPostProcess.canApplyBloomFromPreparedTarget(hexTarget)) {
			// Exercise the same retained raw hex RT and bloom passes before Start.
			warmedTexture = await scheduler.run(() =>
				this.modelsPostProcess.applyBloomFromPreparedTarget(hexTarget, 0, 1), { gpu: true });
		}
		this._setPreparationProgress(0.98);
		await scheduler.run(() => this.screenCompositor.drawToScreen(
			this.renderer, null, warmedTexture ?? hexTexture, NO_GRAIN_BLUR), { gpu: true });
		this._setPreparationProgress(0.99);

		await scheduler.run(() => this._renderFrame(0), { gpu: true });
	}

	async _calibratePreparedHighDpr() {
		if (!this._highDprTrialPending || this.disposed || this._webglLost) return;
		this._highDprTrialPending = false;
		this.preparationStage = "high-dpr-calibration";
		const viewportKey = () => `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio}`;
		const measuredViewport = viewportKey();
		const sceneIds = this.sceneManager.getWarmupDrawSceneIds();
		const result = await measurePreparedHighDpr({
			sceneIds, nextFrame: yieldToNextPaint,
			draw: (sceneId) => this._drawPreparedHighDprFrame(sceneId),
			cancelled: () => this.disposed || this._webglLost || this.renderer.getContext().isContextLost(),
			isCurrentViewport: () => window.innerWidth >= 980 && viewportKey() === measuredViewport
				&& getScenePixelRatio(this.renderer) === 2,
			isVisible: () => document.visibilityState !== "hidden",
		});
		this.highDprCalibration = { ...result, viewport: measuredViewport };
		if (this.disposed || this._webglLost || this.renderer.getContext().isContextLost()) return;
		if (!result.accepted) {
			// A one-time fallback remains under the curtain. Reuse scene/UI owners;
			// no asset reload, second prepareSceneCanvasInterfaces or runtime DPR loop.
			this.defaultPixelRatio = resolveRendererPixelRatio(this.gfxTier, window.devicePixelRatio);
			this.store.graphicsDpr = this.defaultPixelRatio;
			this.setPixelRatio(this.defaultPixelRatio);
			await yieldToNextPaint();
			if (viewportKey() !== measuredViewport) {
				await warmCasePanelHudUnderCurtain({ sceneManager: this.sceneManager, renderer: this.renderer });
				await warmAboutPanelHudUnderCurtain({ sceneManager: this.sceneManager, renderer: this.renderer });
			}
			await this._warmupScreenOverlays();
			await this._warmupRenderPipeline();
		} else {
			// The sample's final scene must not become the visible start frame.
			await this.preparationScheduler.run(() => this._renderFrame(0), { gpu: true });
		}
	}

	_drawPreparedHighDprFrame(sceneId) {
		const delta = 1 / 60;
		const home = sceneId === "home";
		const scene = this.sceneManager.getSceneById(sceneId);
		if (!scene) return false;
		const restoreHero = scene.heroTitle?.beginPerformanceProbeDraw?.();
		const overlays = [scene.canvasInterface, scene.panelHud, scene.world?.hud, scene._cameraHotspots].filter(Boolean);
		const modes = overlays.map(overlay => [overlay, overlay.composeMode]);
		try {
			for (const overlay of overlays) overlay.setComposeMode?.("screen");
			const background = home ? null : this.backgroundPipeline.renderCarouselBackground(delta,
				this.noPostProcess ? { skipLiquid: true } : undefined);
			const drawPrepared = (models) => {
			const composed = home ? models : this.screenCompositor.compositeToLayerTarget(
				this.renderer, "a", background, models, NO_GRAIN_BLUR);
			// Match the existing idle Home direct path. Other prepared pages include bloom.
			const output = home || this.noPostProcess ? composed : this.modelsPostProcess.applyBloom(composed, delta, 1);
			this.screenCompositor.drawToScreen(this.renderer, null, output, NO_GRAIN_BLUR);
			const clear = this.renderer.autoClear;
			try {
				this.renderer.autoClear = false;
				for (const overlay of overlays) {
					if (!overlay.overlayScene) continue;
					// Use the real prepared HUD program; do not substitute its raw bitmap.
					// Scene-owned layouts retain their normal visibility and geometry.
					if (overlay === scene.panelHud && overlay.contentMesh && overlay.fromTexture) {
						const visible = overlay.contentMesh.visible;
						const u = overlay.contentMaterial.uniforms;
						const enter = u.uEnterProgress.value, opacity = u.opacity.value;
						try {
							overlay.contentMesh.visible = true;
							u.uEnterProgress.value = -1; u.opacity.value = 1;
							this.renderer.render(overlay.overlayScene, overlay.overlayCamera ?? this.sceneManager.camera);
						} finally { overlay.contentMesh.visible = visible; u.uEnterProgress.value = enter; u.opacity.value = opacity; }
					} else this.renderer.render(overlay.overlayScene, overlay.overlayCamera ?? this.sceneManager.camera);
				}
				scene.heroTitle?.renderTextOverlay?.(this.renderer);
			} finally { this.renderer.autoClear = clear; }
			};
			return Boolean(this.sceneManager.warmupSceneDraw(sceneId, "a", {
				performanceProbe: true, afterPreparedDraw: drawPrepared,
			}));
		} finally {
			for (const [overlay, mode] of modes) overlay.setComposeMode?.(mode);
			restoreHero?.();
		}
	}

	async _warmupScreenOverlays(pendingCompiles = []) {
		const scheduler = this.preparationScheduler;
		const camera = this.sceneManager.camera;
		const jobs = [];
		for (const scene of this.sceneManager.scenes.values()) {
			if (scene.canvasInterface) jobs.push(options => warmScreenOverlay(scene.canvasInterface, this.renderer, camera, scheduler, [this.sceneManager.layerTargets.a, null], null, options));
			for (const overlay of [scene.panelHud, scene.world?.hud, scene._cameraHotspots]) {
				if (overlay) jobs.push(options => warmScreenOverlay(overlay, this.renderer, camera, scheduler,
					overlay === scene.panelHud ? [this.sceneManager.layerTargets.a, null] : [null], null, options));
			}
			for (const overlay of scene.heroTitle?.getWarmupOverlays?.() ?? []) {
				jobs.push(options => warmScreenOverlay(overlay, this.renderer, camera, scheduler, [this.sceneManager.layerTargets.a, null], scene.getScene(), options));
			}
		}
		jobs.push(options => warmScreenOverlay(this.siteArc, this.renderer, camera, scheduler, [null], null, options));
		// Compile all independent screen/RT variants together. Waiting after each
		// overlay serializes the driver's work; every real draw still gets a frame.
		for (const job of jobs) await job({ phase: "compile", pendingCompiles });
		await waitForCompiledPrograms(pendingCompiles, scheduler);
		for (let i = 0; i < jobs.length; i++) {
			await jobs[i]({ phase: "draw" });
			this._setPreparationProgress(0.52 + 0.13 * (i + 1) / jobs.length);
		}
	}

	/**
	 * Preloader honesty gate: real RT draw of every scene + leave hex pairs.
	 * Strictly sequential — one heavy GPU step per breath so the loader UI stays live.
	 */
	async _warmupAllScenesAndHexPairs(backgroundTexture) {
		this.preparationStage = "scene-gpu-warmup";
		const sceneIds = this.sceneManager.getWarmupDrawSceneIds();
		/** @type {Set<string>} */
		const drawnIds = new Set();
		const scheduler = this.preparationScheduler;
		const breath = () => scheduler.breath();
		const repeatIds = ["home", "portfolioHub", "contacts"].filter(id => sceneIds.includes(id));
		let sceneDraws = 0;
		const reportSceneDraw = () => this._setPreparationProgress(0.66 + 0.08 * (++sceneDraws / (sceneIds.length + repeatIds.length)));

		// Pass 1: one scene per chunk (update → breath → GPU draw).
		for (const sceneId of sceneIds) {
			if (this.disposed) {
				return;
			}
			await breath();
			const texture = await this.sceneManager.warmupSceneDrawChunked(sceneId, "a", breath, { scheduler });
			if (texture) {
				drawnIds.add(sceneId);
			}
			reportSceneDraw();
		}
		const missingSceneIds = sceneIds.filter((sceneId) => !drawnIds.has(sceneId));
		if (missingSceneIds.length > 0) {
			throw new Error(`[three] allWarm missed real scene draws: ${missingSceneIds.join(", ")}`);
		}

		// Pass 2: home + hub again — first InstancedMesh/ocean frame often still allocates.
		for (const sceneId of repeatIds) {
			if (this.disposed || !drawnIds.has(sceneId)) {
				continue;
			}
			await breath();
			await this.sceneManager.warmupSceneDrawChunked(sceneId, "b", breath, { scheduler });
			reportSceneDraw();
		}

		const hexPairs = this._resolveWarmupHexPairs(sceneIds);
		const prevProgress = this.hexGridOverlay.material?.uniforms?.progress?.value ?? 0;

		// Slot A is immutable while a source's targets are visited in slot B.
		// Reuse its composite, not a new full-size RT for every scene or pair.
		const sourceCache = { id: null, texture: null };
		let lastHexTexture = null;
		let completedPairs = 0;
		try {
			for (const [sourceId, targetId] of hexPairs) {
				if (this.disposed) break;
				if (!drawnIds.has(sourceId) || !drawnIds.has(targetId)) {
					throw new Error(`[three] allWarm hex pair references an unwarmed scene: ${sourceId} -> ${targetId}`);
				}
				const warmed = await this._warmHexPair(backgroundTexture, { sourceId, targetId, breath, sourceCache });
				if (!warmed) throw new Error(`[three] allWarm missed hex pair: ${sourceId} -> ${targetId}`);
				lastHexTexture = warmed;
				this._setPreparationProgress(0.74 + 0.23 * (++completedPairs / hexPairs.length));
			}
		} finally {
			if (!this.disposed) this.hexGridOverlay.setProgress(prevProgress);
		}
		return lastHexTexture;
	}

	async _warmHexPair(backgroundTexture, {
		sourceId,
		targetId,
		breath,
		sourceCache,
	}) {
		if (this.disposed) return false;
		const scheduler = this.preparationScheduler;
		this.preparationStage = "hex-gpu-warmup";
		this.preparationPair = [sourceId, targetId];
		// About's prepared content also passes through the compositor during hex.
		// Read the warm texture directly: runtime route/visibility gates stay dormant.
		const overlayForScene = (id) => id === "about"
			? this.sceneManager.getSceneById(id)?.panelHud?.fromTexture ?? null : null;
		if (sourceCache.id !== sourceId) {
			await breath();
			const sourceTex = await this.sceneManager.warmupSceneDrawChunked(sourceId, "a", breath, { scheduler });
			if (!sourceTex || this.disposed) return false;
			sourceCache.texture = await scheduler.run(() => this.screenCompositor.compositeToLayerTarget(
				this.renderer, "a", sourceId === "home" ? null : backgroundTexture, sourceTex, NO_GRAIN_BLUR,
				overlayForScene(sourceId),
			), { gpu: true });
			sourceCache.id = sourceId;
		}

		await breath();
		const targetTex = await this.sceneManager.warmupSceneDrawChunked(
			targetId,
			"b",
			breath,
			{ scheduler },
		);
		if (!targetTex || this.disposed) return false;

		const bgB = targetId === "home" ? null : backgroundTexture;
		const fullA = sourceCache.texture;
		const fullB = await scheduler.run(() => this.screenCompositor.compositeToLayerTarget(
			this.renderer, "b", bgB, targetTex, NO_GRAIN_BLUR, overlayForScene(targetId)), { gpu: true });
		const hexTexture = await scheduler.run(() => {
			this.hexGridOverlay.setTextures(fullA, fullB);
			this.hexGridOverlay.setProgress(0.55);
			return this.hexGridOverlay.renderModelsMixToTexture(this.renderer) ?? fullA;
		}, { gpu: true });
		return hexTexture;
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
		this._inputKind = event.pointerType ?? this._inputKind;
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
		// A canvas-started orbit owns this pointer until release, including above
		// the menu. Captured events stay on the canvas instead of cancelling it.
		if (event.target === this.canvas && this.sceneManager.sceneDragOrbit.sceneId) {
			this.canvas.setPointerCapture(event.pointerId);
		}
	}

	_onPointerUp(event) {
		if (event?.type === "pointerup" && event.button !== 0) {
			return;
		}
		if (event?.pointerId !== undefined && this.canvas.hasPointerCapture(event.pointerId)) {
			this.canvas.releasePointerCapture(event.pointerId);
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
						// ResizeObserver/onResize already records the width used by the RTs.
						// Reading layout here flushes preceding HUD style writes every frame.
						viewportWidth: this._renderSize.w || window.innerWidth,
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
		const carousel = getSceneCarousel();
		// Click/hex lock starts before progress moves — leave direct path so the
		// scroll-hint (models compose) and hex pipeline stay continuous.
		if (carousel.isHexNavigationActive?.() || carousel.isCaseBoundaryDrive?.()) {
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
		const involvesPlateScene = [mix.sourceId, mix.targetId].some((id) => id === "portfolioHub" || id === "contacts");
		const involvesCapabilities = isCapabilitySceneId(mix.sourceId)
			|| isCapabilitySceneId(mix.targetId);
		// Capability scenes can contain dark, non-emissive surfaces. They
		// must stay visible on both sides of the hex wipe instead of passing through
		// the luminance-key path, which treated those surfaces as an empty black plate.
		const bakeBackgroundUnderModels = involvesHome
			|| involvesAbout
			|| involvesPlateScene
			|| involvesCapabilities;

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
			const sourceHudTexture = this._getHexBakeOverlayTexture(mix.sourceId);
			const targetHudTexture = this._getHexBakeOverlayTexture(mix.targetId);
			const contentA = this.screenCompositor.compositeToLayerTarget(this.renderer, "a", bgA, mix.sourceModels, grainBlur, sourceHudTexture, { visibleBand: mix.visibleBands?.source });

			let contentB = contentA;
			if (!skipTargetLayer) {
				contentB = this.screenCompositor.compositeToLayerTarget(this.renderer, "b", bgB, mix.targetModels, grainBlur, targetHudTexture, { visibleBand: mix.visibleBands?.target });
			}

			// Same UV warp on source (A) and target (B) — do not disable for case leave.
			this.hexGridOverlay.setSourceTextureEffectStrength(1);
			this.hexGridOverlay.setTextures(contentA, contentB);
			const hexTarget = this.hexGridOverlay.modelsMixTarget;
			const directBloom = this._directHexBloomEnabled && isMobileGraphicsDevice()
				&& !noPost && reveal > 0.0001 && this.modelsPostProcess.canApplyBloomFromPreparedTarget(hexTarget, reveal);
			const renderedHex = this.hexGridOverlay.renderModelsMixToTexture(this.renderer);
			const hexTexture = renderedHex ?? contentA;
			const frameTexture = noPost || reveal <= 0.0001 ? hexTexture
				: directBloom && renderedHex === hexTarget.texture
					? this.modelsPostProcess.applyBloomFromPreparedTarget(hexTarget, delta, reveal)
					: this.modelsPostProcess.applyBloom(hexTexture, delta, reveal);
			this.screenCompositor.drawToScreen(this.renderer, null, frameTexture, NO_GRAIN_BLUR);
			return;
		}

		// Other pages: opaque black plate → hex → keyed liquid (screen-stable).
		// Case left HUD bakes into the hex RT (same as About) — not screen hex-cut.
		const contentA = this.screenCompositor.compositeToLayerTarget(this.renderer, "a", null, mix.sourceModels, grainBlur, this._getHexBakeOverlayTexture(mix.sourceId), { visibleBand: mix.visibleBands?.source });

		let contentB = contentA;
		if (!skipTargetLayer) {
			contentB = this.screenCompositor.compositeToLayerTarget(this.renderer, "b", null, mix.targetModels, grainBlur, this._getHexBakeOverlayTexture(mix.targetId), { visibleBand: mix.visibleBands?.target });
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
		if (sceneId?.startsWith("case") || isCapabilitySceneId(sceneId)) {
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
		if (isCapabilitySceneId(sceneId)) {
			return null;
		}
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
		const sceneInterface = this.sceneManager.getSceneById("about")?.canvasInterface;
		// The open reader is already in the scene RT and covers the normal page copy.
		if (sceneInterface?.enabled && sceneInterface.reading) return null;
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
		return aboutHud;
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
		// Source case only (open / leaving). Target stays enterProgress=0 until after hex —
		// including case→case scroll boundary (same bake path as About / click-hex leave).
		if (hud !== this.sceneManager.getActiveCasePanelHud()) {
			return null;
		}
		const enter = getCasePanelHudEnterProgress();
		const idleOrShown = enter == null || enter >= 0.999;
		if (!idleOrShown) {
			return null;
		}
		// Prefer mesh helper: mix≈1 must bake mapTo (stage 5), not mapFrom (stage 4).
		if (typeof hud.getHexBakeTexture === "function") {
			return hud.getHexBakeTexture();
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
			this._handleWebGLContextLost(`render: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	_renderFrameInner(delta) {
		const progress = this.sceneTransitionProgress;
		const lite = this.gfx.litePipeline === true;
		const noPost = this.noPostProcess === true;
		const onCarousel = this.sceneManager.isCarouselHubActive();
		const bgOptions = noPost ? { skipLiquid: true } : undefined;

		const hexProgressLive = this._getHexShaderProgress() > 0.0001;
		const caseOpen = Boolean(this.store.openedCase);
		const carousel = getSceneCarousel();
		// Click lock (`_clickPhase`) arms before progress leaves 0 — treat that as hex-live
		// so home scroll-hint moves into models RT instead of vanishing for one frame.
		const hexNavLive = Boolean(carousel.isHexNavigationActive?.() || carousel.isCaseBoundaryDrive?.());
		const hexActive = hexProgressLive || hexNavLive;
		// Like the Home hint: sharp at rest, baked into the scene during a hex wipe.
		const currentSceneId = onCarousel ? carousel.currentId : this.sceneManager.getActiveSceneId();
		for (const [id, scene] of this.sceneManager.scenes) {
			scene.canvasInterface?.setComposeMode(!caseOpen && currentSceneId === id && !hexActive ? "screen" : "models");
		}
		for (const id of CAPABILITY_HUD_SCENES) {
			this.sceneManager.getSceneById(id)?.world?.hud
				?.setComposeMode(!caseOpen && currentSceneId === id && !hexActive ? "screen" : "models");
		}
		const craneSceneId = "capabilities:mmk1";
		this.sceneManager.getSceneById(craneSceneId)?._cameraHotspots
			?.setComposeMode(!caseOpen && currentSceneId === craneSceneId && !hexActive ? "screen" : "models");
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
		// Home title/tagline/stack are page-owned overlays (SITE_TRANSITION.md).
		// Do NOT gate on carousel.currentId alone — after home→case hex, currentId
		// stays "home" and the text leaked onto the case page.
		// Do NOT trust currentPage==="/" alone either — ring scroll commit flips
		// currentId to portfolioHub one frame before React displayPathname, and the
		// text then screen-overlays on the portfolio page.
		{
			const homeHero = this.sceneManager.getSceneById("home")?.heroTitle;
			const onHomePage = !caseOpen && this.currentPage === "/";
			const mixIds = carousel.getMixSourceTargetIds?.();
			const homeInMixPair = mixIds?.sourceId === "home" || mixIds?.targetId === "home";
			const homeInHexPair = hexActive && homeInMixPair;
			const ringOnHome = carousel.currentId === "home";
			const homeChromeLive = onHomePage && (ringOnHome || homeInHexPair);
			if (homeHero && homeChromeLive) {
				homeHero.setTextComposeMode?.(hexActive ? "models" : "screen");
			} else if (homeHero) {
				homeHero.stashTextOverlay?.();
			}
		}

		const grainBlur = this._buildGrainBlur(delta, progress, lite, noPost);
		this.hexGridOverlay.setSourceTextureEffectStrength(1);
		const layerTarget = this.sceneManager.layerTargets.a;
		const visibleBands = this._hexBandsEnabled && onCarousel && this.store.appStarted
			&& isMobileGraphicsDevice() && layerTarget
			? getHexVisibleBands(this.hexGridOverlay.material.uniforms, layerTarget,
				grainBlur.enabled ? grainBlur.radius : 0) : null;
		const mix = this.sceneManager.renderModelsFrame({
			skipIdleTargetLayer: false,
			visibleBands,
		});
		// A missing boundary neighbor aliases both hex inputs to one composite.
		// That single texture must cover both sampling bands.
		mix.visibleBands = mix.sourceId === mix.targetId ? null : visibleBands;

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

		if (onCarousel) {
			if (this._shouldUseIdleHomeDirectPipeline(mix)) {
				this._renderIdleHomeDirectFrame(mix);
				this._renderCasePanelHudScreenOverlays();
				this._renderHomeTextOverlay();
				return;
			}
			this._renderCarouselHexFrame(delta, mix, reveal, grainBlur, bgOptions, noPost);
			this._renderCasePanelHudScreenOverlays();
			this._renderHomeTextOverlay();
			return;
		}

		// Тот же full-frame путь, что у последнего hex-кадра: без скачка compositing/brightness.
		const fullFrame = this.screenCompositor.compositeToLayerTarget(this.renderer, "a", this.backgroundPipeline.lastTexture, mix.sourceModels, grainBlur);
		const frameTexture = noPost || reveal <= 0.0001 ? fullFrame : this.modelsPostProcess.applyBloom(fullFrame, delta, reveal);
		this.screenCompositor.drawToScreen(this.renderer, null, frameTexture, NO_GRAIN_BLUR);
		this._renderCasePanelHudScreenOverlays();
		this._renderHomeTextOverlay();
	}

	_renderCasePanelHudScreenOverlays() {
		const carousel = getSceneCarousel();
		const caseOpen = Boolean(this.store.openedCase);
		const hexProgress = this._getHexShaderProgress();
		for (const id of CAPABILITY_HUD_SCENES) {
			this.sceneManager.getSceneById(id)?.world?.hud?.renderScreenOverlay(this.renderer, this.sceneManager.camera);
		}
		this.sceneManager.getSceneById("capabilities:mmk1")?._cameraHotspots
			?.renderScreenOverlay(this.renderer, this.sceneManager.camera);

		if (caseOpen) {
			// Idle: sharp screen overlay after bloom.
			// Hex leave (case→site click OR case→case scroll boundary): left text
			// bakes into the hex RT — do not screen-draw (would sit on top of the
			// wipe) and do not per-cell screen hex-cut (ghost black cells in the
			// transparent band). Arc / project-nav stay live DOM either way.
			//
			// Screen-draw ONLY the open case HUD. Mix-preview target shares the
			// bridge canvases — allowing it here double-blends the same glyphs for
			// the arming frame (hexProgress≈0) → one-frame brightness flash.
			const activeHud = this.sceneManager.getActiveCasePanelHud();
			const caseScrollMix = carousel.isCaseBoundaryDrive();
			/** Hex owns the band whenever models are in a live wipe (click or scroll). */
			const hexOwnsLeftHud = hexProgress > 0.0001 && (
				caseScrollMix || carousel.isHexNavigationActive()
			);
			this.sceneManager.forEachCasePanelHud((hud) => {
				const allow = hud === activeHud;
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
					hud.syncFromBridge?.();
					return;
				}
				hud.setComposeMode("screen");
				hud.setVisible(true);
				hud.syncFromBridge?.();
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

		// Dialogs and scene controls cover the prepared page typography.
		for (const scene of this.sceneManager.scenes.values()) scene.canvasInterface?.renderScreenOverlay(this.renderer);

		// Right arc: site chrome — keep during case→case even if openedCase flickers.
		this.renderer.getSize(this._overlaySize);
		const isMobile = this._overlaySize.x < 768;
		syncSiteArcOverlay(this.siteArc, {
			showCase: true,
			viewportW: this._overlaySize.x,
			viewportH: this._overlaySize.y,
			isMobile,
		});
		if (this.siteArc?.visible) {
			this.siteArc.renderScreenOverlay(this.renderer);
		}
	}

	_renderHomeTextOverlay() {
		// Visual page ownership — not carousel.currentId alone (stale after home→case).
		if (this.store.openedCase || this.currentPage !== "/") {
			return;
		}
		const carousel = getSceneCarousel();
		// Ring commit (home→portfolio) updates currentId before React currentPage —
		// skip the lag frame so hero text does not screen-blit on portfolio.
		if (carousel.currentId !== "home" && this._getHexShaderProgress() <= 0.0001 && !carousel.isHexNavigationActive?.() && !carousel.isCaseBoundaryDrive?.()) {
			return;
		}
		// When composeMode is "models", renderScreenOverlay no-ops. Do not also
		// early-return on isHexNavigationActive alone — that flag flips at progress≈0
		// one frame before models bake, and blanked the hero text.
		const home = this.sceneManager.getSceneById("home");
		home?.heroTitle?.renderTextOverlay?.(this.renderer);
	}

	/** Состояние рендера карусели → store (debug-панель). */
	_syncCarouselRenderState() {
		if (!this.sceneManager.isCarouselHubActive()) {
			if (import.meta.env.DEV) {
				this.store.sceneCarouselRenderMode = "off";
				if (this.store.sceneCarouselRenderingIds.length) this.store.sceneCarouselRenderingIds = [];
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
			const previousIds = this.store.sceneCarouselRenderingIds;
			if (previousIds.length !== renderingIds.length || renderingIds.some((id, i) => id !== previousIds[i])) {
				this.store.sceneCarouselRenderingIds = renderingIds;
			}
			this.store.sceneCarouselPreviousId = carousel.previousId;
			this.store.sceneCarouselNextId = carousel.nextId;
			// Keep diagnostic proxy identities stable. Replacing the nested snapshot
			// each frame wakes store subscribers and creates garbage even at rest.
			const snapshot = this.store.sceneCarouselSceneProgress;
			for (const id of CAROUSEL_SCENE_IDS) {
				const sceneProgress = carousel.getSceneProgress(id);
				const sceneProgressTarget = carousel.getSceneProgressTarget(id);
				const role = carousel.getSceneProgressRole(id);
				const entry = snapshot[id];
				if (!entry) snapshot[id] = { sceneProgress, sceneProgressTarget, role };
				else {
					if (entry.sceneProgress !== sceneProgress) entry.sceneProgress = sceneProgress;
					if (entry.sceneProgressTarget !== sceneProgressTarget) entry.sceneProgressTarget = sceneProgressTarget;
					if (entry.role !== role) entry.role = role;
				}
			}
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
		setScenePixelRatio(this.renderer, dpr);
		this.onResize();
	}

	_resolveRenderFpsCap() {
		const tierCap = this.gfx.renderFpsCap ?? 0;
		if (!isPortfolioCasePath(this.currentPage) || this.sceneManager.getActiveSceneId() === "portfolioHub") {
			return tierCap;
		}
		const caseIsStatic = (this.routeTransition?.phase ?? "idle") === "idle" && this.sceneManager.requiresContinuousRender() === false;
		const caseCap = caseIsStatic ? (this.gfx.staticCaseRenderFpsCap ?? 8) : (this.gfx.caseRenderFpsCap ?? 24);
		return tierCap > 0 ? Math.min(tierCap, caseCap) : caseCap;
	}

	/** В консоль: с каким DPR реально рендерим (без спама каждый кадр). */
	_logRendererPixelRatio() {
		const dpr = getScenePixelRatio(this.renderer);
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
			`[DigitalMonsterThree] tier=${this.gfxTier}${lite ? " · litePipeline" : ""}${noPost}${renderCap ? ` · renderCap=${renderCap}fps` : ""} · scene DPR=${dpr} · output DPR=${this.renderer.getPixelRatio()} · буфер ${buffer.x}×${buffer.y} · CSS ${Math.round(cssW)}×${Math.round(cssH)}`,
		);
		console.info(
			`[DigitalMonsterThree] tier detect: score=${diag.score} · ${diag.cores}c · RAM ${memLabel}${diag.mobile ? " · mobile" : " · desktop"}${diag.forced ? ` · forced=${diag.forced}` : ""}`,
		);
		if (diag.calibration) {
			const probeMs = Number.isFinite(diag.calibration.perPassMs) ? ` · probe=${diag.calibration.perPassMs.toFixed(2)}ms/pass` : "";
			console.info(`[DigitalMonsterThree] GPU: ${diag.calibration.renderer}${probeMs}${diag.calibration.cached ? " · session cache" : ""}`);
		}
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
			// Keep home text out of the screen overlay after leaving "/".
			// Keep it while home is still in the hex mix (wipe owns the leave).
			if (next.currentPage !== "/") {
				const carousel = getSceneCarousel();
				const mixIds = carousel.getMixSourceTargetIds?.();
				const homeInHexPair =
					(mixIds?.sourceId === "home" || mixIds?.targetId === "home") &&
					(carousel.isHexNavigationActive?.() || carousel.isCaseBoundaryDrive?.() || this._getHexShaderProgress() > 0.0001);
				if (!homeInHexPair) {
					this.sceneManager.getSceneById("home")?.heroTitle?.stashTextOverlay?.();
				}
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

	_scheduleResize() {
		if (this.disposed || this._webglLost) return;
		if (this._resizeTimer !== null) clearTimeout(this._resizeTimer);
		this._resizeTimer = null;
		const heightOnly = this.store?.appStarted && isMobileGraphicsDevice()
			&& Math.round(window.innerWidth) === this._renderSize.w
			&& Math.round(window.innerHeight) !== this._renderSize.h;
		const queue = () => {
			this._resizeTimer = null;
			if (this.disposed || this._webglLost || this._resizeFrame !== null) return;
			this._resizeFrame = requestSharedAnimationFrame(() => {
				this._resizeFrame = null;
				if (!this.disposed && !this._webglLost) this.onResize();
			});
		};
		if (heightOnly) {
			// Safari animates its browser bars across many heights during a swipe.
			// Keep the prepared frame intact; resize GPU buffers and text once at
			// the settled height. Width/orientation and initial preparation stay immediate.
			if (this._resizeFrame !== null) cancelSharedAnimationFrame(this._resizeFrame);
			this._resizeFrame = null;
			this._resizeTimer = setTimeout(queue, 200);
		} else queue();
	}

	onResize() {
		if (this._webglLost || !this.renderer?.getContext()) {
			return;
		}

		const viewport = syncVisibleViewport();
		if (!viewport) return;
		const { width: w, height: h } = viewport;
		if (w <= 0 || h <= 0) {
			return;
		}
		if (this.highDprCalibration?.accepted) {
			// Only the normal resize path changes prepared buffer dimensions.
			// The earned supersampling exception applies from 980 CSS pixels upward.
			this.defaultPixelRatio = w >= 980 ? 2 : resolveRendererPixelRatio(this.gfxTier, window.devicePixelRatio);
			this.store.graphicsDpr = this.defaultPixelRatio;
			setScenePixelRatio(this.renderer, this.defaultPixelRatio);
		}
		const dpr = getScenePixelRatio(this.renderer);
		// Phones need a sharper final canvas for prepared text. Expensive scene,
		// bloom and hex buffers retain their independent scene DPR.
		const nativeTextPreview = import.meta.env.DEV && new URLSearchParams(window.location.search).get("nativeText") === "1";
		const sharpMobileOutput = w <= 1024 && window.devicePixelRatio > 1;
		const outputDpr = nativeTextPreview || sharpMobileOutput ? resolveOutputPixelRatio(this.gfxTier, dpr, window.devicePixelRatio, w, h) : dpr;
		if (this._renderSize.w === w && this._renderSize.h === h && this._renderSize.dpr === dpr && this._renderSize.outputDpr === outputDpr) {
			return;
		}
		this._renderSize = { w, h, dpr, outputDpr };

		this.renderer.setDrawingBufferSize(w, h, outputDpr);
		this.camera.aspect = w / h;
		this.camera.updateProjectionMatrix();
		this.backgroundPipeline.setSize(w, h);
		this.sceneManager.setSize(w, h);
		this.modelsPostProcess.setSize(w, h);
		this.hexGridOverlay.setSize(w, h);
		this.screenCompositor.setSize(w, h, this.renderer);
		publishSceneViewportResize(w, h);
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
		const isPointer = Boolean(
			this.store.cursor.caseHovered ||
			this.store.cursor.projectListHovered ||
			this.store.cursor.caseNavHovered
		);
		const cursor = this.store.cursor.screenGalleryHovered
			? (this.store.cursor.screenGalleryDragging ? "grabbing" : "grab")
			: (isPointer ? "pointer" : "default");
		if (cursor === this._nativeCursor) {
			return;
		}

		this._nativeCursor = cursor;
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

	getFailureSnapshot() {
		return {
			stage: this.preparationStage,
			seconds: Math.round((performance.now() - (this.preparationStartedAt ?? performance.now())) / 100) / 10,
			prepared: this.ready, preparation: this.store.preparationProgress,
			tier: this.gfxTier, sceneDpr: this.store.graphicsDpr,
			viewport: [window.innerWidth, window.innerHeight], buffer: [this.canvas.width, this.canvas.height],
			programs: this.renderer.info.programs?.length, ...this.renderer.info.memory,
			warmPair: this.preparationPair ?? null,
		};
	}

	start() {
		const tick = () => {
			if (this.disposed) {
				return;
			}
			this.rafId = requestSharedAnimationFrame(tick);

			const delta = this.clock.getDelta();
			this.deviceTilt.update(delta);
			// Preparation owns renderer/camera exclusively until the Start gesture.
			// Still tick the clock so the first live frame never receives load time.
			if (this.fullWarm && !this.startApp) {
				this._notifyRenderedOnce();
				return;
			}
			const onPortfolioCase = isPortfolioCasePath(this.currentPage) && this.sceneManager.getActiveSceneId() !== "portfolioHub";
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
			this.portfolioCameraDevTools?.update?.();
			this.mmk1CameraDevTools?.update?.();
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
		if (this.disposed) return;
		this.deviceTilt?.dispose();
		this.disposed = true;
		this.container.style.cursor = "";
		this.canvas.style.cursor = "";
		this.store.cursor.caseHovered = false;
		this.store.cursor.projectListHovered = false;
		this.store.cursor.screenGalleryHovered = false;
		this.store.cursor.screenGalleryDragging = false;
		this.store.cursor.caseNavHovered = false;
		disposeSiteArcOverlay(this.siteArc);
		this.siteArc = null;
		if (this.rafId !== null) {
			cancelSharedAnimationFrame(this.rafId);
		}
		window.removeEventListener("resize", this._scheduleResize);
		window.visualViewport?.removeEventListener("resize", this._scheduleResize);
		if (this._resizeFrame !== null) cancelSharedAnimationFrame(this._resizeFrame);
		this._resizeFrame = null;
		if (this._resizeTimer !== null) clearTimeout(this._resizeTimer);
		this._resizeTimer = null;
		this._resizeObserver?.disconnect();
		this._resizeObserver = null;
		window.removeEventListener("pointermove", this._onViewportPointerMove, true);
		window.removeEventListener("pointerdown", this._onPointerDown);
		window.removeEventListener("pointerup", this._onPointerUp);
		this.canvas.removeEventListener("pointermove", this._onPointerMove);
		this.canvas.removeEventListener("pointerup", this._onPointerUp);
		this.canvas.removeEventListener("pointercancel", this._onPointerUp);
		this.canvas.removeEventListener("lostpointercapture", this._onPointerUp);
		this.canvas.removeEventListener("webglcontextlost", this._onContextLost, false);
		this.canvas.removeEventListener("webglcontextrestored", this._onContextRestored, false);
		this.liquidDevTools?.dispose?.();
		this.liquidDevTools = null;
		this.progressDevTools?.dispose?.();
		this.progressDevTools = null;
		this.aboutEpicTextDevTools?.dispose?.();
		this.aboutEpicTextDevTools = null;
		this.belkaOrbitsDevTools?.dispose?.();
		this.belkaOrbitsDevTools = null;
		this.siteArcDevTools?.dispose?.();
		this.siteArcDevTools = null;
		this.caseStageRailDevTools?.dispose?.();
		this.caseStageRailDevTools = null;
		this.portfolioCameraDevTools?.dispose?.();
		this.portfolioCameraDevTools = null;
		this.mmk1CameraDevTools?.dispose?.();
		this.mmk1CameraDevTools = null;
		this.oceanDevTools?.dispose?.();
		this.mediumHomeDevTools?.dispose?.();
		this.mediumHomeDevTools = null;
		this.lowHomeDevTools?.dispose?.();
		this.lowHomeDevTools = null;
		this.oceanDevTools = null;
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
		if (!this.renderer.getContext().isContextLost()) this.renderer.forceContextLoss();
		this.canvas.width = this.canvas.height = 1;
		this.canvas.remove();
	}
}
