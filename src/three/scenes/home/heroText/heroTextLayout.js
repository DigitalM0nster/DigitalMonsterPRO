import { heroTextPositionConfig } from "./heroTextPositionConfig.js";
import { resolveHeroScrollHintPositionWithProvider } from "./heroTextLayoutSync.js";
import {
	HERO_STACK_FONT,
	HERO_SUBTITLE_FONT,
	HERO_TEXT_LAYOUT,
	HERO_TITLE_FONT,
	HERO_TITLE_LINES,
	getHeroTaglineLines,
	getHeroStackLines,
} from "./heroTitleConfig.js";

const HERO_TEXT_BASE_WIDTH = 1920;
const LEFT_MENU_FALLBACK_PX = 121;
export const LEFT_MENU_SELECTOR = 'nav[aria-label="Основная навигация"]';

function parseCssLengthToPx(raw, viewportWidth) {
	if (!raw) {
		return null;
	}

	const value = parseFloat(raw);
	if (!Number.isFinite(value)) {
		return null;
	}

	if (raw.endsWith("vw")) {
		return (value / 100) * viewportWidth;
	}
	if (raw.endsWith("vh")) {
		return (value / 100) * window.innerHeight;
	}
	if (raw.endsWith("px")) {
		return value;
	}

	return value;
}

/** Ширина левого меню в px (DOM → CSS-переменная → fallback). */
export function getLeftMenuWidthPx(viewportWidth = window.innerWidth) {
	const menuEl = document.querySelector(LEFT_MENU_SELECTOR);
	if (menuEl) {
		const measured = menuEl.getBoundingClientRect().width;
		if (measured > 0) {
			return measured;
		}
	}

	const raw = getComputedStyle(document.documentElement).getPropertyValue("--leftMenuWidth").trim();
	return parseCssLengthToPx(raw, viewportWidth) ?? LEFT_MENU_FALLBACK_PX;
}

/**
 * Горизонтальный offset для hero-текста: ширина меню (px) + доп. отступ (vw).
 * Не даёт уйти левее правого края меню.
 * @returns {number} доля viewport width (0…1), как uPositionOffset.x
 */
export function resolveHeroTextOffsetX(offsetXAfterMenuVw, viewportWidth = window.innerWidth) {
	const leftMenuPx = getLeftMenuWidthPx(viewportWidth);
	const afterMenuVw = Math.max(0, Number(offsetXAfterMenuVw) || 0);
	const paddingPx = (afterMenuVw / 100) * viewportWidth;
	const minOffsetX = leftMenuPx / viewportWidth;
	const targetOffsetX = (leftMenuPx + paddingPx) / viewportWidth;

	return Math.max(minOffsetX, targetOffsetX);
}

/**
 * @param {{ offsetXAfterMenuVw?: number, offsetY?: number, subtitleGapVw?: number }} [config]
 * @param {number} [viewportWidth]
 */
export function resolveHeroTextPosition(config, viewportWidth = window.innerWidth) {
	const offsetX = resolveHeroTextOffsetX(config?.offsetXAfterMenuVw ?? 0, viewportWidth);

	return {
		offsetX,
		titleOffsetY: config?.offsetY ?? 0,
		subtitleGapVw: config?.subtitleGapVw ?? 0,
		stackGapVw: config?.stackGapVw ?? 0,
		scrollHintGapVh: config?.scrollHintGapVh ?? 0,
	};
}

function getLineHeightUnit(lineHeight, canvasWidth, viewportWidth) {
	return (lineHeight * (HERO_TEXT_BASE_WIDTH / viewportWidth)) / canvasWidth;
}

function getBlockHeightUnit(lineCount, lineHeight, canvasWidth, viewportWidth, withDecorativeLine = false) {
	const lineUnit = getLineHeightUnit(lineHeight, canvasWidth, viewportWidth);
	const decorativeInset = withDecorativeLine ? lineUnit * 0.72 : 0;
	return decorativeInset + lineCount * lineUnit;
}

/** uPositionOffset.y → px от верха viewport (как в heroTextVertex). */
export function heroTextOffsetYToTopPx(
	offsetY,
	viewportWidth = window.innerWidth,
	viewportHeight = window.innerHeight,
) {
	const aspectRatio = viewportWidth / viewportHeight;
	return offsetY * aspectRatio * viewportHeight;
}

/** Нижняя граница tech-stack в тех же единицах, что uPositionOffset.y у HeroTextMesh. */
export function estimateHeroTextStackBottomOffset(
	config = heroTextPositionConfig,
	viewportWidth = window.innerWidth,
) {
	const isDesktop = viewportWidth > 768;
	const subtitleMultiplier = isDesktop ? 2 : 1;
	const stackMultiplier = isDesktop ? 1.85 : 1;
	const position = resolveHeroTextPosition(config, viewportWidth);

	const titleBottom =
		position.titleOffsetY +
		getBlockHeightUnit(HERO_TITLE_LINES.length, HERO_TITLE_FONT.lineHeight, HERO_TEXT_LAYOUT.canvasWidth, viewportWidth);

	const subtitleCanvas = isDesktop ? HERO_TEXT_LAYOUT.canvasWidth * subtitleMultiplier : HERO_TEXT_LAYOUT.canvasWidth;
	const subtitleBottom =
		titleBottom +
		position.subtitleGapVw +
		getBlockHeightUnit(
			getHeroTaglineLines().length,
			HERO_SUBTITLE_FONT.lineHeight * subtitleMultiplier,
			subtitleCanvas,
			viewportWidth,
		);

	const stackCanvas = isDesktop ? HERO_TEXT_LAYOUT.canvasWidth * stackMultiplier : HERO_TEXT_LAYOUT.canvasWidth;
	return (
		subtitleBottom +
		position.stackGapVw +
		getBlockHeightUnit(
			getHeroStackLines().length,
			HERO_STACK_FONT.lineHeight * stackMultiplier,
			stackCanvas,
			viewportWidth,
			true,
		)
	);
}

/** Оценка координат scroll-подсказки по конфигу (до появления live hero-текста). */
export function estimateHeroScrollHintPosition(
	config = heroTextPositionConfig,
	viewportWidth = window.innerWidth,
	viewportHeight = window.innerHeight,
) {
	const position = resolveHeroTextPosition(config, viewportWidth);
	const stackBottomOffset = estimateHeroTextStackBottomOffset(config, viewportWidth);
	const gapVh = config?.scrollHintGapVh ?? position.scrollHintGapVh ?? 0;

	return {
		leftPx: position.offsetX * viewportWidth,
		topPx: heroTextOffsetYToTopPx(stackBottomOffset, viewportWidth, viewportHeight) + gapVh * viewportHeight,
	};
}

/** Экранные координаты scroll-подсказки — live hero-текст или оценка по конфигу. */
export function resolveHeroScrollHintPosition(
	config = heroTextPositionConfig,
	viewportWidth = window.innerWidth,
	viewportHeight = window.innerHeight,
) {
	return resolveHeroScrollHintPositionWithProvider(
		config,
		viewportWidth,
		viewportHeight,
		estimateHeroScrollHintPosition,
	);
}
