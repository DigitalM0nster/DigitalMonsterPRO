/**
 * Left case stage-rail tune (chrome HUD).
 * Mutated live by CaseStudyStageRailDevTools in DEV.
 */

export const caseStudyStageRailConfigDefaults = {
	nodeScale: 0.45,
	trackWidthMul: 0.5,
	trackWidthMin: 1,
	futureAlpha: 0.28,
	progressAlpha: 0.58,
	linkAlpha: 0.42,
	nodeIdleAlpha: 0.24,
	nodeMidAlpha: 0.1,
	nodePastAlpha: 1,
	quietVeilExtra: 1.6,
	quietVeilAlphaMul: 0.22,
	lineBloomBlur: 12,
	lineBloomStrength: 2,
	nodeCaptureSpanMul: 0.6,
	nodeCaptureFalloff: 0.5,
	nodeRingVeilAlpha: 0.25,
	nodeRingVeilExtra: 0,
	nodeOuterHlAlpha0: 0.8,
	nodeOuterHlAlpha1: 0,
	nodeInnerHotAlpha: 0.55,
};

/** Live mutable tune — start as defaults. */
export const caseStudyStageRailConfig = { ...caseStudyStageRailConfigDefaults };

export function resetCaseStudyStageRailConfig() {
	Object.assign(caseStudyStageRailConfig, caseStudyStageRailConfigDefaults);
}

export function shouldOpenStageRailDevFromUrl() {
	if (typeof window === "undefined") {
		return false;
	}
	return new URLSearchParams(window.location.search).get("railDev") === "1";
}
