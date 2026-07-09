import { createContext, useContext } from "react";
import { useStore } from "@/store.jsx";
import { getPageVisibilityClasses, getPageVisibilityState } from "../utils/pageVisibilityState.js";

/** @typedef {'idle' | 'exiting' | 'entering'} RouteTransitionPhase */

/** @type {import('react').Context<{ displayPathname: string, phase: RouteTransitionPhase, isTransitioning: boolean, enterReady: boolean, scrollRestReactivate: boolean } | null>} */
const RouteTransitionContext = createContext(null);

export function RouteTransitionProvider({ value, children }) {
	return <RouteTransitionContext.Provider value={value}>{children}</RouteTransitionContext.Provider>;
}

export function useRouteTransitionContext() {
	const ctx = useContext(RouteTransitionContext);
	if (!ctx) {
		throw new Error("useRouteTransitionContext must be used within RouteTransitionProvider");
	}
	return ctx;
}

/**
 * @param {string} section — main | portfolio | about | contacts
 */
export function usePageVisibilityState(section) {
	const { phase, displayPathname, enterReady, scrollRestReactivate } = useRouteTransitionContext();
	const snap = useStore();
	return getPageVisibilityState(section, {
		phase,
		displayPathname,
		enterReady,
		carouselProgress: snap.hexShaderProgress ?? 0,
		scrollRestReactivate,
		hexNavigationActive: snap.sceneCarouselClickTransitionActive === true,
	});
}

/** page + section + hidden | activating | active | leaving | removing | remove */
export function usePageStateClasses(section) {
	const { phase, displayPathname, enterReady, scrollRestReactivate } = useRouteTransitionContext();
	const snap = useStore();
	const visibility = getPageVisibilityClasses(section, {
		phase,
		displayPathname,
		enterReady,
		carouselProgress: snap.hexShaderProgress ?? 0,
		scrollRestReactivate,
		hexNavigationActive: snap.sceneCarouselClickTransitionActive === true,
	});

	return ["page", section, ...visibility].join(" ");
}

/** @deprecated используй usePageStateClasses */
export function useRoutePageClasses(section) {
	return usePageStateClasses(section);
}
