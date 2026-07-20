/**
 * Module-level case-arc session (survives React remounts).
 * Intro plays once per case-space visit; case→case does not restart it.
 */
import {
	caseStudyArcRuntime,
	CASE_STUDY_ARC_INTRO_MS,
	CASE_STUDY_ARC_INTRO_START_DEG,
} from "./caseStudyArcConfig.js";
import { flushCaseStudyArcPaint } from "@/portfolio/core/caseStudyAnimationFrame.js";

let sessionActive = false;
let introPlayed = false;
/** @type {number} */
let orbitExitRaf = 0;

export function isCaseArcSessionActive() {
	return sessionActive;
}

export function hasCaseArcIntroPlayed() {
	return introPlayed;
}

export function markCaseArcIntroPlayed() {
	introPlayed = true;
	sessionActive = true;
	caseStudyArcRuntime.introRotationDeg = 0;
	caseStudyArcRuntime.introOpacity = 1;
}

/** First enter into case-space (hub/about → case). */
export function beginCaseArcSession({ fromAnotherCase = false } = {}) {
	sessionActive = true;
	if (introPlayed || fromAnotherCase) {
		markCaseArcIntroPlayed();
		return { needsOrbitIntro: false };
	}
	caseStudyArcRuntime.introRotationDeg = CASE_STUDY_ARC_INTRO_START_DEG;
	caseStudyArcRuntime.introOpacity = 0;
	return { needsOrbitIntro: true };
}

/** Leave case-space entirely (case → hub/about/contacts). */
export function endCaseArcSession() {
	cancelCaseArcOrbitExit();
	sessionActive = false;
	introPlayed = false;
	caseStudyArcRuntime.introRotationDeg = CASE_STUDY_ARC_INTRO_START_DEG;
	caseStudyArcRuntime.introOpacity = 0;
}

export function isCaseArcOrbitExiting() {
	return orbitExitRaf !== 0;
}

export function cancelCaseArcOrbitExit() {
	if (orbitExitRaf) {
		cancelAnimationFrame(orbitExitRaf);
		orbitExitRaf = 0;
	}
}

/**
 * Orbit park + fade out. Module-level so React remount / routePhase churn
 * cannot cancel mid-flight. Flushes DomNav each frame (case rAF may already be stopped).
 */
export function playCaseArcOrbitExit() {
	if (orbitExitRaf) {
		return;
	}
	const startRot = caseStudyArcRuntime.introRotationDeg ?? 0;
	const startOp = caseStudyArcRuntime.introOpacity ?? 1;
	const startedAt = performance.now();
	sessionActive = true;

	const tick = (now) => {
		const progress = Math.min(1, (now - startedAt) / CASE_STUDY_ARC_INTRO_MS);
		const eased = progress ** 3;
		caseStudyArcRuntime.introRotationDeg = startRot
			+ (CASE_STUDY_ARC_INTRO_START_DEG - startRot) * eased;
		caseStudyArcRuntime.introOpacity = startOp * (1 - eased);
		flushCaseStudyArcPaint();
		if (progress < 1) {
			orbitExitRaf = requestAnimationFrame(tick);
			return;
		}
		orbitExitRaf = 0;
		endCaseArcSession();
		flushCaseStudyArcPaint();
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
export function keepCaseArcSessionAlive({ forceVisible = false } = {}) {
	sessionActive = true;
	if (!introPlayed && !forceVisible) {
		return;
	}
	introPlayed = true;
	caseStudyArcRuntime.introRotationDeg = 0;
	caseStudyArcRuntime.introOpacity = 1;
}
