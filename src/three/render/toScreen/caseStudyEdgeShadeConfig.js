/**
 * Case-page edge shade (right arc + bottom clusters).
 *
 * Arc band t: 0 = outer edge (away from model), 1 = inner edge (toward / at the arc).
 * Bottom band t: 0 = bottom of shade band, 1 = top of shade band.
 * Bottom: 7 t-stops; alphas are fixed by index (1 → 0).
 *
 * Left-bottom: X/width follow «ALL PROJECTS» glyphs for the active locale.
 * Nav labels: four separate clusters —
 *   previous direction / next direction / previous name / next name —
 * each content-fit to measured locale glyph bounds.
 */

export const caseStudyEdgeShadeConfig = {
	arcBandPadPx: 224,
	arcBandMaxPx: 900,
	arcBandVw: 0.15,
	arcRadiusInsetPx: -25,
	arcStopSolid: 0.49,
	arcStopMid: 0.93,
	arcMidAlpha: 0.95,
	arcStopFade: 1,

	bottomHeightPx: 155,
	bottomOffsetPx: 0,
	bottomPower: 3.15,
	bottomStop0T: 0,
	bottomStop1T: 0.65,
	bottomStop2T: 0.72,
	bottomStop3T: 0.77,
	bottomStop4T: 0.8,
	bottomStop5T: 0.84,
	bottomStop6T: 0.92,

	bottomClusterPadX: 48,
	bottomClusterPadY: 40,
	bottomClusterSoftPx: 72,
	bottomClusterSoftYPx: 64,

	/**
	 * Four prev/next text clusters (direction + project name × 2).
	 * Pad/soft shared; X/width/Y derived from measured glyphs each frame.
	 */
	bottomNavLabelContentFit: true,
	bottomNavLabelPadXPx: 40,
	bottomNavLabelPadYPx: 5,
	bottomNavLabelSoftPx: 70,
	bottomNavLabelSoftYPx: 10,

	/**
	 * @deprecated Single right cluster replaced by four nav-label clusters.
	 * Kept so older debug tooling / saved values do not crash.
	 */
	bottomRightManual: true,
	bottomRightContentFit: true,
	bottomRightContentPadXPx: 28,
	bottomRightXPx: 1131,
	bottomRightWidthPx: 915,
	bottomRightRightInsetPx: -126,
	bottomRightBottomPx: 0,
	bottomRightHeightPx: 110,
	bottomRightSoftPx: 90,
	bottomRightSoftYPx: 90,

	/**
	 * Left-bottom cluster under «ALL PROJECTS».
	 * When contentFit is on, width follows current-locale title/subtitle/marker.
	 */
	bottomLeftManual: true,
	bottomLeftContentFit: true,
	bottomLeftContentPadXPx: 28,
	/** @deprecated Display-only when contentFit; derived each frame. */
	bottomLeftXPx: 146,
	/** @deprecated Display-only when contentFit; derived each frame. */
	bottomLeftWidthPx: 280,
	bottomLeftBottomPx: 0,
	bottomLeftHeightPx: 110,
	bottomLeftSoftPx: 72,
	bottomLeftSoftYPx: 64,

	rightEnabled: true,
	bottomEnabled: true,
};

export const BOTTOM_STOP_T_KEYS = [
	"bottomStop0T",
	"bottomStop1T",
	"bottomStop2T",
	"bottomStop3T",
	"bottomStop4T",
	"bottomStop5T",
	"bottomStop6T",
];

/** @typedef {'previousDirection' | 'nextDirection' | 'previousName' | 'nextName'} NavLabelShadeId */

/** @type {NavLabelShadeId[]} */
export const NAV_LABEL_SHADE_IDS = [
	"previousDirection",
	"nextDirection",
	"previousName",
	"nextName",
];

export const BOTTOM_RIGHT_SHADE_DEFAULTS = {
	bottomRightManual: true,
	bottomRightContentFit: true,
	bottomRightContentPadXPx: 28,
	bottomRightXPx: 1131,
	bottomRightWidthPx: 915,
	bottomRightRightInsetPx: -126,
	bottomRightBottomPx: 0,
	bottomRightHeightPx: 110,
	bottomRightSoftPx: 90,
	bottomRightSoftYPx: 90,
};

export const BOTTOM_LEFT_SHADE_DEFAULTS = {
	bottomLeftManual: true,
	bottomLeftContentFit: true,
	bottomLeftContentPadXPx: 28,
	bottomLeftXPx: 146,
	bottomLeftWidthPx: 280,
	bottomLeftBottomPx: 0,
	bottomLeftHeightPx: 110,
	bottomLeftSoftPx: 72,
	bottomLeftSoftYPx: 64,
};

export const BOTTOM_NAV_LABEL_SHADE_DEFAULTS = {
	bottomNavLabelContentFit: true,
	bottomNavLabelPadXPx: 40,
	bottomNavLabelPadYPx: 5,
	bottomNavLabelSoftPx: 70,
	bottomNavLabelSoftYPx: 10,
};
