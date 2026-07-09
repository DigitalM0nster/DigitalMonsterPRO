import { MENU_CIRCLE_IDLE_SCALE } from "./leftMenuSnap.js";

const LEFT_MENU_ICON_CIRCLE_ATTR = "data-menu-icon-circle";

/** @type {{ homeCircleTop: number | null, lastCircleBottom: number | null }} */
let anchor = {
	homeCircleTop: null,
	lastCircleBottom: null,
};

const listeners = new Set();

/**
 * @param {HTMLElement | null | undefined} menuEl
 * @param {HTMLElement | null | undefined} homeButton
 * @param {HTMLElement | null | undefined} lastButton
 */
export function measureLeftMenuContentAnchor(menuEl, homeButton, lastButton) {
	if (!homeButton || !lastButton) {
		return null;
	}

	const homeBounds = readNavButtonCircleBoundsPx(menuEl, homeButton);
	const lastBounds = readNavButtonCircleBoundsPx(menuEl, lastButton);
	if (!homeBounds || !lastBounds) {
		return null;
	}

	return {
		homeCircleTop: homeBounds.top,
		lastCircleBottom: lastBounds.bottom,
	};
}

/**
 * Визуальный круг иконки — от hit-box кнопки и реального диаметра из CSS.
 *
 * @param {HTMLElement | null | undefined} menuEl
 * @param {HTMLElement} button
 * @returns {{ top: number, bottom: number, diameter: number } | null}
 */
export function readNavButtonCircleBoundsPx(menuEl, button) {
	if (!button) {
		return null;
	}

	const btnRect = button.getBoundingClientRect();
	if (btnRect.width < 1 || btnRect.height < 1) {
		return null;
	}

	const diameter = readNavCircleDiameterPx(menuEl, button);
	const top = btnRect.top + (btnRect.height - diameter) / 2;
	const bottom = top + diameter;

	const circle = button.querySelector(`[${LEFT_MENU_ICON_CIRCLE_ATTR}]`);
	if (circle) {
		const circleRect = circle.getBoundingClientRect();
		if (
			circleRect.width >= 4 &&
			circleRect.height >= 4 &&
			circleRect.top >= btnRect.top - 1 &&
			circleRect.bottom <= btnRect.bottom + 1
		) {
			return {
				top: circleRect.top,
				bottom: circleRect.bottom,
				diameter: circleRect.height,
			};
		}
	}

	return { top, bottom, diameter };
}

/**
 * @param {{ homeCircleTop: number, lastCircleBottom: number }} next
 */
export function publishLeftMenuContentAnchor(next) {
	if (
		anchor.homeCircleTop === next.homeCircleTop &&
		anchor.lastCircleBottom === next.lastCircleBottom
	) {
		return;
	}

	anchor = {
		homeCircleTop: next.homeCircleTop,
		lastCircleBottom: next.lastCircleBottom,
	};

	for (const listener of listeners) {
		listener(anchor);
	}
}

export function getLeftMenuContentAnchor() {
	return anchor;
}

export function subscribeLeftMenuContentAnchor(listener) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

/**
 * @param {HTMLElement | null | undefined} menuEl
 * @param {HTMLElement} button
 */
export function readNavCircleDiameterPx(menuEl, button) {
	const circle = button.querySelector(`[${LEFT_MENU_ICON_CIRCLE_ATTR}]`);
	if (circle) {
		const width = Number.parseFloat(getComputedStyle(circle).width);
		if (Number.isFinite(width) && width >= 4) {
			return width;
		}
	}

	const btnRect = button.getBoundingClientRect();
	return btnRect.width * readMenuCircleIdleScale(menuEl);
}

function readMenuCircleIdleScale(menuEl) {
	if (menuEl) {
		const raw = getComputedStyle(menuEl).getPropertyValue("--menuCircleIdleScale").trim();
		const parsed = Number.parseFloat(raw);
		if (Number.isFinite(parsed) && parsed > 0) {
			return parsed;
		}
	}

	return MENU_CIRCLE_IDLE_SCALE;
}

/**
 * @param {HTMLElement | null | undefined} surfaceEl — canvas или host
 * @param {number} [topGap]
 */
export function resolveHomeIconCircleTopLocalY(surfaceEl, topGap = 0) {
	const { homeCircleTop } = anchor;
	if (homeCircleTop == null || !surfaceEl || typeof surfaceEl.getBoundingClientRect !== "function") {
		return null;
	}

	return homeCircleTop + topGap - surfaceEl.getBoundingClientRect().top;
}

/**
 * @param {HTMLElement | null | undefined} surfaceEl
 * @param {number} [bottomGap]
 */
export function resolveLastNavIconCircleBottomLocalY(surfaceEl, bottomGap = 0) {
	const { lastCircleBottom } = anchor;
	if (lastCircleBottom == null || !surfaceEl || typeof surfaceEl.getBoundingClientRect !== "function") {
		return null;
	}

	return lastCircleBottom + bottomGap - surfaceEl.getBoundingClientRect().top;
}
