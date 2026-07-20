import { store } from "@/store.jsx";
import { getProjectBySlug } from "@/portfolio/core/projectRegistry.js";
import {
	caseStudyArcConfig,
	caseStudyArcInternals,
	caseStudyArcRuntime,
	resolveNodeMarkerRadii,
} from "@/portfolio/ui/CaseStudyCanvas/caseStudyArcConfig.js";
import { caseStudyArcActiveLineConfig } from "@/portfolio/ui/CaseStudyCanvas/caseStudyArcActiveLineConfig.js";
import {
	getCaseStudyArcStepPositionsFromAngles,
	resolveCaseStudyArcGeometry,
} from "@/portfolio/ui/CaseStudyCanvas/caseStudyArcGeometry.js";
import { getCyclicItemRelativeDeg } from "@/portfolio/ui/CaseStudyCanvas/caseStudyArcCycle.js";
import { getArcGlowCenterAngleRad } from "@/portfolio/ui/CaseStudyCanvas/caseStudyArcGlowMotion.js";
import { getNodeArcGlowHighlight } from "@/portfolio/ui/CaseStudyCanvas/caseStudyArcActiveGlow.js";
import {
	getArcLineCutoutHalfRad,
	resolveArcFadeBounds,
} from "@/portfolio/ui/CaseStudyCanvas/caseStudyArcOpacity.js";
import {
	resolveCaseStudyArcProjectItems,
	syncCaseStudyArcPreviewNavigation,
} from "@/portfolio/ui/CaseStudyCanvas/caseStudyArcProjects.js";
import { syncCaseStudyArcSelectSequence } from "@/portfolio/ui/CaseStudyCanvas/caseStudyArcSelectSequence.js";
import { getCaseStudyArcShift } from "@/portfolio/ui/CaseStudyCanvas/caseStudyArcPositionMotion.js";
import { getSceneCarousel } from "@/three/render/transition/carouselPage.js";
import { isCaseArcSessionActive } from "@/portfolio/ui/CaseStudyCanvas/caseStudyArcSession.js";
import { CaseStudyArcMesh } from "./CaseStudyArcMesh.js";
import { CASE_STUDY_ARC_MAX_NODES } from "./caseStudyArcShader.js";

const DEG = Math.PI / 180;

/**
 * WebGL owns track / nodes / glow. Labels/hits are DOM (CaseStudyArcDomNav).
 * Kept for any legacy Canvas draw guards.
 */
export function isCaseStudyArcWebGlLive() {
	return true;
}

/**
 * @returns {CaseStudyArcMesh}
 */
export function createCaseStudyArcOverlay() {
	return new CaseStudyArcMesh();
}

/**
 * @param {CaseStudyArcMesh | null | undefined} arc
 */
export function disposeCaseStudyArcOverlay(arc) {
	arc?.dispose?.();
}

/**
 * Build GPU state from the same modules Canvas uses (geometry / glow / focus).
 * @param {number} viewportW
 * @param {number} viewportH
 * @param {boolean} [isMobile]
 */
