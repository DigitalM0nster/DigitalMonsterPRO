import { createContext, useContext, useEffect, useState } from "react";
import { subscribeKey } from "valtio/utils";
import { store } from "@/app/store.jsx";
import { getPageVisibilityClasses } from "@/functions/pageVisibilityState.js";

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
 * Visibility classes only flip at discrete boundaries (rest ↔ scroll leave,
 * hex lock, route phase). Do NOT React-subscribe to continuous hexShaderProgress —
 * that re-rendered whole pages (Contacts glitch trees) every carousel frame.
 *
 * @param {string} section
 * @returns {string[]}
 */
function usePageVisibilityClasses(section) {
	const { phase, displayPathname, enterReady, scrollRestReactivate } = useRouteTransitionContext();

	const compute = () =>
		getPageVisibilityClasses(section, {
			phase,
			displayPathname,
			enterReady,
			carouselProgress: store.hexShaderProgress ?? 0,
			scrollRestReactivate,
			hexNavigationActive: store.sceneCarouselClickTransitionActive === true,
		});

	const [visibility, setVisibility] = useState(compute);

	useEffect(() => {
		const sync = () => {
			const next = compute();
			setVisibility((prev) => {
				if (prev.length === next.length && prev.every((value, index) => value === next[index])) {
					return prev;
				}
				return next;
			});
		};

		sync();
		const stopProgress = subscribeKey(store, "hexShaderProgress", sync);
		const stopHexLock = subscribeKey(store, "sceneCarouselClickTransitionActive", sync);
		return () => {
			stopProgress();
			stopHexLock();
		};
		// compute closes over route ctx — rebind when those change
	}, [section, phase, displayPathname, enterReady, scrollRestReactivate]);

	return visibility;
}

/**
 * @param {string} section — main | portfolio | about | contacts
 */
export function usePageVisibilityState(section) {
	const visibility = usePageVisibilityClasses(section);
	return visibility[0] ?? "hidden";
}

/** page + section + hidden | activating | active | leaving | removing | remove */
export function usePageStateClasses(section) {
	const visibility = usePageVisibilityClasses(section);
	return ["page", section, ...visibility].join(" ");
}

/** @deprecated используй usePageStateClasses */
export function useRoutePageClasses(section) {
	return usePageStateClasses(section);
}
