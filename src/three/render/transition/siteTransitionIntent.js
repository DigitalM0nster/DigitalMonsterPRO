/**
 * Single leave/enter decision fan-in for the whole site.
 * @see SITE_TRANSITION.md
 *
 * Call publishSiteRouteTransition whenever the visual route is about to change.
 * React / routePhase must not start chrome exits — only this module does.
 */
import { getCasePanelHudState, setCasePanelHudEnterProgress } from "@/pages/portfolio/core/casePanelHudBridge.js";
import { stopCaseStudyAnimationFrame } from "@/pages/portfolio/core/caseStudyAnimationFrame.js";
import { cancelCasePanelHudReveal, isCasePanelHudRevealExiting, playCasePanelHudExit, releaseCasePanelHud } from "@/pages/portfolio/core/casePanelHudReveal.js";
import { playSiteArcOrbitExit } from "@/components/SiteArc/siteArcSession.js";
import { store } from "@/app/store.jsx";

/** @typedef {'hex' | 'case-boundary' | 'about-boundary' | 'ring' | 'html-fallback'} SiteTransitionMode */
/** @typedef {'none' | 'case-band' | 'case-full'} SiteChromeLeave */

/** True when the next case mount should skip arc orbit intro (case→case). */
let caseEnterFromAnotherCase = false;

/** True while leaving a case toward a non-case route (full HUD + arc orbit exit). */
let caseLeavingToNonCase = false;

/** Last chrome leave key — avoids restarting the same exit animation. */
let lastChromeLeaveKey = "";

/** @type {Set<(transition: ReturnType<typeof publishSiteRouteTransition>) => void>} */
const transitionListeners = new Set();

export function subscribeSiteRouteTransition(listener) {
	transitionListeners.add(listener);
	return () => transitionListeners.delete(listener);
}

/**
 * @param {string | null | undefined} path
 * @returns {string}
 */
export function normalizeSiteTransitionPath(path) {
	return String(path ?? "/").replace(/\/+$/, "") || "/";
}

/**
 * @param {string | null | undefined} path
 * @returns {boolean}
 */
export function isPortfolioCasePath(path) {
	const normalized = normalizeSiteTransitionPath(path);
	if (!normalized.startsWith("/portfolio/")) {
		return false;
	}
	const rest = normalized.slice("/portfolio/".length);
	return Boolean(rest) && !rest.includes("/");
}

/**
 * @param {string | null | undefined} path
 * @returns {boolean}
 */
export function isAboutSitePath(path) {
	return normalizeSiteTransitionPath(path) === "/about";
}

function noteCaseEnterSource(fromPath, toPath) {
	if (!isPortfolioCasePath(toPath)) {
		return;
	}
	caseEnterFromAnotherCase = isPortfolioCasePath(fromPath);
}

function noteCaseLeaveDestination(fromPath, toPath) {
	if (!isPortfolioCasePath(fromPath)) {
		caseLeavingToNonCase = false;
		return;
	}
	caseLeavingToNonCase = !isPortfolioCasePath(toPath);
}

/** @returns {boolean} */
export function isCaseEnterFromAnotherCase() {
	return caseEnterFromAnotherCase;
}

/** @returns {boolean} */
export function isCaseLeavingToNonCase() {
	return caseLeavingToNonCase;
}

/**
 * Record enter/leave flags without starting chrome (rare: flags needed before mix).
 * Prefer publishSiteRouteTransition.
 * @param {string} fromPath
 * @param {string} toPath
 */
export function noteSiteTransitionPaths(fromPath, toPath) {
	const from = normalizeSiteTransitionPath(fromPath);
	const to = normalizeSiteTransitionPath(toPath);
	noteCaseEnterSource(from, to);
	noteCaseLeaveDestination(from, to);
	return { from, to, leaveSite: caseLeavingToNonCase, fromCase: isPortfolioCasePath(from) };
}

/**
 * @param {string} fromPath
 * @param {string} toPath
 * @returns {SiteChromeLeave}
 */
export function resolveSiteChromeLeave(fromPath, toPath) {
	const from = normalizeSiteTransitionPath(fromPath);
	const to = normalizeSiteTransitionPath(toPath);
	if (!isPortfolioCasePath(from)) {
		return "none";
	}
	return isPortfolioCasePath(to) ? "case-band" : "case-full";
}

