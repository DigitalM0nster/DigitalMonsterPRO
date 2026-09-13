import { getHeroResponsiveLayout } from "./heroResponsiveLayout.js";

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
	if (viewportWidth <= 1024) return 0; // A bottom dock is not a left inset.
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
	const responsive = getHeroResponsiveLayout(viewportWidth, window.innerHeight);
	// Read the same safe-area-aware edge as the mounted header, only on layout.
	const headerLeft = responsive.compact
		? document.querySelector('header[data-canvas-pointer-blocker="true"]')?.getBoundingClientRect().left : null;
	const compactLeft = Number.isFinite(headerLeft) ? headerLeft : viewportWidth > 768 ? 28 : 16;

	return {
		offsetX: responsive.compact ? compactLeft / viewportWidth : offsetX,
		titleOffsetY: responsive.top !== null ? responsive.top / viewportWidth : config?.offsetY ?? 0,
		subtitleGapVw: responsive.gap !== null ? responsive.gap / viewportWidth : config?.subtitleGapVw ?? 0,
		stackGapVw: responsive.gap !== null ? responsive.gap / viewportWidth : config?.stackGapVw ?? 0,
	};
}
