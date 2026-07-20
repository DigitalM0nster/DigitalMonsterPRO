import { getSceneCarousel } from "@/three/render/transition/carouselPage.js";
import { resolveSceneId } from "@/three/scenes/resolveSceneId.js";
import { isDomDistortDemoPath } from "@/demos/domDistort/constants.js";
import {
	isCaseEnterFromAnotherCase as intentIsCaseEnterFromAnotherCase,
	isCaseLeavingToNonCase as intentIsCaseLeavingToNonCase,
	isPortfolioCasePath,
	normalizeSiteTransitionPath,
	noteSiteTransitionPaths,
	publishSiteRouteTransition,
} from "@/three/render/transition/siteTransitionIntent.js";
import { store } from "@/store.jsx";
import { releaseCasePanelHud } from "@/portfolio/core/casePanelHudReveal.js";

/** @see SITE_TRANSITION.md — flags live in siteTransitionIntent. */
export function noteCaseEnterSourcePaths(fromPath, toPath) {
	noteSiteTransitionPaths(fromPath, toPath);
}

/** @see SITE_TRANSITION.md */
export function noteCaseLeaveDestinationPaths(fromPath, toPath) {
	noteSiteTransitionPaths(fromPath, toPath);
}

/** @returns {boolean} case→case enter (snake titles only); false → orbit arc intro */
export function isCaseEnterFromAnotherCase() {
	return intentIsCaseEnterFromAnotherCase();
}

/** @returns {boolean} leave-site (full mosaic + arc orbit out); false → case→case keep chrome */
export function isCaseLeavingToNonCase() {
	return intentIsCaseLeavingToNonCase();
}

/** Где 3D уже «показал» пользователю (после завершения hex). */
let visualPath = typeof window !== "undefined" ? normalizeSitePath(window.location.pathname) : "/";

/** Финальная цель, пока идёт текущий hex (back/forward × N или быстрые клики). */
let pendingPath = null;

/** Back/Forward owns the URL while the visual scene catches up. */
let preserveBrowserUrl = false;

export function normalizeSitePath(path) {
	return normalizeSiteTransitionPath(path);
}

export function getHexPendingPath() {
	return pendingPath;
}

export function getHexVisualPath() {
	return visualPath;
}

export function setHexVisualPath(path) {
	visualPath = normalizeSitePath(path);
}

function canHexBetween(from, to) {
	if (isDomDistortDemoPath(from) || isDomDistortDemoPath(to)) {
		return false;
	}

	const sourceId = resolveSceneId(from);
	const targetId = resolveSceneId(to);
	return sourceId !== targetId;
}

function tryStartNavigation(from, to) {
	if (isDomDistortDemoPath(from) || isDomDistortDemoPath(to)) {
		return false;
	}
	const sourceId = resolveSceneId(from);
	const targetId = resolveSceneId(to);
	return getSceneCarousel().startHexNavigation(from, to, sourceId, targetId);
}

/**
 * Любой переход по сайту: hex-mix source → target, navigate в конце.
 * Leave decision + chrome → publishSiteRouteTransition (SITE_TRANSITION.md).
 * @param {string} targetPath
 * @param {string} [fromPath]
 * @returns {boolean} true — hex обработает (сейчас или после текущего)
 */
