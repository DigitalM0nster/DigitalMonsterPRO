import { getSceneCarousel } from "@/three/render/transition/carouselPage.js";
import { resolveSceneId } from "@/three/scenes/resolveSceneId.js";
import { isDomDistortDemoPath } from "@/demos/domDistort/constants.js";
import { store } from "@/store.jsx";

/** Где 3D уже «показал» пользователю (после завершения hex). */
let visualPath =
	typeof window !== "undefined" ? normalizeSitePath(window.location.pathname) : "/";

/** Финальная цель, пока идёт текущий hex (back/forward × N или быстрые клики). */
let pendingPath = null;

/** Back/Forward owns the URL while the visual scene catches up. */
let preserveBrowserUrl = false;

export function normalizeSitePath(path) {
	return String(path ?? "/").replace(/\/+$/, "") || "/";
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

function tryStartHex(from, to) {
	if (!canHexBetween(from, to)) {
		return false;
	}

	const sourceId = resolveSceneId(from);
	const targetId = resolveSceneId(to);
	const started = getSceneCarousel().startHexNavigation(from, to, sourceId, targetId);
	return started;
}

/**
 * Любой переход по сайту: hex-mix source → target, navigate в конце.
 * Пока hex идёт — только обновляем pendingPath (финальная цель).
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
	const from = normalizeSitePath(
		visualPath ?? fromPath ?? (typeof window !== "undefined" ? window.location.pathname : "/"),
	);
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
		// The URL always represents the latest user intent. The rendered route
		// remains on visualPath until the current hex frame has completed.
		preserveBrowserUrl = true;
		publishRequestedUrl();
		return true;
	}

	if (from === to) {
		return false;
	}

	if (!canHexBetween(from, to)) {
		return false;
	}

	const started = tryStartHex(from, to);
	if (started) {
		pendingPath = to;
		preserveBrowserUrl = true;
		publishRequestedUrl();
	}

	return started;
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

/** Запускает queued-переход только после снятия awaitingRoute предыдущего hex. */
export function handleHexNavigationRouteConfirmed(arrivedPath) {
	const arrived = normalizeSitePath(arrivedPath);
	visualPath = arrived;

	// `pendingPath` is always the most recent click. Intermediate clicks are
	// intentionally discarded; after the completed route is confirmed we either
	// stop on it or start one new hex transition to the latest requested route.
	const target = pendingPath ? normalizeSitePath(pendingPath) : arrived;
	const needsChain = target !== arrived && canHexBetween(arrived, target);

	if (needsChain) {
		pendingPath = target;
		if (tryStartHex(arrived, target)) {
			return;
		}
	}

	pendingPath = null;
	if (target !== arrived) {
		publishVisualPath(target);
	}
	preserveBrowserUrl = false;
}
