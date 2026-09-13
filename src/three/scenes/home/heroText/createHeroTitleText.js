import { heroTextFragmentShader } from "../../../shaders/heroText/heroTextFragment.glsl.js";
import { heroTextFragmentSimpleShader } from "../../../shaders/heroText/heroTextFragmentSimple.glsl.js";
import { HeroTextMesh } from "./HeroTextMesh.js";
import { getHeroResponsiveLayout } from "./heroResponsiveLayout.js";
import { resolveHeroTextPosition } from "./heroTextLayout.js";
import { heroTextPositionConfig } from "./heroTextPositionConfig.js";
import { heroTextRevealConfig } from "./heroTextRevealConfig.js";
import { heroTextTypographyConfig } from "./heroTextTypographyConfig.js";
import {
	playHeroTextRevealEnterSounds,
	stopHeroTextRevealSound,
} from "./heroTextRevealSound.js";
import {
	getHeroLocale,
	getHeroStackFontFamily,
	getHeroStackLines,
	getHeroSubtitleFontFamily,
	getHeroTaglineLines,
	HERO_STACK_FONT,
	HERO_TEXT_LAYOUT,
	HERO_TITLE_FONT,
	HERO_TITLE_LINES,
	HERO_SUBTITLE_FONT,
} from "./heroTitleConfig.js";
import { createHeroLocaleSwitchController } from "./heroLocaleSwitch.js";
import { HeroGpuTextMesh } from "./gpu/HeroGpuTextMesh.js";

function resolveSubtitleOffsetY(title, position) {
	return title.getBlockBottomOffsetY() + position.subtitleGapVw;
}

function resolveStackOffsetY(title, subtitle, position) {
	return subtitle.getBlockBottomOffsetY() + position.stackGapVw;
}

