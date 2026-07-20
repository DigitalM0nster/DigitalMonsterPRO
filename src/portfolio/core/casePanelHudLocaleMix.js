/**
 * Case left HUD locale switch — adapter over shared panelHudLocaleMixController.
 * Overrides stage/click mix while wipe is active (see CaseStudyPanelHudMesh).
 */
import { getCaseChromeMosaicEnterMs } from "@/portfolio/ui/CaseStudyCanvas/caseChromeMosaicConfig.js";
import { createPanelHudLocaleMixController } from "@/shared/panelHud/panelHudLocaleMixController.js";
import { shouldAnimateSiteLocaleForCaseChrome } from "@/utils/siteLocaleSwitch.js";
import { normalizeSiteLocale } from "@/utils/siteLocale.js";
import { store } from "@/store.jsx";
import { wakeCaseStudyAnimationFrame } from "./caseStudyAnimationFrame.js";
import {
	promoteCasePanelHudCanvases,
	promoteCasePanelHudIfShowingMapTo,
} from "./casePanelHudBridge.js";
import {
	forceStageProgress,
	getStageProgress,
	setStageProgressState,
	syncStageProgressTarget,
} from "./stageProgress.js";

/** Locale painted on the left HUD after the last completed wipe. */
let displayedLocale = normalizeSiteLocale(store.siteLocale);

/** @type {boolean | object | null} */
let pendingDisplayPrepared = null;

/** @type {null | {
 *   prepareWipe: (desiredLocale: string) => Promise<boolean | object>,
 *   onInstantSwap: (desiredLocale: string) => (boolean | Promise<boolean>),
 *   shouldAnimate?: () => boolean,
 *   onAfterDisplayed?: (locale: string, prepared: boolean | object | null) => void,
 * }} */
let playCallHooks = null;

function clamp01(value) {
	return Math.max(0, Math.min(1, Number(value) || 0));
}

function publishStageProgressToStore() {
	const progress = getStageProgress();
	store.portfolioExperience.stageProgress = progress;
	store.portfolioExperience.stageProgressTarget = progress;
}

function pinStageAtRestAfterPromote(mixProgress) {
	if (mixProgress >= 0.5) {
		promoteCasePanelHudIfShowingMapTo(mixProgress);
	}
	setStageProgressState(0);
	syncStageProgressTarget(0);
	store.portfolioExperience.stageProgress = 0;
	store.portfolioExperience.stageProgressTarget = 0;
}

/**
 * @param {{
 *   isCancelled: () => boolean,
 *   animateValue: (opts: {
 *     from: number,
 *     to: number,
 *     durationMs: number,
 *     onTick: (value: number) => void,
 *   }) => Promise<void>,
 * }} helpers
 */
async function settleCaseStage(helpers) {
	const progress = clamp01(getStageProgress());
	if (progress <= 0.02 || progress >= 0.98) {
		pinStageAtRestAfterPromote(progress);
		wakeCaseStudyAnimationFrame();
		return;
	}

	const endpoint = progress >= 0.5 ? 1 : 0;
	const start = progress;
	const distance = Math.abs(endpoint - start);
	if (distance <= 0.001) {
		pinStageAtRestAfterPromote(endpoint);
		wakeCaseStudyAnimationFrame();
		return;
	}

	syncStageProgressTarget(endpoint);
	wakeCaseStudyAnimationFrame();

	await helpers.animateValue({
		from: start,
		to: endpoint,
		durationMs: Math.max(1, getCaseChromeMosaicEnterMs() * distance),
		onTick: (next) => {
			forceStageProgress(next);
			publishStageProgressToStore();
			wakeCaseStudyAnimationFrame();
		},
	});

	if (!helpers.isCancelled()) {
		pinStageAtRestAfterPromote(endpoint);
		wakeCaseStudyAnimationFrame();
	}
}

const caseLocaleMix = createPanelHudLocaleMixController({
	getDesiredLocale: () => normalizeSiteLocale(store.siteLocale),
	getDisplayedLocale: () => displayedLocale,
	setDisplayedLocale: (locale) => {
		displayedLocale = normalizeSiteLocale(locale);
		const prepared = pendingDisplayPrepared;
		pendingDisplayPrepared = null;
		playCallHooks?.onAfterDisplayed?.(displayedLocale, prepared);
	},
	shouldAnimate: () => {
		if (typeof playCallHooks?.shouldAnimate === "function") {
			return playCallHooks.shouldAnimate();
		}
		return shouldAnimateSiteLocaleForCaseChrome();
	},
	getDurationMs: () => getCaseChromeMosaicEnterMs(),
	settle: settleCaseStage,
	prepareWipe: async (desiredLocale) => {
		if (typeof playCallHooks?.prepareWipe !== "function") {
			return false;
		}
		return playCallHooks.prepareWipe(desiredLocale);
	},
	onWipeTick: () => {
		wakeCaseStudyAnimationFrame();
	},
	onWipeDone: async (_desiredLocale, prepared) => {
		pendingDisplayPrepared = prepared;
		if (prepared && typeof prepared === "object" && prepared.skipWipe) {
			return;
		}
		promoteCasePanelHudCanvases("forward");
		setStageProgressState(0);
		syncStageProgressTarget(0);
		store.portfolioExperience.stageProgress = 0;
		store.portfolioExperience.stageProgressTarget = 0;
		wakeCaseStudyAnimationFrame();
	},
	onInstantSwap: async (desiredLocale) => {
		pendingDisplayPrepared = { instant: true };
		if (typeof playCallHooks?.onInstantSwap === "function") {
			return playCallHooks.onInstantSwap(desiredLocale);
		}
		return true;
	},
	onWipePhaseChange: () => {
		wakeCaseStudyAnimationFrame();
	},
});

export function isCasePanelHudLocaleMixBusy() {
	return caseLocaleMix.isBusy();
}

export function getCasePanelHudLocaleMixProgress() {
	return caseLocaleMix.getWipeProgress();
}

export function cancelCasePanelHudLocaleMix() {
	playCallHooks = null;
	caseLocaleMix.cancel();
}

/** Keep displayed locale in sync after curtain warm / non-animated swaps. */
export function syncCasePanelHudDisplayedLocale(locale) {
	displayedLocale = normalizeSiteLocale(locale);
}

/**
 * Settle → paint (caller) → mosaic wipe → chain while store locale differs.
 *
 * @param {{
 *   prepareWipe: (desiredLocale: string) => Promise<boolean | object>,
 *   onInstantSwap: (desiredLocale: string) => (boolean | Promise<boolean>),
 *   shouldAnimate?: () => boolean,
 *   onAfterDisplayed?: (locale: string, prepared: boolean | object | null) => void,
 * }} opts
 * @returns {Promise<boolean>}
 */
export async function playCasePanelHudLocaleMixTowardStore(opts) {
	playCallHooks = opts;
	try {
		return await caseLocaleMix.playTowardStore();
	} finally {
		playCallHooks = null;
	}
}