export function requestHexNavigation(targetPath, fromPath, options = {}) {
	if (!targetPath || typeof targetPath !== "string") {
		return false;
	}

	const to = normalizeSitePath(targetPath);
	// A rapidly updated browser URL is only the user's latest intent; it is not
	// necessarily the frame currently on screen. Always start from visualPath so
	// URL, HTML and SceneCarousel cannot select different source scenes.
	const from = normalizeSitePath(visualPath ?? fromPath ?? (typeof window !== "undefined" ? window.location.pathname : "/"));
	const carousel = getSceneCarousel();
	const browserUrlAlreadyChanged = options.preserveBrowserUrl === true;

	const publishRequestedUrl = () => {
		if (!browserUrlAlreadyChanged) {
			store.sceneCarouselNavigatePath = to;
		}
	};

	// While an animation is running, even a target equal to the currently
	// displayed scene is meaningful: the active transition may be leaving it.
	if (carousel.isInteractionLocked()) {
		pendingPath = to;
		carousel.retargetNavigation(to, resolveSceneId(to));
		// The URL always represents the latest user intent. The rendered route
		// remains on visualPath until the current hex frame has completed.
		preserveBrowserUrl = true;
		publishRequestedUrl();
		return true;
	}

	const started = tryStartNavigation(from, to);
	if (started) {
		pendingPath = to;
		// A direct rest-to-rest hex owns chrome now. Mid-scroll settle keeps the
		// currently visible pair/chrome and publishes the final leave only at rest.
		if (carousel.isHexNavigationActive()) {
			publishSiteRouteTransition(from, to, { mode: "hex" });
		}
		preserveBrowserUrl = true;
		publishRequestedUrl();
		return true;
	}

	if (from === to) {
		return false;
	}

	if (!canHexBetween(from, to)) {
		// Route still changes (e.g. same scene id) — chrome leave must not wait on React.
		publishSiteRouteTransition(from, to, { mode: "html-fallback" });
		return false;
	}

	// Hex engine refused — still publish leave so HUD/arc animate out.
	publishSiteRouteTransition(from, to, { mode: "html-fallback" });
	return false;
}

function publishVisualPath(path) {
	if (preserveBrowserUrl) {
		store.sceneCarouselDisplayPath = path;
		return;
	}

	store.sceneCarouselNavigatePath = path;
}

/** HTML route-transition не трогаем, пока hex ведёт между разными сценами. */
export function shouldDeferHtmlRouteTransition(pathname, displayPathname) {
	const to = normalizeSitePath(pathname);
	const from = normalizeSitePath(displayPathname);

	if (to === from) {
		return false;
	}

	if (!canHexBetween(from, to)) {
		return false;
	}

	return getSceneCarousel().isInteractionLocked() || pendingPath !== null;
}

/** Вызывается по завершении hex (из SceneCarousel). */
export function handleHexNavigationComplete(arrivedPath) {
	const arrived = normalizeSitePath(arrivedPath);
	visualPath = arrived;
	publishVisualPath(arrived);
	// Do not consume the latest requested route on the animation's final frame.
	// React and SceneManager still have to confirm that this route is actually
	// displayed. Any clicks during that handshake must remain queued as well.
}

export function handleNavigationSettleComplete({ restPath, targetPath, targetReached, hexStarted }) {
	const rest = normalizeSitePath(restPath);
	const target = normalizeSitePath(targetPath);
	if (targetReached) {
		// Same completion state as a confirmed hex route: subsequent navigation
		// must start from the frame that is now actually visible, not the route
		// that was visible before fast-settle began.
		visualPath = rest;
		pendingPath = null;
		preserveBrowserUrl = false;
		return;
	}

	pendingPath = target;
	if (hexStarted) {
		publishSiteRouteTransition(rest, target, { mode: "hex" });
	}
}

export function handleHexNavigationCancelled(path) {
	visualPath = normalizeSitePath(path);
	pendingPath = null;
	preserveBrowserUrl = false;
}

/** Запускает queued-переход только после снятия awaitingRoute предыдущего hex. */
export function handleHexNavigationRouteConfirmed(arrivedPath) {
	const arrived = normalizeSitePath(arrivedPath);
	visualPath = arrived;
	// Route confirmation is the authoritative ownership hand-off. A transient
	// case→case rest can mount its shell while the following case→site hex is
	// already running; normalize the case HUD/runtime only after the non-case
	// target is actually confirmed so that late mount effects cannot re-lock it.
	if (!isPortfolioCasePath(arrived)) {
		releaseCasePanelHud();
	}

	// `pendingPath` is always the most recent click. Intermediate clicks are
	// intentionally discarded; after the completed route is confirmed we either
	// stop on it or start one new hex transition to the latest requested route.
	const target = pendingPath ? normalizeSitePath(pendingPath) : arrived;
	const needsChain = target !== arrived && canHexBetween(arrived, target);

	if (needsChain) {
		pendingPath = target;
		if (tryStartNavigation(arrived, target)) {
			publishSiteRouteTransition(arrived, target, { mode: "hex" });
			return;
		}
	}

	pendingPath = null;
	if (target !== arrived) {
		publishVisualPath(target);
	}
	preserveBrowserUrl = false;
}

// Re-export for callers that classified paths via hexNavigation.
export { isPortfolioCasePath };
