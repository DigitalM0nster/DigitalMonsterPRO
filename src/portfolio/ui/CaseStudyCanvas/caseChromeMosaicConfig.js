/**
 * Tunable mosaic for case «all projects» chrome (DOM).
 * Enter must match the left WebGL band (CaseStudyPanelHudMesh mosaicReveal /
 * caseStudyReferencePanelPreset mosaic_* densified ×3 / ×2 on enter).
 */

import {
	caseStudyLeftPanelConfig,
} from "./caseStudyLeftPanelConfig.js";

/** Exit-only knobs (leave-site). Enter is derived from the left panel mosaic. */
export const CASE_CHROME_MOSAIC_DEFAULTS = {
	enterMs: 720,
	exitMs: 220,

	exit: {
		/** Vertical travel strength (0 = in place). Exit always goes upward. */
		dirY: 0.5,
		dirX: 0,
		liftStrength: 0.2,
		randomLift: 160,
		scatterX: 10,
		delay: 0.28,
		fadeAlpha: true,
	},
};

/** @type {typeof CASE_CHROME_MOSAIC_DEFAULTS} */
export const caseChromeMosaicConfig = structuredClone(CASE_CHROME_MOSAIC_DEFAULTS);

/**
 * Enter grid/motion — same densified left-panel mosaic as WebGL HUD enter.
 */
export function getCaseChromeMosaicEnterConfig() {
	const baseColumns = Math.max(1, Math.round(caseStudyLeftPanelConfig.mosaicColumns ?? 28));
	const baseRows = Math.max(1, Math.round(caseStudyLeftPanelConfig.mosaicRows ?? 24));
	return {
		columns: baseColumns * 3,
		rows: baseRows * 2,
		liftStrength: Math.max(0, Number(caseStudyLeftPanelConfig.mosaicLiftStrength) || 0.005),
		randomLift: Math.max(0, Number(caseStudyLeftPanelConfig.mosaicRandomLift) || 150),
		scatterX: Math.max(0, Number(caseStudyLeftPanelConfig.mosaicScatterX) || 0),
		delay: Math.max(0, Math.min(0.95, Number(caseStudyLeftPanelConfig.mosaicDelay) || 0.75)),
	};
}

/**
 * @param {'enter' | 'exit'} phase
 */
export function getCaseChromeMosaicPhaseConfig(phase) {
	if (phase !== "exit") {
		return getCaseChromeMosaicEnterConfig();
	}
	const cfg = caseChromeMosaicConfig;
	const phaseCfg = cfg.exit;
	return {
		columns: Math.max(1, Math.round(getCaseChromeMosaicEnterConfig().columns)),
		rows: Math.max(1, Math.round(getCaseChromeMosaicEnterConfig().rows)),
		dirY: Number(phaseCfg.dirY) || 0,
		dirX: Number(phaseCfg.dirX) || 0,
		liftStrength: Math.max(0, Number(phaseCfg.liftStrength) || 0),
		randomLift: Math.max(0, Number(phaseCfg.randomLift) || 0),
		scatterX: Math.max(0, Number(phaseCfg.scatterX) || 0),
		delay: Math.max(0, Math.min(0.95, Number(phaseCfg.delay) || 0)),
		fadeAlpha: phaseCfg.fadeAlpha !== false,
	};
}

export function getCaseChromeMosaicEnterMs() {
	return Math.max(80, Number(caseChromeMosaicConfig.enterMs) || 720);
}

export function getCaseChromeMosaicExitMs() {
	return Math.max(40, Number(caseChromeMosaicConfig.exitMs) || 220);
}
