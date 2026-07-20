import { store } from "@/store.jsx";
import { attachCarouselScroll } from "./carouselScroll.js";
import {
	isCarouselRoutePage,
	pageToCarouselSceneId,
	SCENE_ID_TO_PAGE,
	SceneCarousel,
} from "./SceneCarousel.js";
import { sceneIdToPage } from "@/three/scenes/portfolio/hub/projectsData.js";
import { handleHexNavigationComplete, handleHexNavigationRouteConfirmed } from "@/utils/hexNavigation.js";
import { armAboutPanelHudForRoute } from "@/about/aboutPanelHudStory.js";
import { startAboutExperienceRuntime } from "@/about/aboutExperienceRuntime.js";

const carousel = new SceneCarousel();

function pathForSceneId(sceneId) {
	return sceneIdToPage(sceneId) ?? SCENE_ID_TO_PAGE[sceneId] ?? null;
}

carousel.setOnHexNavigate(({ path }) => {
	if (!path) {
		return;
	}
	handleHexNavigationComplete(path);
});

carousel.setOnHexRouteConfirmed(({ path }) => {
	if (!path) {
		return;
	}
	handleHexNavigationRouteConfirmed(path);
});

carousel.setOnCommit(({ fromId, toId, direction, boundaryOverflowProgress }) => {
	const path = pathForSceneId(toId);
	if (!path) {
		return;
	}
	store.sceneCarouselLastCommitFromId = fromId;
	store.sceneCarouselLastCommitDirection = direction;
	store.sceneCarouselLastCommitBoundaryOverflow = boundaryOverflowProgress;
	/**
	 * Publish currentId immediately (rAF sync in the Three loop is one frame late).
	 * AboutExperienceHost subscribes and starts wheel ownership in this same turn —
	 * before HtmlRoutes finishes its 500ms displayPathname exit.
	 */
	store.sceneCarouselCurrentId = toId;
	/** Wheel/spring commit only — click navigations must keep HTML exit stagger. */
	store.sceneCarouselSkipHtmlExit = true;
	store.sceneCarouselNavigatePath = path;
	// About: start story runtime in this same turn (before paint) so overflow
	// chase + mixProgress advance immediately. Host subscribe is async backup only.
	// Arm after runtime publish — never arm(0) then rewrite mix after the chase started.
	if (toId === "about") {
		startAboutExperienceRuntime();
		const story = Number(store.aboutExperience?.storyProgress) || 0;
		armAboutPanelHudForRoute(story);
	}
});

let detachCarouselScroll = null;

export function getSceneCarousel() {
	return carousel;
}

/**
 * @param {string} page
 * @param {{ force?: boolean }} [options] force — ignore spring/hex gates (deep-link / Start)
 */
export function syncCarouselFromPage(page, options = {}) {
	if (!isCarouselRoutePage(page)) {
		return;
	}

	const targetId = pageToCarouselSceneId(page);
	// While the browser URL is still /about, ignore non-force syncs that would
	// snap the ring back to home (stale displayPathname "/" after Start).
	if (
		!options.force
		&& carousel.currentId === "about"
		&& targetId !== "about"
		&& typeof location !== "undefined"
		&& (location.pathname.replace(/\/+$/, "") || "/") === "/about"
	) {
		return;
	}

	carousel.syncFromPage(page, options);
}

/** Подключить wheel → progressTarget (один раз при старте THREE). */
export function initCarouselScroll(getCurrentPage) {
	if (detachCarouselScroll) {
		return;
	}

	detachCarouselScroll = attachCarouselScroll({
		getCurrentPage,
		getStore: () => store,
	});
}

export function disposeCarouselScroll() {
	detachCarouselScroll?.();
	detachCarouselScroll = null;
}
