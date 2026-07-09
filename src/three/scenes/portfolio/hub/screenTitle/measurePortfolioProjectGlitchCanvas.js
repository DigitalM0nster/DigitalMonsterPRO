import {
	getPortfolioProjectListUppercase,
	getPortfolioProjectName,
} from "@/i18n/portfolioProjectsCopy.js";
import { createGlitchTextSlots } from "@/shared/glitchText/glitchLetterModel.js";
import {
	measureCanvasGlitchTextSize,
} from "@/shared/glitchText/drawCanvasGlitchText.js";
import { SITE_LOCALES } from "@/utils/siteLocale.js";
import { SCREEN_TEXT_FONT_FAMILY } from "./hubScreenTextCanvas.js";

const MIN_CANVAS_WIDTH = 240;
const MIN_CANVAS_HEIGHT = 64;

/**
 * Максимальный размер canvas для проекта по всем языкам — фиксируем ширину, чтобы при смене locale не прыгало.
 * @param {string} projectId
 * @param {object} layerCfg
 */
export function measureWidestPortfolioProjectGlitchCanvas(projectId, layerCfg) {
	const measureCanvas = document.createElement("canvas");
	measureCanvas.width = 1;
	measureCanvas.height = 1;
	const ctx = measureCanvas.getContext("2d");

	if (!ctx) {
		return { width: MIN_CANVAS_WIDTH, height: MIN_CANVAS_HEIGHT };
	}

	const uppercase = layerCfg.uppercase ?? getPortfolioProjectListUppercase();
	const measureStyle = {
		fontSize: layerCfg.fontSize ?? 36,
		fontWeight: layerCfg.fontWeight ?? 600,
		letterSpacing: layerCfg.letterSpacing ?? 0,
		paddingLeft: layerCfg.paddingLeft ?? 24,
		paddingTop: layerCfg.paddingTop ?? 12,
		paddingRight: layerCfg.paddingRight ?? 24,
		paddingBottom: layerCfg.paddingBottom ?? 12,
		replacementGlowStrength: 0,
	};

	ctx.font = `${measureStyle.fontWeight} ${measureStyle.fontSize}px ${SCREEN_TEXT_FONT_FAMILY}`;

	let maxWidth = MIN_CANVAS_WIDTH;
	let maxHeight = MIN_CANVAS_HEIGHT;

	for (const locale of SITE_LOCALES) {
		const text = getPortfolioProjectName(projectId, locale);
		const slots = createGlitchTextSlots(text, uppercase);
		const measured = measureCanvasGlitchTextSize(ctx, slots, measureStyle);
		maxWidth = Math.max(maxWidth, measured.width);
		maxHeight = Math.max(maxHeight, measured.height);
	}

	return {
		width: Math.ceil(maxWidth),
		height: Math.ceil(maxHeight),
	};
}
