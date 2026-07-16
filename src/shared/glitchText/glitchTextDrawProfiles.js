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
import { SITE_MAIN_COLOR } from "@/constants/siteMainColor.js";

/** @typedef {'hud' | 'hero' | 'caseStudyNav'} GlitchTextDrawProfile */

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
	/**
	 * Case study arc / prev-next: same size & baseline as main Manifold letters.
	 * Hero metrics (scaleX 0.68 + offset) look tiny/low at ~9px arc labels.
	 */
	caseStudyNav: {
		mainFontFamily: SCREEN_TEXT_FONT_FAMILY,
		replacementFontFamily: SCREEN_TEXT_FONT_FAMILY,
		replacementFontWeight: 500,
		replacementOffsetYEm: 0,
		replacementScaleX: 1,
		replacementScaleY: 1,
		/** Keep upright — hero/hub flip is for large flipped meshes. */
		replacementFlipAxes: false,
		replacementColor: SITE_MAIN_COLOR,
		replacementShadowColor: SITE_MAIN_COLOR,
		replacementGlowStrength: 1,
	},
};

/** @param {GlitchTextDrawProfile} [profile] */
export function getGlitchDrawProfile(profile = "hud") {
	return GLITCH_DRAW_PROFILES[profile] ?? GLITCH_DRAW_PROFILES.hud;
}
