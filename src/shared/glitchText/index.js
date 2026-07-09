export { default as CanvasGlitchText } from "./canvasGlitchText.js";
export { GlitchSnakeEngine } from "./glitchSnakeEngine.js";
export { createGlitchTextSlots, getGlitchReplacements } from "./glitchLetterModel.js";
export {
	drawGlitchTextLine,
	drawCanvasGlitchText,
	drawHeroGlitchLine,
	measureGlitchTextSize,
	measureCanvasGlitchTextSize,
	resolveReplacementGlowMetrics,
	GLITCH_REPLACEMENT_SHADOW_BLUR,
	REPLACEMENT_GLOW_STRENGTH_MAX,
} from "./drawGlitchText.js";
export { getGlitchDrawProfile, GLITCH_DRAW_PROFILES } from "./glitchTextDrawProfiles.js";
