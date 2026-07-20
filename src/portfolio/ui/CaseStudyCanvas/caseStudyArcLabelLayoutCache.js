/**
 * Cache wrapped arc titles + measured widths — avoids Canvas2D measure work every focus-spin frame.
 */
import { CASE_STUDY_DISPLAY_FONT, measureTextWithSpacing } from "./caseStudyCanvasText.js";

/** @type {string} */
let cacheKey = "";
/** @type {string[][]} */
let cachedLines = [];
/** @type {number} */
let cachedMaxLineWidth = 1;

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<{ id: string, pathTitle?: string, title?: string }>} navStates
 * @param {number} labelLineMaxWidth
 * @param {number} titleSpacing
 * @param {number} titleFontSize
 * @param {(ctx: CanvasRenderingContext2D, title: string, maxWidth: number, letterSpacing: number) => string[]} wrapFn
 */
export function getCachedArcPathTitleLayout(
	ctx,
	navStates,
	labelLineMaxWidth,
	titleSpacing,
	titleFontSize,
	wrapFn,
) {
	const key = `${titleFontSize}|${labelLineMaxWidth}|${titleSpacing}|${navStates
		.map((state) => `${state.id}:${state.pathTitle ?? state.title ?? ""}`)
		.join("\u0001")}`;

	if (key === cacheKey && cachedLines.length === navStates.length) {
		return {
			pathTitleLines: cachedLines,
			maxRenderedLineWidth: cachedMaxLineWidth,
		};
	}

	ctx.font = `500 ${titleFontSize}px ${CASE_STUDY_DISPLAY_FONT}`;
	const pathTitleLines = navStates.map((state) => (
		wrapFn(ctx, state.pathTitle ?? state.title, labelLineMaxWidth, titleSpacing)
	));
	const maxRenderedLineWidth = Math.max(
		1,
		...pathTitleLines.flat().map((line) => measureTextWithSpacing(ctx, line, titleSpacing)),
	);

	cacheKey = key;
	cachedLines = pathTitleLines;
	cachedMaxLineWidth = maxRenderedLineWidth;

	return { pathTitleLines, maxRenderedLineWidth };
}

export function clearArcPathTitleLayoutCache() {
	cacheKey = "";
	cachedLines = [];
	cachedMaxLineWidth = 1;
}
