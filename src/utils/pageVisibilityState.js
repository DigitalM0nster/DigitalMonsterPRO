import {
	CAROUSEL_PROGRESS_COMMIT_EPS,
	isCarouselRoutePage,
} from "@/three/render/transition/SceneCarousel.js";

const SECTION_MATCHERS = {
	main: (pathname) => pathname === "/" || pathname === "",
	portfolio: (pathname) => pathname.startsWith("/portfolio"),
	about: (pathname) => pathname.startsWith("/about"),
	contacts: (pathname) => pathname === "/contacts" || pathname.startsWith("/contacts/"),
};

/**
 * Классы видимости `.page`:
 * - hidden — не текущий displayPathname
 * - leaving — уход по смене роута (phase exiting)
 * - activating + active — старт enter-анимации или возврат progress → 0
 * - active — страница на экране, progress ≈ 0
 * - removing + remove — начался скролл карусели (progress > 0)
 *
 * @param {string} section — main | portfolio | about | contacts
 * @param {{
 *   phase: 'idle' | 'exiting' | 'entering',
 *   displayPathname: string,
 *   enterReady: boolean,
 *   carouselProgress?: number,
 *   scrollRestReactivate?: boolean,
 *   hexNavigationActive?: boolean,
 * }} ctx
 * @returns {string[]}
 */
export function getPageVisibilityClasses(
	section,
	{ phase, displayPathname, enterReady, carouselProgress = 0, scrollRestReactivate = false, hexNavigationActive = false },
) {
	const match = SECTION_MATCHERS[section];
	if (!match || !match(displayPathname)) {
		return ["hidden"];
	}

	if (phase === "exiting") {
		return ["leaving"];
	}

	const isRouteEntering = phase === "entering";
	const isRouteSettled = phase === "idle" && enterReady;

	if (!isRouteEntering && !isRouteSettled) {
		return ["hidden"];
	}

	// A menu click is only a full-screen hex wipe. Keep the displayed page in
	// its exact active state until displayPathname swaps on the final frame.
	if (hexNavigationActive) {
		return ["active"];
	}

	const useScrollState = isCarouselRoutePage(displayPathname);
	const atRest = carouselProgress <= CAROUSEL_PROGRESS_COMMIT_EPS;

	if (useScrollState && !atRest) {
		return ["removing", "remove"];
	}

	if (isRouteEntering || scrollRestReactivate) {
		return ["activating", "active"];
	}

	return ["active"];
}

/** @deprecated — для обратной совместимости; предпочитай getPageVisibilityClasses */
export function getPageVisibilityState(section, ctx) {
	return getPageVisibilityClasses(section, ctx)[0] ?? "hidden";
}
