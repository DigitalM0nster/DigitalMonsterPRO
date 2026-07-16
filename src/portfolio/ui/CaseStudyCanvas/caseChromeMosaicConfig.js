/**
 * Tunable mosaic for case bottom nav chrome (DOM).
 * Enter / exit are separate phase tunables (see CASE_CHROME_MOSAIC_DEFAULTS).
 *
 * enterMs / exitMs also drive the shared HUD reveal clock (left WebGL + chrome).
 */

export const CASE_CHROME_MOSAIC_DEFAULTS = {
	enterMs: 720,
	exitMs: 220,
	columns: 80,
	rows: 40,

	enter: {
		/**
		 * Vertical travel strength (0 = in place).
		 * Enter: each tile randomly from above or below. Sign ignored — use abs as strength.
		 */
		dirY: 0.7,
		/** Extra X drift direction (−1…1). */
		dirX: 0,
		liftStrength: 0.1,
		randomLift: 100,
		scatterX: 50,
		delay: 0.28,
		/** If true, tile alpha follows progress; if false, only motion. */
		fadeAlpha: true,
	},

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
 * @param {'enter' | 'exit'} phase
 */
export function getCaseChromeMosaicPhaseConfig(phase) {
	const cfg = caseChromeMosaicConfig;
	const phaseCfg = phase === "exit" ? cfg.exit : cfg.enter;
	return {
		columns: Math.max(1, Math.round(cfg.columns)),
		rows: Math.max(1, Math.round(cfg.rows)),
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
