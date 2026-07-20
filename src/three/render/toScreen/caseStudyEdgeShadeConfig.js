/**
 * Case-page edge shade (right arc band only).
 *
 * Arc band t: 0 = outer edge (away from model), 1 = inner edge (toward / at the arc).
 */

export const caseStudyEdgeShadeConfig = {
	arcBandPadPx: 224,
	arcBandMaxPx: 900,
	arcBandVw: 0.15,
	/**
	 * Positive = shade starts outside the arc track (does not darken the ring).
	 * Negative pulled shade under the WebGL arc and made the track look dead.
	 */
	arcRadiusInsetPx: 14,
	arcStopSolid: 0.49,
	arcStopMid: 0.93,
	arcMidAlpha: 0.95,
	arcStopFade: 1,

	rightEnabled: true,
};
