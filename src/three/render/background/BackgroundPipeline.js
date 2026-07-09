import * as THREE from "three";
import { EffectComposer, EffectPass, RenderPass } from "postprocessing";
import { RGBELoader } from "three-stdlib";
import { easing } from "maath";
import BackgroundLiquidDistortionEffect from "../../../components/3D/effects/backgroundLiquid/BackgroundLiquidDistortion.jsx";
import { ROUTE_TRANSITION_ENTER_MS } from "../../../config/routeTransition.js";
import { isPortfolioHubPath, isPortfolioCasePath } from "../../scenes/portfolio/hub/projectsData.js";
import { getHubBackgroundTargetScale, portfolioHubPlatesConfig } from "../../scenes/portfolio/hub/portfolioHubConfig.js";
import { case1PostProcessConfig } from "../../scenes/portfolio/case1/case1PostProcessConfig.js";
import { configureBackgroundRenderPass, renderComposerToTexture } from "../composerUtils.js";
import { getBackgroundBrightnessTarget, getCarouselBackgroundTargets } from "../../../utils/backgroundBrightness.js";
import { isCarouselRoutePage } from "../transition/SceneCarousel.js";

const BG_ENTER_SMOOTH_SEC = ROUTE_TRANSITION_ENTER_MS / 1000;
/** Временно: заморозить анимацию liquid-фона (noise по iTime). */
const PAUSE_BACKGROUND_ANIMATION = false;
const backgroundScene = new THREE.Scene();

function brightnessForPage(page) {
	return getBackgroundBrightnessTarget(page);
}

function resolveBrightnessTarget(currentPage, teleportPage, routePhase) {
	const displayedTarget = brightnessForPage(currentPage);
	if (routePhase !== "exiting" || !teleportPage) {
		return displayedTarget;
	}

	const teleportTarget = brightnessForPage(teleportPage);
	return teleportTarget < displayedTarget ? teleportTarget : displayedTarget;
}

/**
 * Liquid HDR-фон — fullscreen, без border blur / «экранчика».
 */
export class BackgroundPipeline {
	constructor(renderer, camera, store) {
		this.renderer = renderer;
		this.camera = camera;
		this.store = store;

		this.composer = new EffectComposer(renderer, { multisampling: 0, stencilBuffer: false });
		this.composer.addPass(new RenderPass(backgroundScene, camera));
		configureBackgroundRenderPass(this.composer);

		this.liquidScale = { current: 1 };
		this.brightness = { current: store.backgroundBrightness ?? 1 };
		this._lastPublishedBrightness = store.backgroundBrightness ?? 1;
		this.iTime = { current: 0 };
		this.scaleIn = true;
		this.currentPage = "/";
		this.teleportPage = "/";
		this.routePhase = "idle";

		this.liquidEffect = null;
		this.liquidPass = null;
		this.hdrTexture = null;
		this.lastTexture = null;
		this.size = { w: 0, h: 0 };
		this._loadHdr();
	}

	_loadHdr() {
		new RGBELoader().load("/backgrounds/digitalMonster.hdr", (texture) => {
			texture.mapping = THREE.EquirectangularReflectionMapping;
			this.hdrTexture = texture;
			this._buildPasses();
		});
	}

	_buildPasses() {
		if (!this.hdrTexture || this.liquidEffect) {
			return;
		}

		this.liquidEffect = new BackgroundLiquidDistortionEffect({
			backgroundTexture: this.hdrTexture,
			liquidScale: this.liquidScale,
			brightness: this.brightness,
			distortionColor: new THREE.Color("#1b476f"),
			iTime: this.iTime,
		});

		this.liquidPass = new EffectPass(this.camera, this.liquidEffect);
		this.composer.addPass(this.liquidPass);
		this.composer.autoRenderToScreen = false;
	}

	setRouteState({ currentPage, teleportPage, routePhase }) {
		if (currentPage !== undefined) {
			if (currentPage !== this.currentPage) {
				this.currentPage = currentPage;
				this.scaleIn = !this.scaleIn;
			}
		}
		if (teleportPage !== undefined) {
			this.teleportPage = teleportPage;
		}
		this.routePhase = routePhase;
	}

	setSize(width, height) {
		if (this.size.w === width && this.size.h === height) {
			return;
		}
		this.size = { w: width, h: height };
		this.composer.setSize(width, height);
	}

