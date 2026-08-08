/**
 * Shared arc layout for WebGL track + DOM labels (no Canvas2D).
 */
import { store } from "@/app/store.jsx";
import { getProjectBySlug } from "@/pages/portfolio/core/projectRegistry.js";
import {
	siteArcConfig,
	siteArcInternals,
	siteArcRuntime,
	resolveNodeMarkerRadii,
} from "./siteArcConfig.js";
import {
	getSiteArcStepPositionsFromAngles,
	resolveSiteArcGeometry,
} from "./siteArcGeometry.js";
import { getCyclicItemRelativeDeg } from "./siteArcCycle.js";
import {
	getArcLineCutoutHalfRad,
	getArcSegmentOpacity,
	resolveArcFadeBounds,
} from "./siteArcOpacity.js";
import {
	resolveSiteArcProjectItems,
	syncSiteArcPreviewNavigation,
} from "./siteArcProjects.js";
import { syncSiteArcSelectSequence } from "./siteArcSelectSequence.js";
import { getSiteArcShift, setSiteArcShiftTarget } from "./siteArcPositionMotion.js";
import { setSiteArcFocusFromScroll } from "./siteArcFocusMotion.js";
import { resolveSiteArcCarouselMotion } from "./siteArcCarouselMotion.js";
import { getSceneCarousel } from "@/three/render/transition/carouselPage.js";

const DEG = Math.PI / 180;
const INDEX_FONT_PX = 10;
const TITLE_FONT_PX = 9;
const TITLE_LINE_H = TITLE_FONT_PX * 1.15;
/**
 * Gap used like caseStudyCanvasDraw / labelStackGap:
 * num at -stackGap/2 - indexFont, title at +stackGap/2.
 */
const STACK_GAP = 8;
/** Min vertical gap between label block centers before one is culled. */
const LABEL_COLLISION_PAD = 6;

/**
 * Wrap title into at most 2 lines (word split).
 * @param {string} title
 * @param {number} maxCharsPerLine
 */
function wrapTitleLines(title, maxCharsPerLine = 12) {
	const words = String(title ?? "").toUpperCase().split(/\s+/).filter(Boolean);
	if (words.length === 0) {
		return [""];
	}
	if (words.length === 1) {
		return [words[0]];
	}
	const lines = [];
	let current = words[0];
	for (let i = 1; i < words.length; i += 1) {
		const candidate = `${current} ${words[i]}`;
		if (candidate.length <= maxCharsPerLine || current.length === 0) {
			current = candidate;
		} else {
			lines.push(current);
			current = words[i];
			if (lines.length >= 1) {
				// Remaining words on last line.
				current = [current, ...words.slice(i + 1)].join(" ");
				break;
			}
		}
	}
	if (current) {
		lines.push(current);
	}
	return lines.slice(0, 2);
}

/**
 * Drop weaker labels when blocks would overlap on Y.
 * @param {Array<object | null>} slots
 */
function cullOverlappingLabelSlots(slots) {
	/** @type {Array<{ index: number, item: object }>} */
	const live = [];
	for (let i = 0; i < slots.length; i += 1) {
		const item = slots[i];
		if (item && item.opacity >= 0.02) {
			live.push({ index: i, item });
		}
	}
	live.sort((a, b) => a.item.y - b.item.y);

	/** @type {Set<number>} */
	const culled = new Set();
	for (let i = 0; i < live.length; i += 1) {
		if (culled.has(live[i].index)) {
			continue;
		}
		for (let j = i + 1; j < live.length; j += 1) {
			if (culled.has(live[j].index)) {
				continue;
			}
			const a = live[i].item;
			const b = live[j].item;
			const minGap = (a.blockH + b.blockH) * 0.5 + LABEL_COLLISION_PAD;
			if (b.y - a.y >= minGap) {
				break;
			}
			// Prefer active, then higher opacity, then closer to focus (already higher op usually).
			let dropIndex = live[j].index;
			if (b.isActive && !a.isActive) {
				dropIndex = live[i].index;
			} else if (a.isActive && !b.isActive) {
				dropIndex = live[j].index;
			} else if (b.opacity > a.opacity + 0.04) {
				dropIndex = live[i].index;
			} else if (a.opacity > b.opacity + 0.04) {
				dropIndex = live[j].index;
			}
			culled.add(dropIndex);
			if (dropIndex === live[i].index) {
				break;
			}
		}
	}

	if (culled.size === 0) {
		return slots;
	}
	return slots.map((item, index) => {
		if (!item || !culled.has(index)) {
			return item;
		}
		return null;
	});
}

