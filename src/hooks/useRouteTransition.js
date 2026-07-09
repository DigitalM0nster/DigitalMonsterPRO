import { useCallback, useEffect, useRef, useState } from "react";
import { ROUTE_TRANSITION_ENTER_MS, ROUTE_TRANSITION_EXIT_MS } from "../config/routeTransition.js";
import { resolvePortfolioEnterSound, resolvePortfolioLeaveSound } from "@/three/scenes/portfolio/hub/projectsData.js";
import { playPortfolioRouteEnterSound, playPortfolioRouteLeaveSound } from "@/sounds/soundDesign.js";
import { shouldDeferHtmlRouteTransition } from "@/utils/hexNavigation.js";

/** @typedef {'idle' | 'exiting' | 'entering'} RouteTransitionPhase */

/**
 * URL (location.pathname) обновляется сразу при navigate.
 * displayPathname и phase — что на экране и анимация.
 * При быстрых кликах (главная → портфолио → главная) отменяем устаревшие таймеры.
 */
export function useRouteTransition(location) {
	const pathname = location.pathname;
	const [displayPathname, setDisplayPathname] = useState(pathname);
	const [phase, setPhase] = useState(/** @type {RouteTransitionPhase} */ ("idle"));
	const exitTimerRef = useRef(null);
	const enterTimerRef = useRef(null);
	const generationRef = useRef(0);

	const clearTransitionTimers = useCallback(() => {
		if (exitTimerRef.current) {
			clearTimeout(exitTimerRef.current);
			exitTimerRef.current = null;
		}
		if (enterTimerRef.current) {
			clearTimeout(enterTimerRef.current);
			enterTimerRef.current = null;
		}
	}, []);

	useEffect(() => {
		// Вернулись на URL, который уже показан — сброс «застрявшего» exit/enter
		if (pathname === displayPathname) {
			if (phase !== "idle") {
				generationRef.current += 1;
				clearTransitionTimers();
				setPhase("idle");
			}
			return;
		}

		// Между разными 3D-сценами ведёт hex — display догонит после анимации
		if (shouldDeferHtmlRouteTransition(pathname, displayPathname)) {
			return;
		}

		const generation = ++generationRef.current;
		clearTransitionTimers();

		const leaveSound = resolvePortfolioLeaveSound(displayPathname, pathname);
		if (leaveSound) {
			playPortfolioRouteLeaveSound(leaveSound);
		}

		setPhase("exiting");

		exitTimerRef.current = setTimeout(() => {
			if (generationRef.current !== generation) {
				return;
			}
			const enterSound = resolvePortfolioEnterSound(displayPathname, pathname);
			setDisplayPathname(pathname);
			setPhase("entering");
			if (enterSound) {
				playPortfolioRouteEnterSound(enterSound);
			}

			enterTimerRef.current = setTimeout(() => {
				if (generationRef.current !== generation) {
					return;
				}
				setPhase("idle");
			}, ROUTE_TRANSITION_ENTER_MS);
		}, ROUTE_TRANSITION_EXIT_MS);

		return clearTransitionTimers;
	}, [pathname, displayPathname, phase, clearTransitionTimers]);

	return {
		displayPathname,
		phase,
		isTransitioning: phase !== "idle",
		setDisplayPathname,
	};
}
