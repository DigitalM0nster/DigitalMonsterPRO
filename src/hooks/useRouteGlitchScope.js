import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { getRouteGlitchCascadeFinishMs } from "@/utils/routeGlitchConfig.js";
import {
	isRouteGlitchScopeActive,
	registerRouteGlitchScope,
	runRouteGlitchStagger,
	unregisterRouteGlitchScope,
} from "@/utils/routeGlitchRegistry.js";

/**
 * Подключает группу GlitchText к enter/exit по URL в строке браузера.
 *
 * @param {{
 *   scope: keyof typeof import('@/utils/routeGlitchConfig.js').ROUTE_GLITCH_SCOPES,
 *   itemCount: number,
 *   itemGlitchRefs: { current: Array<{ playAppear?: (ms?: number) => void, playDisappear?: (ms?: number) => void } | null> },
 *   onEnterComplete?: () => void,
 * }} options
 */
export function useRouteGlitchScope({ scope, itemCount, itemGlitchRefs, onEnterComplete }) {
	const browserPathname = useLocation().pathname;
	const prevBrowserPathRef = useRef(null);
	const onEnterCompleteRef = useRef(onEnterComplete);
	const enterCompleteTimerRef = useRef(null);

	onEnterCompleteRef.current = onEnterComplete;

	const clearEnterCompleteTimer = useCallback(() => {
		if (enterCompleteTimerRef.current) {
			clearTimeout(enterCompleteTimerRef.current);
			enterCompleteTimerRef.current = null;
		}
	}, []);

	const scheduleEnterComplete = useCallback(() => {
		clearEnterCompleteTimer();
		if (!onEnterCompleteRef.current) {
			return;
		}
		const finishMs = getRouteGlitchCascadeFinishMs(scope, "enter", itemCount);
		enterCompleteTimerRef.current = setTimeout(() => {
			enterCompleteTimerRef.current = null;
			onEnterCompleteRef.current?.();
		}, finishMs);
	}, [scope, itemCount, clearEnterCompleteTimer]);

	const playEnter = useCallback(() => {
		runRouteGlitchStagger(scope, "enter", itemGlitchRefs, itemCount);
		scheduleEnterComplete();
	}, [scope, itemCount, itemGlitchRefs, scheduleEnterComplete]);

	const playExit = useCallback(() => {
		clearEnterCompleteTimer();
		runRouteGlitchStagger(scope, "exit", itemGlitchRefs, itemCount);
	}, [scope, itemCount, itemGlitchRefs, clearEnterCompleteTimer]);

	useLayoutEffect(() => {
		const prev = prevBrowserPathRef.current;
		prevBrowserPathRef.current = browserPathname;

		const arrived = isRouteGlitchScopeActive(scope, browserPathname);
		const wasOutside = prev === null || !isRouteGlitchScopeActive(scope, prev);

		if (arrived && wasOutside) {
			playEnter();
		}
	}, [scope, browserPathname, playEnter]);

	useEffect(() => {
		registerRouteGlitchScope(scope, { onEnter: playEnter, onExit: playExit });
		return () => unregisterRouteGlitchScope(scope);
	}, [scope, playEnter, playExit]);

	useEffect(() => clearEnterCompleteTimer, [clearEnterCompleteTimer]);

	return { playEnter, playExit };
}