/**
 * @param {number} viewportW
 * @param {number} viewportH
 * @param {boolean} [isMobile]
 */
export function buildSiteArcNavLayout(viewportW, viewportH, isMobile = false) {
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
	const introOpacity = Math.max(0, Math.min(1, siteArcRuntime.introOpacity ?? 1));

	const arcGeo = resolveSiteArcGeometry(
		viewportW,
		viewportH,
		Math.min(navStates.length, internal.maxNavItems ?? 5),
		isMobile,
		{ top: 0, bottom: viewportH },
	);
	let { centerX } = arcGeo;
	const { centerY, radius, angleStart, angleEnd } = arcGeo;

	const navItemAngles = navStates.map((_, index) => (
		getCyclicItemRelativeDeg(index, focusDeg, ringGapDeg, navStates.length) * DEG + arcGeo.rotationRad
	));

	const labelGap = isMobile ? 10 : internal.labelGapRight;
	const wedgePadDeg = 6;
	const inWedgeMask = navStates.map((_, index) => (
		Math.abs(getCyclicItemRelativeDeg(index, focusDeg, ringGapDeg, navStates.length))
		<= internal.fadeEndDeg + wedgePadDeg
	));

	// Keep the orbit's rightmost marker against the viewport edge. This target
	// is focus-independent, so node rotation cannot leave a stale horizontal shift.
	const viewportRightInset = internal.viewportRightInset ?? 20;
	const orbitMarkerOuterR = resolveNodeMarkerRadii(internal, isMobile).outer;
	const orbitOverflow = Math.max(
		0,
		centerX + radius + orbitMarkerOuterR - (viewportW - viewportRightInset),
	);
	setSiteArcShiftTarget(orbitOverflow);
	centerX -= getSiteArcShift();

	const labelPositions = getSiteArcStepPositionsFromAngles(
		navItemAngles,
		centerX,
		centerY,
		radius,
	);
	const { outer: markerOuterR } = resolveNodeMarkerRadii(internal, isMobile);
	const lineCutoutAngles = navItemAngles.filter((_, index) => inWedgeMask[index]);
	const lineCutoutHalfRad = getArcLineCutoutHalfRad(markerOuterR, radius, internal.trackWidth);
	const fadeBounds = resolveArcFadeBounds(
		angleStart,
		angleEnd,
		lineCutoutAngles,
		lineCutoutHalfRad,
	);

	const activeNavIndex = arcProjects.activeNavIndex;
	const activeAngle = activeNavIndex >= 0 ? labelPositions[activeNavIndex]?.angle : null;
	if (!carouselMotion) {
		syncSiteArcSelectSequence({
			activeIndex: activeNavIndex,
			ringGapDeg,
			ringPeriodDeg,
			activeAngleRad: activeAngle,
		});
	}

	// Stable index = navStates index (not compacted). DomNav slots stay 1:1 with projects.
	/** @type {Array<object | null>} */
	const slots = navStates.map((state, index) => {
		const pos = labelPositions[index];
		if (!pos || !inWedgeMask[index]) {
			return null;
		}
		const opacity = getArcSegmentOpacity(pos.angle, pos.x, viewportW, fadeBounds) * introOpacity;
		if (opacity < 0.02) {
			return null;
		}
		const titleLines = wrapTitleLines(state.title ?? "", isMobile ? 10 : 12);
		// Absolute layout span: num above + gap + title lines below node.
		const blockH = INDEX_FONT_PX + STACK_GAP + TITLE_LINE_H * Math.max(1, titleLines.length);
		const chapterNum = state.routeNumber
			?? String((state.registryIndex ?? index) + 1).padStart(2, "0");
		return {
			id: state.id,
			route: state.route,
			title: state.title ?? "",
			titleLines,
			chapterNum,
			x: pos.x,
			y: pos.y,
			angle: pos.angle,
			opacity,
			isActive: index === activeNavIndex,
			nodeRadius: markerOuterR,
			labelGap,
			blockH,
			navIndex: index,
		};
	});

	const items = cullOverlappingLabelSlots(slots);

	return {
		viewportW,
		viewportH,
		centerX,
		centerY,
		radius,
		introOpacity,
		activeColor: siteArcConfig.activeColor,
		inactiveTextOpacity: siteArcConfig.inactiveTextOpacity,
		/** @deprecated use items — kept as alias for callers expecting compacted list */
		items,
		indexFontPx: INDEX_FONT_PX,
		titleFontPx: TITLE_FONT_PX,
		stackGap: STACK_GAP,
	};
}
