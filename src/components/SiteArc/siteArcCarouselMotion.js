import { getSceneCarousel } from "@/three/render/transition/carouselPage.js";
import { store } from "@/app/store.jsx";
import { getSiteArcNavigationSource } from "./siteArcNavigationSource.js";
import { getSiteArcPreviewProjectId } from "./siteArcProjects.js";

const CAROUSEL_SCENE_TO_SITE_ARC_ID = {
	home: "main",
	portfolioHub: "portfolio",
	capabilities: "capabilities",
	about: "about",
	contacts: "contacts",
};

const ARC_SCROLL_FOLLOW_RATIO = 0.5;
const PROGRESS_EPSILON = 0.0001;

function resolveInternalStoryMotion(carousel) {
	if (carousel?.currentId === "about") {
		return {
			progress: Number(store.aboutExperience?.progress) || 0,
			target: Number(store.aboutExperience?.progressTarget) || 0,
		};
	}
	// Capabilities 01 -> 02 is internal. The global route nodes remain fixed
	// until the runtime hands a real route-edge segment to SceneCarousel.
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
	if (
		getSiteArcPreviewProjectId() != null
		|| carousel?.isHexNavigationActive?.()
		|| carousel?.isCaseBoundaryDrive?.()
	) {
		return null;
	}

	const currentId = CAROUSEL_SCENE_TO_SITE_ARC_ID[carousel.currentId] ?? source.activeId;
	const currentIndex = navStates.findIndex((item) => item.id === currentId);
	if (currentIndex < 0) {
		return null;
	}

	const progress = Math.max(-1, Math.min(1, Number(carousel?.progress) || 0));
	const internal = resolveInternalStoryMotion(carousel);
	let direction;
	let segmentProgress;
	if (progress < -PROGRESS_EPSILON) {
		// Backward route edge starts at story 0 and follows the previous node.
		direction = -1;
		segmentProgress = Math.abs(progress);
	} else if (progress > PROGRESS_EPSILON && internal) {
		// The internal story already carried the glow to the next node. Hold it
		// there through the final route segment so the arc never jumps backward.
		direction = 1;
		segmentProgress = 1;
	} else if (Math.abs(progress) >= PROGRESS_EPSILON) {
		direction = progress > 0 ? 1 : -1;
		segmentProgress = Math.abs(progress);
	} else if (internal && internal.progress > PROGRESS_EPSILON) {
		direction = 1;
		segmentProgress = internal.progress;
	} else {
		return null;
	}

	const targetIndex = (currentIndex + direction + navStates.length) % navStates.length;

	return {
		currentIndex,
		targetIndex,
		segmentProgress,
		focusDeg: currentIndex * ringGapDeg
			+ direction * ringGapDeg * segmentProgress * ARC_SCROLL_FOLLOW_RATIO,
	};
}

export function isSiteArcCarouselMotionActive() {
	const source = getSiteArcNavigationSource();
	const carousel = getSceneCarousel();
	const internal = resolveInternalStoryMotion(carousel);
	return Boolean(
		source?.key === "site"
		&& (
			Math.abs(Number(carousel?.progress) || 0) >= PROGRESS_EPSILON
			|| (internal && Math.abs(internal.progress - internal.target) >= PROGRESS_EPSILON)
		)
		&& !getSiteArcPreviewProjectId()
		&& !carousel?.isHexNavigationActive?.()
		&& !carousel?.isCaseBoundaryDrive?.(),
	);
}
