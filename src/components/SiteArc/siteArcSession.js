/**
 * Module-level case-arc session (survives React remounts).
 * Intro plays once per case-space visit; case→case does not restart it.
 */
import {
	siteArcRuntime,
	SITE_ARC_INTRO_MS,
	SITE_ARC_INTRO_START_DEG,
} from "./siteArcConfig.js";
import { flushSiteArcPaint } from "@/pages/portfolio/core/caseStudyAnimationFrame.js";

let sessionActive = false;
let introPlayed = false;
/** @type {number} */
let orbitExitRaf = 0;

export function isSiteArcSessionActive() {
	return sessionActive;
}

export function hasSiteArcIntroPlayed() {
	return introPlayed;
}

export function markSiteArcIntroPlayed() {
	introPlayed = true;
	sessionActive = true;
	siteArcRuntime.introRotationDeg = 0;
	siteArcRuntime.introOpacity = 1;
}

/** First enter into case-space (hub/about → case). */
export function beginSiteArcSession({ fromAnotherCase = false } = {}) {
	sessionActive = true;
	if (introPlayed || fromAnotherCase) {
		markSiteArcIntroPlayed();
		return { needsOrbitIntro: false };
	}
	siteArcRuntime.introRotationDeg = SITE_ARC_INTRO_START_DEG;
	siteArcRuntime.introOpacity = 0;
	return { needsOrbitIntro: true };
}

/** Leave case-space entirely (case → hub/about/contacts). */
export function endSiteArcSession() {
	cancelSiteArcOrbitExit();
	sessionActive = false;
	introPlayed = false;
	siteArcRuntime.introRotationDeg = SITE_ARC_INTRO_START_DEG;
	siteArcRuntime.introOpacity = 0;
}

export function isSiteArcOrbitExiting() {
	return orbitExitRaf !== 0;
}

export function cancelSiteArcOrbitExit() {
	if (orbitExitRaf) {
		cancelAnimationFrame(orbitExitRaf);
		orbitExitRaf = 0;
	}
}

/**
 * Orbit park + fade out. Module-level so React remount / routePhase churn
 * cannot cancel mid-flight. Flushes DomNav each frame (case rAF may already be stopped).
 */
export function playSiteArcOrbitExit() {
	if (orbitExitRaf) {
		return;
	}
	const startRot = siteArcRuntime.introRotationDeg ?? 0;
	const startOp = siteArcRuntime.introOpacity ?? 1;
	const startedAt = performance.now();
	sessionActive = true;

	const tick = (now) => {
		const progress = Math.min(1, (now - startedAt) / SITE_ARC_INTRO_MS);
		const eased = progress ** 3;
		siteArcRuntime.introRotationDeg = startRot
			+ (SITE_ARC_INTRO_START_DEG - startRot) * eased;
		siteArcRuntime.introOpacity = startOp * (1 - eased);
		flushSiteArcPaint();
		if (progress < 1) {
			orbitExitRaf = requestAnimationFrame(tick);
			return;
		}
		orbitExitRaf = 0;
		endSiteArcSession();
		flushSiteArcPaint();
	};
	orbitExitRaf = requestAnimationFrame(tick);
}

/**
 * Keep chrome session alive.
 * While orbit intro is still pending, do NOT force rest pose — that flashes the
 * idle arc on the right before park + appear.
 *
 * @param {{ forceVisible?: boolean }} [opts]
 *   forceVisible — case→case / skip-intro: jump to rest even if intro not finished
 */
export function keepSiteArcSessionAlive({ forceVisible = false } = {}) {
	sessionActive = true;
	if (!introPlayed && !forceVisible) {
		return;
	}
	introPlayed = true;
	siteArcRuntime.introRotationDeg = 0;
	siteArcRuntime.introOpacity = 1;
}