	/**
	 * Carousel (/ /portfolio /about /contacts): фон берётся через renderCarouselBackground
	 * в hex-mix, не из update(). Damp яркости/scale оставляем, composer не гоняем каждый кадр.
	 */
	_shouldSkipComposerRenderInUpdate() {
		return isCarouselRoutePage(this.currentPage);
	}

	update(delta, options = {}) {
		if (!this.liquidEffect) {
			return null;
		}

		const onCarousel = isCarouselRoutePage(this.currentPage);
		const targetBrightness = resolveBrightnessTarget(this.currentPage, this.teleportPage, this.routePhase);
		const hubBg = portfolioHubPlatesConfig.backgroundFocus;
		const onPortfolioHub = isPortfolioHubPath(this.currentPage) && hubBg?.enabled !== false;
		const onPortfolioCase = isPortfolioCasePath(this.currentPage);

		let targetScale = 1;
		let smoothSec = this.routePhase === "entering" ? BG_ENTER_SMOOTH_SEC : 0.5;
		let brightnessTarget = targetBrightness;

		if (onCarousel) {
			const carouselBg = getCarouselBackgroundTargets();
			brightnessTarget = carouselBg.brightness;
			targetScale = carouselBg.scale;
			smoothSec = Math.max(case1PostProcessConfig.background.smoothDuration ?? 0.5, 0.001);
			if (carouselBg.distortionColor && this.liquidEffect.distortionColor) {
				this.liquidEffect.distortionColor.set(carouselBg.distortionColor);
			}
		} else if (onPortfolioHub) {
			const focusAmount = this.store.portfolioHubBackgroundFocus ?? 0;
			targetScale = getHubBackgroundTargetScale(focusAmount);
			smoothSec = Math.max(hubBg?.smoothDuration ?? 0.75, 0.001);
		} else if (onPortfolioCase) {
			const bg = case1PostProcessConfig.background;
			brightnessTarget = bg.brightness ?? 0.28;
			targetScale = bg.liquidScale ?? 1;
			smoothSec = Math.max(bg.smoothDuration ?? 0.75, 0.001);
			if (bg.distortionColor && this.liquidEffect.distortionColor) {
				this.liquidEffect.distortionColor.set(bg.distortionColor);
			}
		}

		easing.damp(this.brightness, "current", brightnessTarget, smoothSec, delta);
		easing.damp(this.liquidScale, "current", targetScale, smoothSec, delta);
		if (!PAUSE_BACKGROUND_ANIMATION) {
			this.iTime.current += delta * 0.1;
		}

		const brightness = this.brightness.current;
		if (Math.abs(brightness - this._lastPublishedBrightness) > 0.012) {
			this.store.backgroundBrightness = brightness;
			this._lastPublishedBrightness = brightness;
		}

		if (this._shouldSkipComposerRenderInUpdate()) {
			this.lastTexture = null;
			return null;
		}

		if (this.composer.passes.length < 2) {
			return null;
		}

		this.lastTexture = this._renderComposerToTexture(delta, options?.skipLiquid === true);
		return this.lastTexture;
	}

	/** @param {boolean} skipLiquid — perf-test: только HDR RenderPass, без liquid pass. */
	_renderComposerToTexture(delta, skipLiquid = false) {
		if (this.liquidPass) {
			this.liquidPass.enabled = !skipLiquid;
		}

		const texture = renderComposerToTexture(this.composer, delta, this.renderer);

		if (this.liquidPass) {
			this.liquidPass.enabled = true;
		}

		return texture;
	}

	/** Единый HDR-фон карусели — один для mix/single, без per-page снимков. */
	renderCarouselBackground(delta, options = {}) {
		if (!this.liquidEffect || this.composer.passes.length < 2) {
			return null;
		}

		return this._renderComposerToTexture(delta, options?.skipLiquid === true);
	}

	/** Мгновенно применить значения из dev-панели (без ожидания damp). */
	applyBackgroundFromDev() {
		if (!this.liquidEffect) {
			return;
		}

		const bg = case1PostProcessConfig.background;
		if (bg.brightness !== undefined) {
			this.brightness.current = bg.brightness;
		}
		if (bg.liquidScale !== undefined) {
			this.liquidScale.current = bg.liquidScale;
		}
		if (bg.distortionColor && this.liquidEffect.distortionColor) {
			this.liquidEffect.distortionColor.set(bg.distortionColor);
		}
	}

	dispose() {
		this.composer.dispose();
		this.hdrTexture?.dispose();
	}
}
