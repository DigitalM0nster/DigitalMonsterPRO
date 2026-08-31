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
import {
	getArcGlowCenterAngleRad,
	stickArcGlowToAngle,
} from "@/components/SiteArc/siteArcGlowMotion.js";
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
import { setSiteArcFocusFromScroll } from "@/components/SiteArc/siteArcFocusMotion.js";
import { resolveSiteArcCarouselMotion } from "@/components/SiteArc/siteArcCarouselMotion.js";
import { getSceneCarousel } from "@/three/render/transition/carouselPage.js";
import { isSiteArcSessionActive } from "@/components/SiteArc/siteArcSession.js";
import { isSiteArcNavigationActive } from "@/components/SiteArc/siteArcNavigationSource.js";
import { SiteArcMesh } from "./SiteArcMesh.js";
import { SITE_ARC_MAX_NODES } from "./siteArcShader.js";
import {
	resolveSiteArcCapabilityStagePosition,
	resolveSiteArcCapabilityStages,
} from "@/components/SiteArc/siteArcCapabilityStages.js";
import {
	CAPABILITIES,
	getCapabilityBySceneId,
} from "@/pages/capabilities/data/capabilities.js";

const DEG = Math.PI / 180;

function resolveSiteScrollGlowAngle(labelPositions, carouselMotion, fallbackAngle) {
	if (!carouselMotion) {
		return fallbackAngle;
	}
	const fromAngle = labelPositions[carouselMotion.currentIndex]?.angle;
	const toAngle = labelPositions[carouselMotion.targetIndex]?.angle;
	if (!Number.isFinite(fromAngle) || !Number.isFinite(toAngle)) {
		return fallbackAngle;
	}

	const angle = fromAngle + (toAngle - fromAngle) * carouselMotion.segmentProgress;
	stickArcGlowToAngle(angle);
	return angle;
}

function resolveCapabilitiesGlowAngle(capabilitiesLayout, labelPositions, carousel, fallbackAngle) {
	const currentCapability = getCapabilityBySceneId(carousel?.currentId);
	if (
		!currentCapability
		|| capabilitiesLayout.stageAngles.length === 0
		|| carousel?.isHexNavigationActive?.()
	) {
		return fallbackAngle;
	}
	const currentStageIndex = Math.max(
		0,
		CAPABILITIES.findIndex((capability) => capability.sceneId === currentCapability.sceneId),
	);
	const currentAngle = capabilitiesLayout.stageAngles[currentStageIndex]
		?? capabilitiesLayout.stageAngles[0];
	const routeProgress = Math.max(-1, Math.min(1, Number(carousel.progress) || 0));
	if (Math.abs(routeProgress) <= 0.0001) {
		stickArcGlowToAngle(currentAngle);
		return currentAngle;
	}

	const targetSceneId = routeProgress < 0 ? carousel.previousId : carousel.nextId;
	const targetCapability = getCapabilityBySceneId(targetSceneId);
	let targetAngle;
	if (targetCapability) {
		const targetStageIndex = Math.max(
			0,
			CAPABILITIES.findIndex((capability) => capability.sceneId === targetCapability.sceneId),
		);
		targetAngle = capabilitiesLayout.stageAngles[targetStageIndex] ?? currentAngle;
	} else if (routeProgress < 0) {
		targetAngle = labelPositions[capabilitiesLayout.capabilitiesIndex - 1]?.angle ?? currentAngle;
	} else {
		const aboutIndex = labelPositions.findIndex(
			(_, index) => index > capabilitiesLayout.capabilitiesIndex,
		);
		targetAngle = labelPositions[aboutIndex]?.angle ?? currentAngle;
	}
	const angle = currentAngle + (targetAngle - currentAngle) * Math.abs(routeProgress);
	stickArcGlowToAngle(angle);
	return angle;
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
	const carouselMotion = resolveSiteArcCarouselMotion(navStates, ringGapDeg);
	if (carouselMotion) {
		setSiteArcFocusFromScroll(carouselMotion.focusDeg, ringPeriodDeg);
	}
	const focusDeg = carouselMotion?.focusDeg ?? siteArcRuntime.focusRotationDeg
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

	const capabilitiesLayout = resolveSiteArcCapabilityStages(navStates, {
		focusDeg,
		ringGapDeg,
		rotationRad: arcGeo.rotationRad,
	});
	const navItemAngles = capabilitiesLayout.routeAngles;
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
	const lineCutoutAngles = [
		...navItemAngles.filter((_, index) => inWedgeMask[index]),
		...capabilitiesLayout.extraNodes.map((node) => node.angle),
	];
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
	const capabilityStageProgress = Math.max(0, Math.min(
		capabilitiesLayout.stageAngles.length - 1,
		resolveSiteArcCapabilityStagePosition(
			carousel,
			Number(store.capabilitiesExperience?.stagePosition) || 0,
		),
	));
	const activeAngle = activeNavIndex === capabilitiesLayout.capabilitiesIndex
		&& capabilitiesLayout.stageAngles.length > 0
		? capabilitiesLayout.stageAngles[0]
			+ (capabilitiesLayout.stageAngles[1] - capabilitiesLayout.stageAngles[0])
			* capabilityStageProgress
		: activeNavIndex >= 0 ? labelPositions[activeNavIndex]?.angle : null;
	if (!carouselMotion) {
		syncSiteArcSelectSequence({
			activeIndex: activeNavIndex,
			ringGapDeg,
			ringPeriodDeg,
			activeAngleRad: activeAngle,
		});
	}

	let glowCenterAngleRad = resolveSiteScrollGlowAngle(
		labelPositions,
		carouselMotion,
		getArcGlowCenterAngleRad(),
	);
	glowCenterAngleRad = resolveCapabilitiesGlowAngle(
		capabilitiesLayout,
		labelPositions,
		carousel,
		glowCenterAngleRad,
	);
	const glowStrength = 1;
	const cfg = siteArcConfig;
	const introOpacity = Math.max(0, Math.min(1, siteArcRuntime.introOpacity ?? 1));

	const nodeAngles = [];
	const nodeHighlights = [];
	const nodeRadiusScales = [];
	const nodeOpacities = [];
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
		// Glow proximity owns brightness so the old circle fades while the next
		// one brightens. A hard active boost caused a one-frame hand-off at commit.
		nodeHighlights.push(hl);
		nodeRadiusScales.push(capabilitiesLayout.routeRadiusScales[i] ?? 1);
		nodeOpacities.push(1);
	}
	for (const node of capabilitiesLayout.extraNodes) {
		if (nodeAngles.length >= SITE_ARC_MAX_NODES) break;
		if (node.angle < angleStart || node.angle > angleEnd) continue;
		nodeAngles.push(node.angle);
		nodeHighlights.push(
			glowCenterAngleRad != null
				? getNodeArcGlowHighlight(node.angle, glowCenterAngleRad, cfg, glowStrength)
				: 0,
		);
		nodeRadiusScales.push(node.radiusScale);
		nodeOpacities.push(node.opacity);
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
		nodeRadiusScales,
		nodeOpacities,
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
