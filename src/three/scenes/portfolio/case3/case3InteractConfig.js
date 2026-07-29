/** Tuning for Case3 construction-block hover. */

export const CASE3_BLOCK_HOVER = {
	/** Skip hit recompute unless pointer NDC moved by this (cheap gate). */
	pointerEpsilon: 0.0035,
	brightnessHot: 1,
	brightnessIdle: 0.28,
	edgeOpacity: 0.42,
	edgeIdleRgb: [0.02, 0.18, 0.28],
	edgeHotRgb: [0.2, 0.85, 1],
	stripIdleRgb: [0, 2.35, 5.4],
	stripHotRgb: [0.35, 3.2, 6.2],
	stripHotHeightMul: 1.85,
	/**
	 * Left / center pedestal / right platforms act as one hover unit.
	 * Hover any member → light the 4 stage neon lines together.
	 */
	stageBlockIndices: [0, 1, 2, 4, 6],
};