export function buildCaseStudyArcGpuState(viewportW, viewportH, isMobile = false) {
	const carousel = getSceneCarousel();
	const navigating = Boolean(
		carousel?.isHexNavigationActive?.() || carousel?.isCaseBoundaryDrive?.(),
	);
	syncCaseStudyArcPreviewNavigation(navigating);

	const locale = store.siteLocale;
	const slug = store.portfolioExperience?.slug;
	const activeProjectId = slug ? (getProjectBySlug(slug)?.config?.id ?? null) : null;
	const arcProjects = resolveCaseStudyArcProjectItems(locale, activeProjectId);
	const navStates = arcProjects.items;
	const internal = caseStudyArcInternals;
	const ringGapDeg = arcProjects.ringGapDeg;
	const ringPeriodDeg = arcProjects.ringPeriodDeg;
	const focusIndex = arcProjects.activeNavIndex;
	const focusDeg = caseStudyArcRuntime.focusRotationDeg
		?? (focusIndex >= 0 ? focusIndex * ringGapDeg : 0);

	const arcGeo = resolveCaseStudyArcGeometry(
		viewportW,
		viewportH,
		Math.min(navStates.length, internal.maxNavItems ?? 5),
		isMobile,
		{ top: 0, bottom: viewportH },
	);
	let { centerX } = arcGeo;
	const { centerY, radius, angleStart, angleEnd } = arcGeo;
	centerX -= getCaseStudyArcShift();

	const navItemAngles = navStates.map((_, index) => (
		getCyclicItemRelativeDeg(index, focusDeg, ringGapDeg, navStates.length) * DEG + arcGeo.rotationRad
	));
	const labelPositions = getCaseStudyArcStepPositionsFromAngles(
		navItemAngles,
		centerX,
		centerY,
		radius,
	);

	const wedgePadDeg = 6;
	const inWedgeMask = navStates.map((_, index) => (
		Math.abs(getCyclicItemRelativeDeg(index, focusDeg, ringGapDeg, navStates.length))
		<= internal.fadeEndDeg + wedgePadDeg
	));
	const lineCutoutAngles = navItemAngles.filter((_, index) => inWedgeMask[index]);
	const { outer: markerOuterR, mid: nodeMidR, inner: nodeInnerR } = resolveNodeMarkerRadii(
		internal,
		isMobile,
	);
	const lineCutoutHalfRad = getArcLineCutoutHalfRad(markerOuterR, radius, internal.trackWidth);
	const fadeBounds = resolveArcFadeBounds(
		angleStart,
		angleEnd,
		lineCutoutAngles,
		lineCutoutHalfRad,
	);

	const activeNavIndex = arcProjects.activeNavIndex;
	const activeAngle = activeNavIndex >= 0 ? labelPositions[activeNavIndex]?.angle : null;
	syncCaseStudyArcSelectSequence({
		activeIndex: activeNavIndex,
		ringGapDeg,
		ringPeriodDeg,
		activeAngleRad: activeAngle,
	});

	const glowCenterAngleRad = getArcGlowCenterAngleRad();
	const glowStrength = 1;
	const cfg = caseStudyArcConfig;
	const introOpacity = Math.max(0, Math.min(1, caseStudyArcRuntime.introOpacity ?? 1));

	const nodeAngles = [];
	const nodeHighlights = [];
	const n = Math.min(CASE_STUDY_ARC_MAX_NODES, navStates.length);
	for (let i = 0; i < n; i += 1) {
		const pos = labelPositions[i];
		if (!pos || !inWedgeMask[i]) {
			continue;
		}
		nodeAngles.push(pos.angle);
		const hl = glowCenterAngleRad != null
			? getNodeArcGlowHighlight(pos.angle, glowCenterAngleRad, cfg, glowStrength)
			: 0;
		const activeBoost = i === activeNavIndex ? 1 : 0;
		nodeHighlights.push(Math.max(hl, activeBoost));
	}

	return {
		viewportW,
		viewportH,
		centerX,
		centerY,
		radius,
		angleStart,
		angleEnd,
		noFadeMin: fadeBounds.noFadeMin,
		noFadeMax: fadeBounds.noFadeMax,
		fadeInsetRad: internal.fadeInsetDeg * DEG,
		fadePower: internal.fadePower,
		fadeTailDeg: internal.fadeTailDeg,
		trackWidth: internal.trackWidth,
		trackOpacity: cfg.trackOpacity,
		trackColor: internal.trackColor || "#ffffff",
		activeColor: cfg.activeColor,
		glowAngle: glowCenterAngleRad,
		glowStrength,
		glowHalfSpanRad: caseStudyArcActiveLineConfig.halfSpanDeg * DEG,
		glowBloomBlur: caseStudyArcActiveLineConfig.bloomBlur,
		glowBloomStrength: caseStudyArcActiveLineConfig.bloomStrength,
		glowOpacityBoost: caseStudyArcActiveLineConfig.opacityBoost,
		nodeRadius: markerOuterR,
		nodeMidRadius: nodeMidR,
		nodeInnerRadius: nodeInnerR,
		nodeMidOpacity: cfg.nodeMidOpacity,
		activeOpacity: cfg.activeOpacity,
		outerBloomBlur: cfg.activeOuterBloomBlur,
		outerBloomStrength: cfg.activeOuterBloomStrength,
		innerBloomBlur: cfg.activeInnerBloomBlur,
		innerBloomStrength: cfg.activeInnerBloomStrength,
		introOpacity,
		nodeAngles,
		nodeHighlights,
	};
}

/**
 * Per-frame: sync + show while a case is open.
 * @param {CaseStudyArcMesh | null | undefined} arc
 * @param {{
 *   showCase?: boolean,
 *   viewportW?: number,
 *   viewportH?: number,
 *   isMobile?: boolean,
 * }} opts
 */
export function syncCaseStudyArcOverlay(arc, {
	showCase = false,
	viewportW = 1920,
	viewportH = 1080,
	isMobile = false,
} = {}) {
	if (!arc) {
		return;
	}

	// Session chrome (like site header) — keep drawing during case→case even if
	// openedCase flickers false while shells remount.
	const active = Boolean(
		showCase && (store.openedCase || isCaseArcSessionActive()),
	);
	if (!active || viewportW < 2 || viewportH < 2) {
		if (arc.visible) {
			arc.setVisible(false);
		}
		return;
	}

	const state = buildCaseStudyArcGpuState(viewportW, viewportH, isMobile);
	if (state.introOpacity < 0.01) {
		arc.setVisible(false);
		return;
	}

	arc.syncState(state);
	arc.setComposeMode("screen");
	arc.setVisible(true);
}
