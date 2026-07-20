import * as THREE from "three";
import { easing } from "maath";
import { ROUTE_TRANSITION_ENTER_MS } from "../../../config/routeTransition.js";
import { isPortfolioHubPath, isPortfolioCasePath } from "../../scenes/portfolio/hub/projectsData.js";
import { getHubBackgroundTargetScale, portfolioHubPlatesConfig } from "../../scenes/portfolio/hub/portfolioHubConfig.js";
import { case1PostProcessConfig } from "../../scenes/portfolio/case1/case1PostProcessConfig.js";
import { getBackgroundBrightnessTarget, getCarouselBackgroundTargets } from "../../../utils/backgroundBrightness.js";
import { isCarouselRoutePage } from "../transition/SceneCarousel.js";
import {
	LIQUID_FRAME_STRIDE,
	LIQUID_RT_SCALE,
	createBackgroundLiquidDraw,
	createBackgroundLiquidMaterial,
	createBackgroundLiquidTarget,
	syncBackgroundLiquidTuneUniforms,
} from "./backgroundLiquidPass.js";
import { backgroundLiquidTune } from "./backgroundLiquidTune.js";

const BG_ENTER_SMOOTH_SEC = ROUTE_TRANSITION_ENTER_MS / 1000;
/** Временно: заморозить анимацию liquid-фона. */
const PAUSE_BACKGROUND_ANIMATION = false;

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
 * Balatro-style liquid background — fullscreen shader RT, no HDR / EffectComposer.
 */
export class BackgroundPipeline {
	constructor(renderer, camera, store) {
		this.renderer = renderer;
		this.camera = camera;
		this.store = store;

		this.liquidScale = { current: 1 };
		this.brightness = { current: store.backgroundBrightness ?? 1 };
		this._lastPublishedBrightness = store.backgroundBrightness ?? 1;
		this.iTime = { current: 0 };
		this.scaleIn = true;
		this.currentPage = "/";
		this.teleportPage = "/";
		this.routePhase = "idle";

		this.liquidMaterial = null;
		/** Facade: legacy callers use liquidEffect.distortionColor.set(...) */
		this.liquidEffect = null;
		this.draw = null;
		this.target = null;
		this.lastTexture = null;
		/** Stride: reuse last liquid RT every other frame when settled. */
		this._liquidComposerStride = 0;
		this.size = { w: 0, h: 0 };
		this._disposed = false;
		this.ready = false;
		this.readyPromise = this._init();
	}

	async _init() {
		try {
			if (this._disposed) {
				return false;
			}
			this._buildPass();
			return true;
		} finally {
			this.ready = true;
		}
	}

	_buildPass() {
		if (this.liquidMaterial) {
			return;
		}

		this.liquidMaterial = createBackgroundLiquidMaterial();
		this.draw = createBackgroundLiquidDraw(this.liquidMaterial);
		this.liquidEffect = {
			distortionColor: this.liquidMaterial.uniforms.distortionColor.value,
		};

		if (this.size.w > 0 && this.size.h > 0) {
			const dpr = this.renderer.getPixelRatio();
			this._ensureTarget(Math.floor(this.size.w * dpr), Math.floor(this.size.h * dpr));
		}
	}

	_ensureTarget(width, height) {
		const tw = Math.max(1, Math.round(width * LIQUID_RT_SCALE));
		const th = Math.max(1, Math.round(height * LIQUID_RT_SCALE));
		if (this.target && this.target.width === tw && this.target.height === th) {
			return;
		}

		this.target?.dispose();
		this.target = createBackgroundLiquidTarget(tw, th);
		this.liquidMaterial?.uniforms.iResolution.value.set(tw, th);
		this._liquidComposerStride = 0;
		this.lastTexture = null;
	}

