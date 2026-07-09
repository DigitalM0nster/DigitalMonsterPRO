import { LEFT_MENU_SELECTOR } from "@/three/scenes/home/heroText/heroTextLayout.js";
import { caseStudyLeftPanelConfig } from "@/portfolio/ui/CaseStudyCanvas/caseStudyLeftPanelConfig.js";
import {
	getLeftMenuContentAnchor,
	readNavButtonCircleBoundsPx,
	resolveHomeIconCircleTopLocalY as resolveHomeIconCircleTopLocalYFromAnchor,
	resolveLastNavIconCircleBottomLocalY,
} from "./leftMenuContentAnchor.js";
export const LEFT_MENU_ICON_RAIL_ATTR = "data-menu-icon-rail";
export const LEFT_MENU_BOTTOM_SECTION_ATTR = "data-menu-bottom-section";
export const LEFT_MENU_ICON_CIRCLE_ATTR = "data-menu-icon-circle";
export const LEFT_MENU_HOME_BUTTON_ATTR = "data-menu-home-button";

function capContentBottomAboveMenu(bottomPx) {
	const bottomMenuTop = getLeftMenuBottomSectionTopPx();
	if (bottomPx == null || !Number.isFinite(bottomPx)) {
		return bottomPx;
	}

	if (bottomMenuTop == null || !Number.isFinite(bottomMenuTop)) {
		return bottomPx;
	}

	const inset = caseStudyLeftPanelConfig.contentBottomMenuInset ?? 12;
	return Math.min(bottomPx, bottomMenuTop - inset);
}

/**
 * Y (px от верха viewport) верхней навигационной иконки — home, не логотип.
 * null, если меню ещё не в DOM.
 */
export function getLeftMenuFirstNavIconTopPx() {
	if (typeof window === "undefined") {
		return null;
	}

	const menu = document.querySelector(LEFT_MENU_SELECTOR);
	if (!menu) {
		return null;
	}

	const homeButton = getLeftMenuHomeButton();
	if (!homeButton) {
		return null;
	}

	return homeButton.getBoundingClientRect().top;
}

/**
 * @returns {HTMLElement | null}
 */
export function getLeftMenuHomeButton() {
	const buttons = getLeftMenuIconRailButtons();
	if (!buttons.length) {
		return null;
	}

	return buttons.find((button) => button.hasAttribute(LEFT_MENU_HOME_BUTTON_ATTR)) ?? buttons[0];
}

/**
 * Y (px) верхнего края нижнего блока меню (sound + язык).
 */
export function getLeftMenuBottomSectionTopPx() {
	if (typeof window === "undefined") {
		return null;
	}

	const menu = document.querySelector(LEFT_MENU_SELECTOR);
	if (!menu) {
		return null;
	}

	const bottomSection = menu.querySelector(`[${LEFT_MENU_BOTTOM_SECTION_ATTR}]`);
	return bottomSection?.getBoundingClientRect().top ?? null;
}

/**
 * Визуальные границы круга иконки (не hit-box кнопки).
 *
 * @param {HTMLElement} button
 * @param {HTMLElement | null} [menuEl]
 * @returns {{ top: number, bottom: number } | null}
 */
export function getLeftMenuNavButtonVisualBoundsPx(button, menuEl = null) {
	const menu = menuEl ?? button?.closest?.("nav") ?? document.querySelector(LEFT_MENU_SELECTOR);
	const bounds = readNavButtonCircleBoundsPx(menu, button);
	if (!bounds) {
		return null;
	}

	return { top: bounds.top, bottom: bounds.bottom };
}

/**
 * Кнопки навигационной рельсы (home … lab).
 *
 * @returns {HTMLElement[]}
 */
export function getLeftMenuIconRailButtons() {
	if (typeof window === "undefined") {
		return [];
	}

	const menu = document.querySelector(LEFT_MENU_SELECTOR);
	if (!menu) {
		return [];
	}

	const rail = menu.querySelector(`[${LEFT_MENU_ICON_RAIL_ATTR}]`);
	return rail ? [...rail.querySelectorAll("button")] : [];
}

/**
 * Вертикальные границы рельсы — hit-box кнопок.
 *
 * @returns {{ top: number, bottom: number } | null}
 */
