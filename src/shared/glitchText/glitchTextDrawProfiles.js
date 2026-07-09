import { SCREEN_TEXT_FONT_FAMILY } from "@/three/scenes/portfolio/hub/screenTitle/hubScreenTextCanvas.js";
import {
	getPortfolioHubGlitchConfig,
	getSnakeLetterColorCss,
} from "@/three/scenes/portfolio/hub/portfolioHubGlitchConfig.js";
import {
	heroTextGlitchConfig,
	resolveHeroReplacementDisplayChar,
	resolveHeroReplacementMetrics,
} from "@/three/scenes/home/heroText/heroTextGlitchConfig.js";

/** @typedef {'hud' | 'hero'} GlitchTextDrawProfile */

export const GLITCH_DRAW_PROFILES = {
	hud: {
		mainFontFamily: SCREEN_TEXT_FONT_FAMILY,
		replacementFontFamily: SCREEN_TEXT_FONT_FAMILY,
		get replacementFontWeight() {
			return getPortfolioHubGlitchConfig().snakeLetterFontWeight ?? 600;
		},
		replacementOffsetYEm: 0.12,
		get replacementScaleX() {
			return getPortfolioHubGlitchConfig().snakeLetterScale ?? 0.88;
		},
		get replacementScaleY() {
			return getPortfolioHubGlitchConfig().snakeLetterScale ?? 0.88;
		},
		get replacementColor() {
			return getSnakeLetterColorCss();
		},
		/** Без canvas text-shadow — свечение только bloom в шейдере. */
		replacementGlowStrength: 0,
		get replacementBloomBoost() {
			return getPortfolioHubGlitchConfig().snakeBloomBoost;
		},
	},
	hero: {
		get replacementFontFamily() {
			return heroTextGlitchConfig.replacementFontFamily;
		},
		get replacementFontWeight() {
			return heroTextGlitchConfig.replacementFontWeight;
		},
		get replacementColor() {
			return heroTextGlitchConfig.replacementBloomColor;
		},
		get replacementShadowColor() {
			return heroTextGlitchConfig.replacementBloomColor;
		},
		resolveReplacementMetrics: resolveHeroReplacementMetrics,
		resolveReplacementDisplayChar: resolveHeroReplacementDisplayChar,
		get replacementGlowStrength() {
			return heroTextGlitchConfig.replacementGlowStrength;
		},
	},
};

/** @param {GlitchTextDrawProfile} [profile] */
export function getGlitchDrawProfile(profile = "hud") {
	return GLITCH_DRAW_PROFILES[profile] ?? GLITCH_DRAW_PROFILES.hud;
}
