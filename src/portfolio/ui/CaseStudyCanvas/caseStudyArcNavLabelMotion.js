import { wakeCaseStudyAnimationFrame } from "@/portfolio/core/caseStudyAnimationFrame.js";
import { parseCssColor, rgbaToCssColor } from "./caseStudyArcNavLabelColors.js";

/** Длительность перехода цвета цифр и подписей. */
export const ARC_NAV_LABEL_COLOR_TRANSITION_SEC = 0.5;

const MAX_NAV_LABELS = 8;

/** @type {Array<{ r: number, g: number, b: number, a: number } | null>} */
const indexDisplay = Array.from({ length: MAX_NAV_LABELS }, () => null);
/** @type {Array<{ r: number, g: number, b: number, a: number } | null>} */
const titleDisplay = Array.from({ length: MAX_NAV_LABELS }, () => null);
/** @type {Array<{ r: number, g: number, b: number, a: number } | null>} */
const indexTarget = Array.from({ length: MAX_NAV_LABELS }, () => null);
/** @type {Array<{ r: number, g: number, b: number, a: number } | null>} */
const titleTarget = Array.from({ length: MAX_NAV_LABELS }, () => null);

let navLabelSlotCount = 0;

/**
 * @param {string} cssColor
 */
function toRgba(cssColor) {
	return parseCssColor(cssColor);
}

/**
 * @param {{ r: number, g: number, b: number, a: number }} a
 * @param {{ r: number, g: number, b: number, a: number }} b
 */
function rgbaEqual(a, b) {
	return (
		Math.abs(a.r - b.r) < 0.5 &&
		Math.abs(a.g - b.g) < 0.5 &&
		Math.abs(a.b - b.b) < 0.5 &&
		Math.abs(a.a - b.a) < 0.004
	);
}

/**
 * @param {{ r: number, g: number, b: number, a: number } | null} current
 * @param {{ r: number, g: number, b: number, a: number }} target
 * @param {number} dt
 */
function tickRgbaChannel(current, target, dt) {
	if (!current) {
		return { ...target };
	}

	const step = Math.min(1, dt / ARC_NAV_LABEL_COLOR_TRANSITION_SEC);
	if (step >= 1) {
		return { ...target };
	}

	return {
		r: current.r + (target.r - current.r) * step,
		g: current.g + (target.g - current.g) * step,
		b: current.b + (target.b - current.b) * step,
		a: current.a + (target.a - current.a) * step,
	};
}

/**
 * @param {number} count
 */
export function resetArcNavLabelColorMotion(count = 0) {
	navLabelSlotCount = count;
	for (let i = 0; i < MAX_NAV_LABELS; i += 1) {
		indexDisplay[i] = null;
		titleDisplay[i] = null;
		indexTarget[i] = null;
		titleTarget[i] = null;
	}
}

/**
 * @param {number} navCount
 */
export function setArcNavLabelSlotCount(navCount) {
	navLabelSlotCount = Math.min(navCount, MAX_NAV_LABELS);
}

/**
 * @param {number} index
 * @param {string} indexCss
 * @param {string} titleCss
 */
export function syncArcNavLabelColorTargets(index, indexCss, titleCss) {
	if (index < 0 || index >= MAX_NAV_LABELS) {
		return;
	}

	const nextIndex = toRgba(indexCss);
	const nextTitle = toRgba(titleCss);
	const prevIndex = indexTarget[index];
	const prevTitle = titleTarget[index];

	indexTarget[index] = nextIndex;
	titleTarget[index] = nextTitle;

	if (!indexDisplay[index]) {
		indexDisplay[index] = { ...nextIndex };
	}
	if (!titleDisplay[index]) {
		titleDisplay[index] = { ...nextTitle };
	}

	const targetChanged =
		!prevIndex ||
		!prevTitle ||
		!rgbaEqual(prevIndex, nextIndex) ||
		!rgbaEqual(prevTitle, nextTitle);

	if (targetChanged) {
		const displayIndex = indexDisplay[index];
		const displayTitle = titleDisplay[index];
		if (
			!displayIndex ||
			!displayTitle ||
			!rgbaEqual(displayIndex, nextIndex) ||
			!rgbaEqual(displayTitle, nextTitle)
		) {
			wakeCaseStudyAnimationFrame();
		}
	}
}

/**
 * @param {number} index
 */
export function getArcNavLabelDisplayColors(index) {
	const indexRgba = indexDisplay[index] ?? indexTarget[index];
	const titleRgba = titleDisplay[index] ?? titleTarget[index];

	return {
		index: indexRgba ? rgbaToCssColor(indexRgba) : "rgba(255, 255, 255, 0.42)",
		title: titleRgba ? rgbaToCssColor(titleRgba) : "rgba(255, 255, 255, 0.42)",
	};
}

export function isArcNavLabelColorsAnimating() {
	for (let i = 0; i < navLabelSlotCount; i += 1) {
		const displayIndex = indexDisplay[i];
		const displayTitle = titleDisplay[i];
		const targetIndex = indexTarget[i];
		const targetTitle = titleTarget[i];

		if (!targetIndex || !targetTitle) {
			continue;
		}

		if (!displayIndex || !displayTitle) {
			return true;
		}

		if (!rgbaEqual(displayIndex, targetIndex) || !rgbaEqual(displayTitle, targetTitle)) {
			return true;
		}
	}

	return false;
}

/**
 * @param {number} dt — секунды
 * @returns {boolean} нужна ли перерисовка canvas
 */
export function tickArcNavLabelColors(dt) {
	if (!isArcNavLabelColorsAnimating()) {
		return false;
	}

	let changed = false;

	for (let i = 0; i < navLabelSlotCount; i += 1) {
		const targetIndex = indexTarget[i];
		const targetTitle = titleTarget[i];
		if (!targetIndex || !targetTitle) {
			continue;
		}

		const nextIndex = tickRgbaChannel(indexDisplay[i], targetIndex, dt);
		const nextTitle = tickRgbaChannel(titleDisplay[i], targetTitle, dt);

		if (
			!indexDisplay[i] ||
			!rgbaEqual(indexDisplay[i], nextIndex) ||
			!rgbaEqual(titleDisplay[i], nextTitle)
		) {
			changed = true;
		}

		indexDisplay[i] = nextIndex;
		titleDisplay[i] = nextTitle;
	}

	return changed;
}