/**
 * Hero-надпись: заголовок + tagline + tech-stack.
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 */
export function createHeroTitleText(renderer, scene) {
	const layout = HERO_TEXT_LAYOUT;
	const isDesktop = window.innerWidth > 768;
	const subtitleMultiplier = isDesktop ? 2 : 1;
	const stackMultiplier = isDesktop ? 1.85 : 1;
	const position = resolveHeroTextPosition(heroTextPositionConfig);
	const offsetX = position.offsetX;

	const title = new HeroTextMesh({
		renderer,
		scene,
		canvasWidth: layout.canvasWidth,
		fragmentShader: heroTextFragmentShader,
		text: HERO_TITLE_LINES,
		offsetX,
		offsetY: position.titleOffsetY,
		fontFamily: HERO_TITLE_FONT.fontFamily,
		fontSize: HERO_TITLE_FONT.fontSize * getHeroResponsiveLayout(window.innerWidth, window.innerHeight).titleScale,
		lineHeight: HERO_TITLE_FONT.lineHeight * getHeroResponsiveLayout(window.innerWidth, window.innerHeight).titleScale,
		fontWeight: HERO_TITLE_FONT.fontWeight,
		fontColor: HERO_TITLE_FONT.fontColor,
		letterSpacing: heroTextTypographyConfig.titleLetterSpacing,
		useInstancedLetters: true,
		shaderProfile: "title",
		revealSeed: heroTextRevealConfig.titleRevealSeed,
	});

	const initialLocale = getHeroLocale();

	const subtitle = new HeroGpuTextMesh({
		renderer,
		scene,
		canvasWidth: isDesktop ? layout.canvasWidth * subtitleMultiplier : layout.canvasWidth,
		fragmentShader: heroTextFragmentSimpleShader,
		text: getHeroTaglineLines(initialLocale),
		offsetX,
		offsetY: resolveSubtitleOffsetY(title, position),
		fontFamily: getHeroSubtitleFontFamily(initialLocale),
		fontSize: HERO_SUBTITLE_FONT.fontSize * subtitleMultiplier,
		lineHeight: HERO_SUBTITLE_FONT.lineHeight * subtitleMultiplier,
		fontWeight: HERO_SUBTITLE_FONT.fontWeight,
		fontColor: HERO_SUBTITLE_FONT.fontColor,
		shaderProfile: "subtitle",
		revealSeed: heroTextRevealConfig.subtitleRevealSeed,
		useGlitchSnake: true,
	});

	const stack = new HeroGpuTextMesh({
		renderer,
		scene,
		canvasWidth: isDesktop ? layout.canvasWidth * stackMultiplier : layout.canvasWidth,
		fragmentShader: heroTextFragmentSimpleShader,
		text: getHeroStackLines(initialLocale),
		offsetX,
		offsetY: resolveStackOffsetY(title, subtitle, position),
		fontFamily: getHeroStackFontFamily(initialLocale),
		fontSize: HERO_STACK_FONT.fontSize * stackMultiplier,
		lineHeight: HERO_STACK_FONT.lineHeight * stackMultiplier,
		fontWeight: HERO_STACK_FONT.fontWeight,
		fontColor: HERO_STACK_FONT.fontColor,
		letterSpacing: HERO_STACK_FONT.letterSpacing,
		decorativeTopLine: true,
		decorativeLineWidthVw: 0.16,
		shaderProfile: "stack",
		revealSeed: heroTextRevealConfig.subtitleRevealSeed + 0.11,
		useGlitchSnake: true,
	});

	let showTimeoutId = 0;
	let subtitleTimeoutId = 0;
	let stackTimeoutId = 0;

	const clearShowTimeouts = () => {
		if (showTimeoutId) {
			window.clearTimeout(showTimeoutId);
			showTimeoutId = 0;
		}
		if (subtitleTimeoutId) {
			window.clearTimeout(subtitleTimeoutId);
			subtitleTimeoutId = 0;
		}
		if (stackTimeoutId) {
			window.clearTimeout(stackTimeoutId);
			stackTimeoutId = 0;
		}
	};

	const syncLayerPositions = (next = resolveHeroTextPosition(heroTextPositionConfig)) => {
		title.setPosition(next.offsetX, next.titleOffsetY);
		subtitle.setPosition(next.offsetX, resolveSubtitleOffsetY(title, next));
		stack.setPosition(next.offsetX, resolveStackOffsetY(title, subtitle, next));
	};

	syncLayerPositions(position);

	const localeSwitch = createHeroLocaleSwitchController({
		subtitle,
		stack,
		syncLayerPositions,
	});

	return {
		title,
		subtitle,
		stack,
		readyPromise: Promise.all([title.readyPromise, subtitle.readyPromise, stack.readyPromise]),
		applyShaderConfig() {
			title.applyShaderConfig();
			subtitle.applyShaderConfig();
			stack.applyShaderConfig();
		},
		applyRevealConfig() {
			title.reveal.syncFromConfig();
			subtitle.reveal.syncFromConfig();
			stack.reveal.syncFromConfig();
		},
		setRevealScrub({
			enabled = true,
			titleProgress,
			subtitleProgress,
			stackProgress,
			entering = true,
			glitchProgress = 0,
		} = {}) {
			title.reveal.setManualScrub(enabled);
			subtitle.reveal.setManualScrub(enabled);
			stack.reveal.setManualScrub(enabled);
			if (!enabled) {
				return;
			}
			if (titleProgress !== undefined) {
				title.reveal.setScrubProgress(titleProgress, { entering, glitchProgress });
			}
			if (subtitleProgress !== undefined) {
				subtitle.reveal.setScrubProgress(subtitleProgress, { entering, glitchProgress });
			}
			if (stackProgress !== undefined) {
				stack.reveal.setScrubProgress(stackProgress, { entering, glitchProgress });
			}
		},
		clearRevealScrub() {
			title.reveal.setManualScrub(false);
			subtitle.reveal.setManualScrub(false);
			stack.reveal.setManualScrub(false);
		},
		getRevealScrubState() {
			return {
				titleProgress: title.reveal.getScrubProgress(),
				subtitleProgress: subtitle.reveal.getScrubProgress(),
				stackProgress: stack.reveal.getScrubProgress(),
				titleScrubActive: title.reveal.isManualScrub(),
				subtitleScrubActive: subtitle.reveal.isManualScrub(),
				stackScrubActive: stack.reveal.isManualScrub(),
			};
		},
		show({ waitForLoaderCurtain = false } = {}) {
			clearShowTimeouts();
			title.reveal.setManualScrub(false);
			subtitle.reveal.setManualScrub(false);
			stack.reveal.setManualScrub(false);
			const cfg = heroTextRevealConfig;
			const loaderDelayMs = waitForLoaderCurtain ? cfg.waitForLoaderCurtainMs : 0;
			const stackDelayMs = cfg.subtitleAppearDelayMs + (cfg.stackAppearDelayMs ?? 320);

			showTimeoutId = window.setTimeout(() => {
				showTimeoutId = 0;
				playHeroTextRevealEnterSounds();
				title.playRevealEnter(cfg.enterDurationMs);
				subtitleTimeoutId = window.setTimeout(() => {
					subtitleTimeoutId = 0;
					subtitle.playRevealEnter(cfg.enterDurationMs);
				}, cfg.subtitleAppearDelayMs);
				stackTimeoutId = window.setTimeout(() => {
					stackTimeoutId = 0;
					stack.playRevealEnter(cfg.enterDurationMs);
				}, stackDelayMs);
			}, loaderDelayMs);
		},
		hide() {
			this.reset();
		},
		reset() {
			clearShowTimeouts();
			title.reveal.setManualScrub(false);
			subtitle.reveal.setManualScrub(false);
			stack.reveal.setManualScrub(false);
			stopHeroTextRevealSound();
			title.reveal.prepareHidden();
			subtitle.reveal.prepareHidden();
			stack.reveal.prepareHidden();
		},
		applyPosition() {
			syncLayerPositions();
		},
		applyTypography() {
			const spacing = heroTextTypographyConfig.titleLetterSpacing;
			title.letterSpacing = spacing;
			const next = resolveHeroTextPosition(heroTextPositionConfig);
			title.resize(next.offsetX);
			syncLayerPositions(next);
		},
		update(delta) {
			title.update(delta);
			subtitle.update(delta);
			stack.update(delta);
		},
		resize() {
			const next = resolveHeroTextPosition(heroTextPositionConfig);
			const { titleScale } = getHeroResponsiveLayout(window.innerWidth, window.innerHeight);
			title.fontSize = HERO_TITLE_FONT.fontSize * titleScale;
			title.lineHeight = HERO_TITLE_FONT.lineHeight * titleScale;
			title.resize(next.offsetX);
			subtitle.offsetY = resolveSubtitleOffsetY(title, next);
			subtitle.resize(next.offsetX);
			stack.offsetY = resolveStackOffsetY(title, subtitle, next);
			stack.resize(next.offsetX);
			syncLayerPositions(next);
		},
		dispose() {
			clearShowTimeouts();
			stopHeroTextRevealSound();
			localeSwitch.dispose();
			title.dispose();
			subtitle.dispose();
			stack.dispose();
		},
		/** Prepared Home text overlays; High/Medium keep tagline/stack sharp after bloom. */
		beginPerformanceProbeDraw() {
			const saved = [title, subtitle, stack].map(layer => ({
				layer, mode: layer.composeMode, manual: layer.reveal._manualScrub, anim: layer.reveal._anim,
				uniforms: layer.reveal.materials.flatMap(material => Object.entries(material.uniforms)
					.filter(([key]) => key.startsWith("uReveal"))
					.map(([, uniform]) => [uniform, uniform.value])),
			}));
			for (const { layer } of saved) {
				layer.reveal.setManualScrub(true);
				layer.reveal.setScrubProgress(1);
				layer.setComposeMode?.("screen");
			}
			return () => {
				for (const { layer, mode, manual, anim, uniforms } of saved) {
					for (const [uniform, value] of uniforms) uniform.value = value;
					layer.reveal._manualScrub = manual;
					layer.reveal._anim = anim;
					layer.setComposeMode?.(mode);
				}
			};
		},
		getWarmupOverlays() {
			return [...(title.crispTitle ? [title] : []), subtitle, stack];
		},
		renderTextOverlay(renderer) {
			title.renderScreenOverlay(renderer);
			subtitle.renderScreenOverlay?.(renderer);
			stack.renderScreenOverlay?.(renderer);
		},
		/** Idle: sharp text overlay. Hex: embed prepared hero text in models RT. */
		setTextComposeMode(mode) {
			title.setComposeMode(mode);
			subtitle.setComposeMode?.(mode);
			stack.setComposeMode?.(mode);
		},
		/** Stop screen overlays on leave; keep the hero text live for reverse hex. */
		stashTextOverlay() {
			title.setComposeMode("models");
			subtitle.setComposeMode?.("models");
			stack.setComposeMode?.("models");
			subtitle.finishLocaleSwitch?.();
			stack.finishLocaleSwitch?.();
		},
		/** Dev: змейка смены языка без клика по меню. */
		previewGlitchLocaleSwitch(locale) {
			return localeSwitch.previewSwitchTo(locale);
		},
		previewGlitchLocaleCycle() {
			return localeSwitch.previewCycleLocale();
		},
		getGlitchDisplayedLocale() {
			return localeSwitch.getDisplayedLocale();
		},
		/** Flush locale changes deferred while Home was dormant. */
		syncLocaleForActivation() {
			return localeSwitch.syncLocaleForActivation();
		},
	};
}
