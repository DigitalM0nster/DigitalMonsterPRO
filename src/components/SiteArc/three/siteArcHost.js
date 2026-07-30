import { store } from "@/app/store.jsx";
import { getProjectBySlug } from "@/pages/portfolio/core/projectRegistry.js";
import {
	siteArcConfig,
	siteArcInternals,
	siteArcRuntime,
	resolveNodeMarkerRadii,
} from "@/components/SiteArc/siteArcConfig.js";
import { siteArcActiveLineConfig } from "@/components/SiteArc/siteArcActiveLineConfig.js";
import {
	getSiteArcStepPositionsFromAngles,
	resolveSiteArcGeometry,
} from "@/components/SiteArc/siteArcGeometry.js";
import { getCyclicItemRelativeDeg } from "@/components/SiteArc/siteArcCycle.js";
import { getArcGlowCenterAngleRad } from "@/components/SiteArc/siteArcGlowMotion.js";
import { getNodeArcGlowHighlight } from "@/components/SiteArc/siteArcActiveGlow.js";
import {
	getArcLineCutoutHalfRad,
	resolveArcFadeBounds,
} from "@/components/SiteArc/siteArcOpacity.js";
import {
	resolveSiteArcProjectItems,
	syncSiteArcPreviewNavigation,
} from "@/components/SiteArc/siteArcProjects.js";
import { syncSiteArcSelectSequence } from "@/components/SiteArc/siteArcSelectSequence.js";
import { getSiteArcShift } from "@/components/SiteArc/siteArcPositionMotion.js";
import { getSceneCarousel } from "@/three/render/transition/carouselPage.js";
import { isSiteArcSessionActive } from "@/components/SiteArc/siteArcSession.js";
import {
	getSiteArcNavigationSource,
	isSiteArcNavigationActive,
} from "@/components/SiteArc/siteArcNavigationSource.js";
import { SiteArcMesh } from "./SiteArcMesh.js";
import { SITE_ARC_MAX_NODES } from "./siteArcShader.js";

const DEG = Math.PI / 180;

const CAROUSEL_SCENE_TO_SITE_ARC_ID = {
	home: "main",
	portfolioHub: "portfolio",
	capabilities: "capabilities",
	about: "about",
	contacts: "contacts",
};

function resolveSiteScrollGlowAngle(labelPositions, navStates, fallbackAngle) {
	const source = getSiteArcNavigationSource();
	if (source?.key !== "site" || navStates.length < 2) {
		return fallbackAngle;
	}

	const carousel = getSceneCarousel();
	const currentArcId = CAROUSEL_SCENE_TO_SITE_ARC_ID[carousel.currentId] ?? source.activeId;
	const currentIndex = navStates.findIndex((item) => item.id === currentArcId);
	if (currentIndex < 0) {
		return fallbackAngle;
	}

	const progress = Math.max(-1, Math.min(1, Number(carousel.progress) || 0));
	if (Math.abs(progress) < 0.0001) {
		return labelPositions[currentIndex]?.angle ?? fallbackAngle;
	}

	const direction = progress > 0 ? 1 : -1;
	const targetIndex = (currentIndex + direction + navStates.length) % navStates.length;
	const fromAngle = labelPositions[currentIndex]?.angle;
	const toAngle = labelPositions[targetIndex]?.angle;
	if (!Number.isFinite(fromAngle) || !Number.isFinite(toAngle)) {
		return fallbackAngle;
	}

	return fromAngle + (toAngle - fromAngle) * Math.abs(progress);
}

/**
 * WebGL owns track / nodes / glow. Labels/hits are DOM (SiteArcDomNav).
 * Kept for any legacy Canvas draw guards.
 */
export function isSiteArcWebGlLive() {
	return true;
}

/**
 * @returns {SiteArcMesh}
 */
export function createSiteArcOverlay() {
	return new SiteArcMesh();
}

/**
 * @param {SiteArcMesh | null | undefined} arc
 */
export function disposeSiteArcOverlay(arc) {
	arc?.dispose?.();
}

/**
 * Build GPU state from the same modules Canvas uses (geometry / glow / focus).
 * @param {number} viewportW
 * @param {number} viewportH
 * @param {boolean} [isMobile]
 */
export function buildSiteArcGpuState(viewportW, viewportH, isMobile = false) {
	const carousel = getSceneCarousel();
	const navigating = Boolean(
		carousel?.isHexNavigationActive?.() || carousel?.isCaseBoundaryDrive?.(),
	);
	syncSiteArcPreviewNavigation(navigating);

	const locale = store.siteLocale;
	const slug = store.portfolioExperience?.slug;
	const activeProjectId = slug ? (getProjectBySlug(slug)?.config?.id ?? null) : null;
	const arcProjects = resolveSiteArcProjectItems(locale, activeProjectId);
	const navStates = arcProjects.items;
	const internal = siteArcInternals;
	const ringGapDeg = arcProjects.ringGapDeg;
	const ringPeriodDeg = arcProjects.ringPeriodDeg;
	const focusIndex = arcProjects.activeNavIndex;
	const focusDeg = siteArcRuntime.focusRotationDeg
		?? (focusIndex >= 0 ? focusIndex * ringGapDeg : 0);

	const arcGeo = resolveSiteArcGeometry(
		viewportW,
		viewportH,
		Math.min(navStates.length, internal.maxNavItems ?? 5),
		isMobile,
		{ top: 0, bottom: viewportH },
	);
	let { centerX } = arcGeo;
	const { centerY, radius, angleStart, angleEnd } = arcGeo;
	centerX -= getSiteArcShift();

	const navItemAngles = navStates.map((_, index) => (
		getCyclicItemRelativeDeg(index, focusDeg, ringGapDeg, navStates.length) * DEG + arcGeo.rotationRad
	));
	const labelPositions = getSiteArcStepPositionsFromAngles(
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
	syncSiteArcSelectSequence({
		activeIndex: activeNavIndex,
		ringGapDeg,
		ringPeriodDeg,
		activeAngleRad: activeAngle,
	});

	const glowCenterAngleRad = resolveSiteScrollGlowAngle(
		labelPositions,
		navStates,
		getArcGlowCenterAngleRad(),
	);
	const glowStrength = 1;
	const cfg = siteArcConfig;
	const introOpacity = Math.max(0, Math.min(1, siteArcRuntime.introOpacity ?? 1));

	const nodeAngles = [];
	const nodeHighlights = [];
	const n = Math.min(SITE_ARC_MAX_NODES, navStates.length);
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
		glowHalfSpanRad: siteArcActiveLineConfig.halfSpanDeg * DEG,
		glowBloomBlur: siteArcActiveLineConfig.bloomBlur,
		glowBloomStrength: siteArcActiveLineConfig.bloomStrength,
		glowOpacityBoost: siteArcActiveLineConfig.opacityBoost,
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
 * @param {SiteArcMesh | null | undefined} arc
 * @param {{
 *   showCase?: boolean,
 *   viewportW?: number,
 *   viewportH?: number,
 *   isMobile?: boolean,
 * }} opts
 */
export function syncSiteArcOverlay(arc, {
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
		isSiteArcNavigationActive()
		|| (showCase && (store.openedCase || isSiteArcSessionActive())),
	);
	if (!active || viewportW < 2 || viewportH < 2) {
		if (arc.visible) {
			arc.setVisible(false);
		}
		return;
	}

	const state = buildSiteArcGpuState(viewportW, viewportH, isMobile);
	if (state.introOpacity < 0.01) {
		arc.setVisible(false);
		return;
	}

	arc.syncState(state);
	arc.setComposeMode("screen");
	arc.setVisible(true);
}