/**
 * Hex case→site / case→case boundary: keep left band fully shown for hex RT
 * bake (`_getCasePanelHudHexOverlayTexture`); snap-release on route confirm.
 * Mosaic exit drops enterProgress and blanks the bake mid-wipe — do not run it
 * while the wipe still needs glyphs (same as About left HUD).
 * @param {SiteTransitionMode} mode
 * @param {SiteChromeLeave} chrome
 */
function holdCasePanelHudForHexLeave(mode, chrome = "case-full") {
	if (mode !== "hex" && mode !== "case-boundary") {
		return false;
	}
	if (mode === "case-boundary" && chrome !== "case-band") {
		return false;
	}
	if (isCasePanelHudRevealExiting()) {
		cancelCasePanelHudReveal();
	}
	// Idle full show (null). enterProgress=0 blanks bake / hides the band.
	setCasePanelHudEnterProgress(null);
	return true;
}

/**
 * Start case chrome leave once for this from→to decision.
 * @param {SiteChromeLeave} chrome
 * @param {string} from
 * @param {string} to
 * @param {SiteTransitionMode} mode
 */
function startCaseChromeLeave(chrome, from, to, mode = "hex") {
	if (chrome === "none") {
		return;
	}

	const leaveKey = `${from}->${to}:${chrome}`;
	if (leaveKey === lastChromeLeaveKey && isCasePanelHudRevealExiting()) {
		return;
	}
	lastChromeLeaveKey = leaveKey;

	const hasHud = Boolean(getCasePanelHudState().fromCanvas?.width);

	if (!store.openedCase && !hasHud) {
		if (chrome === "case-full") {
			playSiteArcOrbitExit();
		}
		stopCaseStudyAnimationFrame();
		return;
	}

	if (!hasHud) {
		if (chrome === "case-full") {
			playSiteArcOrbitExit();
			releaseCasePanelHud();
		}
		return;
	}

	if (isCasePanelHudRevealExiting()) {
		// A chained boundary settle can begin as case→case (band hold) and then
		// immediately become case→site. Upgrade that same in-flight animation.
		if (chrome === "case-full") {
			playSiteArcOrbitExit();
			if (holdCasePanelHudForHexLeave(mode, chrome)) {
				return;
			}
			playCasePanelHudExit({ mosaicScope: "full", release: true, force: true });
		}
		return;
	}

	if (chrome === "case-full") {
		playSiteArcOrbitExit();
		if (holdCasePanelHudForHexLeave(mode, chrome)) {
			return;
		}
		playCasePanelHudExit({ mosaicScope: "full", release: true });
		return;
	}

	// case→case: hold full band for hex RT bake (no mosaic fade mid-wipe).
	if (holdCasePanelHudForHexLeave(mode, chrome)) {
		return;
	}
	playCasePanelHudExit({ mosaicScope: "band", release: false });
}

/**
 * Publish a site route transition decision.
 * Sets case enter/leave flags and starts the matching chrome exit exactly once.
 *
 * About left HUD: no mosaic exit here — hex / about-boundary warps the band via
 * `hexCutHudSourceWarpPack` (ABOUT_PANEL_HUD.md). Case chrome leave is unchanged.
 *
 * @param {string} fromPath
 * @param {string} toPath
 * @param {{ mode?: SiteTransitionMode }} [options]
 * @returns {{
 *   from: string,
 *   to: string,
 *   mode: SiteTransitionMode,
 *   chrome: SiteChromeLeave,
 *   leaveSite: boolean,
 *   caseToCase: boolean,
 * }}
 */
export function publishSiteRouteTransition(fromPath, toPath, options = {}) {
	const from = normalizeSiteTransitionPath(fromPath);
	const to = normalizeSiteTransitionPath(toPath);
	const mode = options.mode ?? "hex";

	noteCaseEnterSource(from, to);
	noteCaseLeaveDestination(from, to);

	const chrome = resolveSiteChromeLeave(from, to);
	startCaseChromeLeave(chrome, from, to, mode);

	const transition = {
		from,
		to,
		mode,
		chrome,
		leaveSite: chrome === "case-full",
		caseToCase: chrome === "case-band",
	};
	for (const listener of transitionListeners) {
		listener(transition);
	}
	return transition;
}
