/**
 * Длительность фазы «уход» старого роута (HTML + Canvas), мс.
 * Только для click-навигации (hub→case, меню без hex-defer и т.п.).
 * Scroll-commit карусели пропускает exit (`store.sceneCarouselSkipHtmlExit`).
 */
export const ROUTE_TRANSITION_EXIT_MS = 500;

/** Длительность фазы «появление» нового роута (HTML + Canvas), мс */
export const ROUTE_TRANSITION_ENTER_MS = 500;

/** Каскад HTML: utils/routeStagger.js (CSS + glitch), scopes: utils/routeGlitchConfig.js */

export const ROUTE_TRANSITION_TOTAL_MS =
	ROUTE_TRANSITION_EXIT_MS + ROUTE_TRANSITION_ENTER_MS;

/** Пик силы distortion-шейдера при смене роута (0–1) */
export const ROUTE_TRANSITION_DISTORT_PEAK = 0.32;
