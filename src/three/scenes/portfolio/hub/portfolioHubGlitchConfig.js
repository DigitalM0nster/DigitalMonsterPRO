/**
 * Змейка списка проектов: белый main-текст + голубые glitch-буквы.
 * Свечение — только у змейки (HDR-bloom). Белый main без bloom.
 * Live-tune: dev-панель 5 → «Змейка списка проектов».
 */

export const portfolioHubGlitchConfig = {
	/** Цвет букв змейки (canvas + uniform uSnakeColor). */
	snakeLetterColor: "rgb(24, 134, 251)",
	/** HDR-множитель bloom: uSnakeColor * boost (site bloom threshold ≈ 1). */
	snakeBloomBoost: 8,
	/** Масштаб букв змейки относительно main (< 1 — тоньше). */
	snakeLetterScale: 0.88,
	/** Вес шрифта змейки (main списка — 600). */
	snakeLetterFontWeight: 600,
};

/** Необязательные runtime-overrides без перезагрузки. */
export const portfolioHubGlitchDevOverrides = import.meta.env.DEV ? {} : null;

/** Цвет glitch-букв на canvas. */
export function getSnakeLetterColorCss(cfg = getPortfolioHubGlitchConfig()) {
	return cfg.snakeLetterColor;
}

/** @deprecated — алиас getSnakeLetterColorCss */
export function getReplacementCanvasColorCss(cfg = getPortfolioHubGlitchConfig()) {
	return getSnakeLetterColorCss(cfg);
}

export function getPortfolioHubGlitchConfig() {
	const dev = portfolioHubGlitchDevOverrides ?? {};

	return {
		snakeLetterColor:
			dev.snakeLetterColor ??
			dev.replacementColor ??
			portfolioHubGlitchConfig.snakeLetterColor,
		snakeBloomBoost:
			dev.snakeBloomBoost ??
			dev.replacementBloomBoost ??
			portfolioHubGlitchConfig.snakeBloomBoost,
		snakeLetterScale:
			dev.snakeLetterScale ?? portfolioHubGlitchConfig.snakeLetterScale,
		snakeLetterFontWeight:
			dev.snakeLetterFontWeight ?? portfolioHubGlitchConfig.snakeLetterFontWeight,
	};
}
