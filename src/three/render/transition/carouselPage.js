import { store } from "@/store.jsx";
import { attachCarouselScroll } from "./carouselScroll.js";
import { isCarouselRoutePage, SCENE_ID_TO_PAGE, SceneCarousel } from "./SceneCarousel.js";
import { sceneIdToPage } from "@/three/scenes/portfolio/hub/projectsData.js";
import {
	handleHexNavigationComplete,
	handleHexNavigationRouteConfirmed,
} from "@/utils/hexNavigation.js";

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

carousel.setOnCommit(({ toId }) => {
	const path = pathForSceneId(toId);
	if (!path) {
		return;
	}
	store.sceneCarouselNavigatePath = path;
});

let detachCarouselScroll = null;

export function getSceneCarousel() {
	return carousel;
}

export function syncCarouselFromPage(page) {
	if (!isCarouselRoutePage(page)) {
		return;
	}

	carousel.syncFromPage(page);
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
