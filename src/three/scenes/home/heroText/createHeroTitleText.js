import { heroTextFragmentShader } from "../../../shaders/heroText/heroTextFragment.glsl.js";
import { heroTextFragmentSimpleShader } from "../../../shaders/heroText/heroTextFragmentSimple.glsl.js";
import { HeroTextMesh } from "./HeroTextMesh.js";
import { resolveHeroTextPosition } from "./heroTextLayout.js";
import {
	notifyHeroTextLayoutUpdated,
	registerHeroTextLayoutProvider,
	unregisterHeroTextLayoutProvider,
} from "./heroTextLayoutSync.js";
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
import { HeroScrollHintMesh } from "./HeroScrollHintMesh.js";

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
		fontSize: HERO_TITLE_FONT.fontSize,
		lineHeight: HERO_TITLE_FONT.lineHeight,
		fontWeight: HERO_TITLE_FONT.fontWeight,
		fontColor: HERO_TITLE_FONT.fontColor,
		letterSpacing: heroTextTypographyConfig.titleLetterSpacing,
		useInstancedLetters: true,
		shaderProfile: "title",
		revealSeed: heroTextRevealConfig.titleRevealSeed,
	});

	const initialLocale = getHeroLocale();

	const subtitle = new HeroTextMesh({
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

	const stack = new HeroTextMesh({
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
	const scrollHint = new HeroScrollHintMesh(renderer, scene);

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
		notifyHeroTextLayoutUpdated();
		scrollHint.applyPosition();
	};

	const layoutProvider = (config = heroTextPositionConfig, viewportWidth = window.innerWidth, viewportHeight = window.innerHeight) => {
		const position = resolveHeroTextPosition(config, viewportWidth);
		const gapVh = config?.scrollHintGapVh ?? position.scrollHintGapVh ?? 0;
		const aspectRatio = viewportWidth / viewportHeight;

		return {
			leftPx: title.offsetX * viewportWidth,
			topPx: stack.getBlockBottomOffsetY() * aspectRatio * viewportHeight + gapVh * viewportHeight,
		};
	};

	registerHeroTextLayoutProvider(layoutProvider);
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
					scrollHint.playRevealEnter(cfg.enterDurationMs);
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
			scrollHint.reset();
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
			scrollHint.update(delta);
		},
		resize() {
			const next = resolveHeroTextPosition(heroTextPositionConfig);
			title.resize(next.offsetX);
			subtitle.offsetY = resolveSubtitleOffsetY(title, next);
			subtitle.resize(next.offsetX);
			stack.offsetY = resolveStackOffsetY(title, subtitle, next);
			stack.resize(next.offsetX);
			notifyHeroTextLayoutUpdated();
			scrollHint.resize();
		},
		dispose() {
			clearShowTimeouts();
			stopHeroTextRevealSound();
			localeSwitch.dispose();
			unregisterHeroTextLayoutProvider(layoutProvider);
			title.dispose();
			subtitle.dispose();
			stack.dispose();
			scrollHint.dispose();
		},
		/** After final screen blit — sharp scroll-hint label overlay. */
		renderScrollHintOverlay(renderer) {
			scrollHint.renderScreenOverlay(renderer);
		},
		/** Idle: screen overlay. Hex: embed label in models RT. */
		setScrollHintComposeMode(mode) {
			scrollHint.setComposeMode(mode);
		},
		/** Hide «листайте вниз» when carousel has left home (titles may linger for hex). */
		hideScrollHint() {
			scrollHint.reset();
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
	};
}