	setRouteState({ currentPage, teleportPage, routePhase }) {
		if (currentPage !== undefined) {
			if (currentPage !== this.currentPage) {
				this.currentPage = currentPage;
				this.scaleIn = !this.scaleIn;
				this._liquidComposerStride = 0;
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
		if (this.liquidMaterial) {
			const dpr = this.renderer.getPixelRatio();
			this._ensureTarget(Math.floor(width * dpr), Math.floor(height * dpr));
		}
	}

	_shouldSkipDrawInUpdate() {
		return isCarouselRoutePage(this.currentPage);
	}

	/** Always stride liquid (incl. scroll) — procedural pass is too heavy at 60fps. */
	_shouldReuseLiquidTexture() {
		if (!this.lastTexture) {
			return false;
		}
		this._liquidComposerStride = (this._liquidComposerStride + 1) % LIQUID_FRAME_STRIDE;
		return this._liquidComposerStride !== 0;
	}

	_syncUniforms(skipLiquid) {
		const u = this.liquidMaterial.uniforms;
		u.liquidScale.value = this.liquidScale.current;
		u.brightness.value = this.brightness.current;
		u.iTime.value = this.iTime.current;
		u.skipLiquid.value = skipLiquid ? 1 : 0;
		syncBackgroundLiquidTuneUniforms(this.liquidMaterial);
	}

	/** Force next liquid redraw (DEV sliders / resize). */
	invalidateLiquid() {
		this._liquidComposerStride = 0;
		this.lastTexture = null;
	}

	_renderLiquidToTexture(skipLiquid = false) {
		if (!this.liquidMaterial || !this.draw || !this.target) {
			return null;
		}

		this._syncUniforms(skipLiquid);

		const gl = this.renderer;
		const prevTarget = gl.getRenderTarget();
		const prevAutoClear = gl.autoClear;

		gl.setRenderTarget(this.target);
		gl.autoClear = true;
		gl.setClearColor(0x000000, 1);
		gl.clear(true, true, true);
		gl.render(this.draw.scene, this.draw.camera);

		gl.setRenderTarget(prevTarget);
		gl.autoClear = prevAutoClear;

		return this.target.texture;
	}

	update(delta, options = {}) {
		if (!this.liquidMaterial) {
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
			if (carouselBg.distortionColor && this.liquidEffect?.distortionColor) {
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
			if (bg.distortionColor && this.liquidEffect?.distortionColor) {
				this.liquidEffect.distortionColor.set(bg.distortionColor);
			}
		}

		easing.damp(this.brightness, "current", brightnessTarget, smoothSec, delta);
		easing.damp(this.liquidScale, "current", targetScale, smoothSec, delta);

		if (!PAUSE_BACKGROUND_ANIMATION) {
			this.iTime.current += delta * (backgroundLiquidTune.timeSpeed ?? 0.1);
		}

		const brightness = this.brightness.current;
		if (Math.abs(brightness - this._lastPublishedBrightness) > 0.012) {
			this.store.backgroundBrightness = brightness;
			this._lastPublishedBrightness = brightness;
		}

		if (this._shouldSkipDrawInUpdate()) {
			return this.lastTexture;
		}
		if (options?.skipRender === true) {
			return this.lastTexture;
		}

		if (this._shouldReuseLiquidTexture()) {
			return this.lastTexture;
		}

		this.lastTexture = this._renderLiquidToTexture(options?.skipLiquid === true);
		return this.lastTexture;
	}

	/** Единый liquid-фон карусели — always-on stride. */
	renderCarouselBackground(_delta, options = {}) {
		if (!this.liquidMaterial || !this.target) {
			return this.lastTexture;
		}

		if (this._shouldReuseLiquidTexture()) {
			return this.lastTexture;
		}

		const texture = this._renderLiquidToTexture(options?.skipLiquid === true);
		this.lastTexture = texture;
		return texture;
	}

	applyBackgroundFromDev() {
		if (!this.liquidMaterial) {
			return;
		}

		const bg = case1PostProcessConfig.background;
		if (bg.brightness !== undefined) {
			this.brightness.current = bg.brightness;
		}
		if (bg.liquidScale !== undefined) {
			this.liquidScale.current = bg.liquidScale;
		}
		if (bg.distortionColor && this.liquidEffect?.distortionColor) {
			this.liquidEffect.distortionColor.set(bg.distortionColor);
		}
		syncBackgroundLiquidTuneUniforms(this.liquidMaterial);
		this.invalidateLiquid();
	}

	/** DEV panel: push tune → site brightness config + uniforms + redraw. */
	applyLiquidTuneFromDev() {
		if (!this.liquidMaterial) {
			return;
		}
		const t = backgroundLiquidTune;
		case1PostProcessConfig.background.brightness = t.brightness;
		case1PostProcessConfig.background.liquidScale = t.liquidScale;
		case1PostProcessConfig.background.distortionColor = t.distortionColor;
		this.brightness.current = t.brightness;
		this.liquidScale.current = t.liquidScale;
		this.liquidEffect?.distortionColor?.set?.(t.distortionColor);
		syncBackgroundLiquidTuneUniforms(this.liquidMaterial);
		this.invalidateLiquid();
	}

	dispose() {
		this._disposed = true;
		this.target?.dispose();
		this.target = null;
		this.draw?.geometry?.dispose();
		this.liquidMaterial?.dispose();
		this.liquidMaterial = null;
		this.draw = null;
		this.liquidEffect = null;
		this.lastTexture = null;
	}
}
