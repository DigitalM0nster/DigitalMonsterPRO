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
 *   (phase entering + enterReady; first paint(s) stay `hidden` until enterReady)
 * - active — страница на экране, progress ≈ 0
 * - removing + remove — начался скролл карусели (progress > 0); contacts keeps `active`
 *   and leaves via left-panel `active`/`inactive` (±0.1) instead
 * - hex click: most pages stay `active` until displayPathname swaps; contacts → `leaving`
 *   immediately so the heavy left panel exits during the wipe (not over it)
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

	// First paint(s) of enter must stay `hidden` so CSS can transition into activating.
	// (Carousel skipHtmlExit jumps idle→entering while enterReady is still true from idle —
	// MainContent forces enterReady false, then double-rAF true.)
	if (isRouteEntering && !enterReady) {
		return ["hidden"];
	}

	// Menu click = full-screen hex wipe. Light pages stay `active` until the
	// final displayPathname swap. Contacts is different: its left panel is a
	// dense glitch/form DOM tree. Keeping it `active` composites that tree over
	// dual-scene hex for the whole wipe (click FPS hitch). Scroll already exits
	// via panel inactive at ±0.1 — start the same clip leave at hex lock.
	if (hexNavigationActive) {
		if (section === "contacts") {
			return ["leaving"];
		}
		return ["active"];
	}

	const useScrollState = isCarouselRoutePage(displayPathname);
	const atRest = carouselProgress <= CAROUSEL_PROGRESS_COMMIT_EPS;

	if (useScrollState && !atRest) {
		// Contacts left panel owns scroll leave via panel active/inactive (±0.1).
		// Do not flip the page to removing here — that would hide the panel at eps.
		if (section === "contacts") {
			return ["active"];
		}
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