export function getLeftMenuIconRailBoundsPx() {
	const buttons = getLeftMenuIconRailButtons();
	if (!buttons.length) {
		return null;
	}

	const rects = buttons.map((button) => button.getBoundingClientRect());
	return {
		top: Math.min(...rects.map((rect) => rect.top)),
		bottom: Math.max(...rects.map((rect) => rect.bottom)),
	};
}

/**
 * Вертикальная «рамка» рельсы по визуальным кругам первой и последней иконки.
 *
 * @returns {{ top: number, bottom: number } | null}
 */
export function getLeftMenuIconRailVisualBoundsPx() {
	const menu = document.querySelector(LEFT_MENU_SELECTOR);
	const buttons = getLeftMenuIconRailButtons();
	if (!buttons.length) {
		return null;
	}

	const published = getLeftMenuContentAnchor();
	if (published.homeCircleTop != null && published.lastCircleBottom != null) {
		return {
			top: published.homeCircleTop,
			bottom: published.lastCircleBottom,
		};
	}

	const first = getLeftMenuNavButtonVisualBoundsPx(buttons[0], menu);
	const last = getLeftMenuNavButtonVisualBoundsPx(buttons[buttons.length - 1], menu);
	if (!first || !last) {
		return null;
	}

	return {
		top: first.top,
		bottom: last.bottom,
	};
}

/**
 * Y (px) верхнего визуального круга home в координатах surface (canvas/host).
 *
 * @param {HTMLElement | null | undefined} surfaceEl
 * @param {number} [topGap]
 */
export function resolveHomeIconCircleTopLocalY(surfaceEl, topGap = 0) {
	return resolveHomeIconCircleTopLocalYFromAnchor(surfaceEl, topGap);
}

/**
 * @param {number} [topGap]
 * @returns {number | null}
 */
export function resolveCaseStudyContentTopPx(topGap = 0) {
	const published = getLeftMenuContentAnchor();
	if (published.homeCircleTop != null) {
		return published.homeCircleTop + topGap;
	}

	const menu = document.querySelector(LEFT_MENU_SELECTOR);
	const homeButton = getLeftMenuHomeButton();
	const bounds = homeButton ? getLeftMenuNavButtonVisualBoundsPx(homeButton, menu) : null;
	if (bounds) {
		return bounds.top + topGap;
	}

	const measured = getLeftMenuFirstNavIconTopPx();
	if (measured != null && Number.isFinite(measured)) {
		const menuEl = menu ?? document.querySelector(LEFT_MENU_SELECTOR);
		const button = getLeftMenuHomeButton();
		if (button && menuEl) {
			const diameter = readNavButtonCircleBoundsPx(menuEl, button)?.diameter ?? 0;
			return measured + (button.getBoundingClientRect().height - diameter) / 2 + topGap;
		}
	}

	return null;
}

/**
 * Низ контентной зоны — по нижнему визуальному кругу рельсы, не по sound/языку.
 *
 * @param {number} viewportHeight
 * @param {number} [bottomGap]
 * @param {number} [fallbackInset]
 */
export function resolveCaseStudyContentBottomPx(viewportHeight, bottomGap = 0, fallbackInset = 40) {
	const published = getLeftMenuContentAnchor();
	if (published.lastCircleBottom != null) {
		return capContentBottomAboveMenu(published.lastCircleBottom) + bottomGap;
	}

	const bounds = getLeftMenuIconRailVisualBoundsPx() ?? getLeftMenuIconRailBoundsPx();
	if (bounds) {
		return capContentBottomAboveMenu(bounds.bottom) + bottomGap;
	}

	const bottomTop = getLeftMenuBottomSectionTopPx();
	if (bottomTop != null && Number.isFinite(bottomTop)) {
		return bottomTop - 16 + bottomGap;
	}

	return viewportHeight - fallbackInset;
}

/**
 * @deprecated Используйте resolveCaseStudyContentBottomPx.
 */
export function resolveLeftMenuContentBottomInsetPx(viewportHeight, fallback = 40) {
	const bottomPx = resolveCaseStudyContentBottomPx(viewportHeight, 0, fallback);
	return Math.max(fallback, viewportHeight - bottomPx);
}

export { resolveLastNavIconCircleBottomLocalY };
