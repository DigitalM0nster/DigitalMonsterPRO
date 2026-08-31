import { getSceneCarousel } from "@/three/render/transition/carouselPage.js";
import { store } from "@/app/store.jsx";
import { getSiteArcNavigationSource } from "./siteArcNavigationSource.js";
import { getSiteArcPreviewProjectId } from "./siteArcProjects.js";
import { siteArcRuntime } from "./siteArcConfig.js";
import { shortestDegDelta } from "./siteArcCycle.js";
import { isCapabilitySceneId } from "@/pages/capabilities/data/capabilities.js";

const CAROUSEL_SCENE_TO_SITE_ARC_ID = {
	home: "main",
	portfolioHub: "portfolio",
	about: "about",
	contacts: "contacts",
};

function carouselSceneToSiteArcId(sceneId) {
	if (isCapabilitySceneId(sceneId)) return "capabilities";
	return CAROUSEL_SCENE_TO_SITE_ARC_ID[sceneId] ?? null;
}

const ARC_SCROLL_FOLLOW_RATIO = 0.5;
const PROGRESS_EPSILON = 0.0001;
const COMMIT_FOCUS_EPSILON_DEG = 0.04;
const COMMIT_FOCUS_RESPONSE = 5 / 1.2;

let lastCarouselCurrentId = null;
let commitFocusDeg = null;
let commitFocusUpdatedAt = 0;

function beginCommitFocusHandoff(currentId) {
	lastCarouselCurrentId = currentId;
	commitFocusDeg = Number.isFinite(siteArcRuntime.focusRotationDeg)
		? siteArcRuntime.focusRotationDeg
		: null;
	commitFocusUpdatedAt = typeof performance !== "undefined" ? performance.now() : 0;
}

function resolveCommitFocus(rawFocusDeg, ringPeriodDeg) {
	if (commitFocusDeg == null) {
		return rawFocusDeg;
	}
	const now = typeof performance !== "undefined" ? performance.now() : commitFocusUpdatedAt;
	const deltaSeconds = Math.max(0, Math.min(0.05, (now - commitFocusUpdatedAt) / 1000));
	commitFocusUpdatedAt = now;
	const continuousTarget = commitFocusDeg
		+ shortestDegDelta(commitFocusDeg, rawFocusDeg, ringPeriodDeg);
	const blend = 1 - Math.exp(-deltaSeconds * COMMIT_FOCUS_RESPONSE);
	commitFocusDeg += (continuousTarget - commitFocusDeg) * blend;
	if (Math.abs(continuousTarget - commitFocusDeg) <= COMMIT_FOCUS_EPSILON_DEG) {
		commitFocusDeg = null;
		return continuousTarget;
	}
	return commitFocusDeg;
}

function resolveInternalStoryMotion(carousel) {
	if (carousel?.currentId === "about") {
		return {
			progress: Number(store.aboutExperience?.progress) || 0,
			target: Number(store.aboutExperience?.progressTarget) || 0,
		};
	}
	return null;
}

/**
 * Ordinary ring-scroll motion for the persistent site arc.
 * The glow travels between route nodes while the node ring follows half of the
 * same segment. The remaining half is completed by focus motion after commit.
 *
 * @param {Array<{ id: string }>} navStates
 * @param {number} ringGapDeg
 */
export function resolveSiteArcCarouselMotion(navStates, ringGapDeg) {
	const source = getSiteArcNavigationSource();
	if (source?.key !== "site" || navStates.length < 2 || !(ringGapDeg > 0)) {
		return null;
	}

	const carousel = getSceneCarousel();
	const carouselCurrentId = carousel?.currentId ?? null;
	if (lastCarouselCurrentId == null) {
		lastCarouselCurrentId = carouselCurrentId;
	} else if (carouselCurrentId && carouselCurrentId !== lastCarouselCurrentId) {
		// Scroll moves the ring through half a node gap. On commit the focus owner
		// must animate the remaining half. A post-commit wheel overflow used to
		// start the next segment immediately and snap that missing half in one frame.
		if (
			carouselSceneToSiteArcId(carouselCurrentId)
			!== carouselSceneToSiteArcId(lastCarouselCurrentId)
		) {
			beginCommitFocusHandoff(carouselCurrentId);
		} else {
			lastCarouselCurrentId = carouselCurrentId;
		}
	}
	if (
		getSiteArcPreviewProjectId() != null
		|| carousel?.isHexNavigationActive?.()
		|| carousel?.isCaseBoundaryDrive?.()
	) {
		return null;
	}

	const currentId = carouselSceneToSiteArcId(carouselCurrentId) ?? source.activeId;
	const currentIndex = navStates.findIndex((item) => item.id === currentId);
	if (currentIndex < 0) {
		return null;
	}

	const progress = Math.max(-1, Math.min(1, Number(carousel?.progress) || 0));
	const internal = resolveInternalStoryMotion(carousel);
	const targetSceneId = progress < 0 ? carousel?.previousId : carousel?.nextId;
	const targetSiteId = carouselSceneToSiteArcId(targetSceneId);
	const staysInsideSiteGroup = Math.abs(progress) >= PROGRESS_EPSILON
		&& targetSiteId === currentId;
	let direction;
	let segmentProgress;
	let focusSegmentProgress;
	if (staysInsideSiteGroup) {
		direction = 0;
		segmentProgress = Math.abs(progress);
		focusSegmentProgress = 0;
	} else if (progress < -PROGRESS_EPSILON) {
		// Backward route edge starts at story 0 and follows the previous node.
		direction = -1;
		segmentProgress = Math.abs(progress);
		focusSegmentProgress = segmentProgress;
	} else if (progress > PROGRESS_EPSILON && internal) {
		// About's internal story already moved the orbit through the first half of
		// the route gap. Its final boundary drives the remaining half.
		direction = 1;
		segmentProgress = progress;
		focusSegmentProgress = 1 + progress;
	} else if (Math.abs(progress) >= PROGRESS_EPSILON) {
		direction = progress > 0 ? 1 : -1;
		segmentProgress = Math.abs(progress);
		focusSegmentProgress = segmentProgress;
	} else if (internal && internal.progress > PROGRESS_EPSILON) {
		direction = 1;
		segmentProgress = internal.progress;
		focusSegmentProgress = segmentProgress;
	} else if (commitFocusDeg != null) {
		direction = 0;
		segmentProgress = 0;
		focusSegmentProgress = 0;
	} else {
		return null;
	}

	const targetIndex = staysInsideSiteGroup
		? currentIndex
		: (currentIndex + direction + navStates.length) % navStates.length;
	const rawFocusDeg = currentIndex * ringGapDeg
		+ direction * ringGapDeg * focusSegmentProgress * ARC_SCROLL_FOLLOW_RATIO;
	const focusDeg = resolveCommitFocus(
		rawFocusDeg,
		navStates.length * ringGapDeg,
	);

	return {
		currentIndex,
		targetIndex,
		segmentProgress,
		focusDeg,
	};
}

export function isSiteArcCarouselMotionActive() {
	const source = getSiteArcNavigationSource();
	const carousel = getSceneCarousel();
	const internal = resolveInternalStoryMotion(carousel);
	return Boolean(
		source?.key === "site"
		&& (
			commitFocusDeg != null
			||
			Math.abs(Number(carousel?.progress) || 0) >= PROGRESS_EPSILON
			|| (internal && Math.abs(internal.progress - internal.target) >= PROGRESS_EPSILON)
		)
		&& !getSiteArcPreviewProjectId()
		&& !carousel?.isHexNavigationActive?.()
		&& !carousel?.isCaseBoundaryDrive?.(),
	);
}
