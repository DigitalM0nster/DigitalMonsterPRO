import { useCallback, useEffect, useRef, useState } from "react";
import { ROUTE_TRANSITION_ENTER_MS, ROUTE_TRANSITION_EXIT_MS } from "../config/routeTransition.js";
import { resolvePortfolioLeaveSound } from "@/three/scenes/portfolio/hub/projectsData.js";
import { playPortfolioRouteLeaveSound } from "@/sounds/soundDesign.js";
import { shouldDeferHtmlRouteTransition } from "@/utils/hexNavigation.js";
import { store } from "@/store.jsx";

/** @typedef {'idle' | 'exiting' | 'entering'} RouteTransitionPhase */

/**
 * URL (location.pathname) обновляется сразу при navigate.
 * displayPathname и phase — что на экране и анимация.
 * При быстрых кликах (главная → портфолио → главная) отменяем устаревшие таймеры.
 *
 * Scroll-commit карусели (`sceneCarouselSkipHtmlExit`): без EXIT_MS — HTML
 * меняется сразу. Клики (hub→case и т.п.) по-прежнему ждут stagger exit.
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
			store.sceneCarouselSkipHtmlExit = false;
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

		const skipHtmlExit = store.sceneCarouselSkipHtmlExit === true;
		if (skipHtmlExit) {
			store.sceneCarouselSkipHtmlExit = false;
		}

		const beginEnter = () => {
			if (generationRef.current !== generation) {
				return;
			}
			setDisplayPathname(pathname);
			setPhase("entering");

			enterTimerRef.current = setTimeout(() => {
				if (generationRef.current !== generation) {
					return;
				}
				setPhase("idle");
			}, ROUTE_TRANSITION_ENTER_MS);
		};

		if (skipHtmlExit) {
			/** Scroll carousel: 3D already committed — do not hold old HTML for EXIT_MS. */
			beginEnter();
			return clearTransitionTimers;
		}

		const leaveSound = resolvePortfolioLeaveSound(displayPathname, pathname);
		if (leaveSound) {
			playPortfolioRouteLeaveSound(leaveSound);
		}

		setPhase("exiting");

		exitTimerRef.current = setTimeout(beginEnter, ROUTE_TRANSITION_EXIT_MS);

		return clearTransitionTimers;
	}, [pathname, displayPathname, phase, clearTransitionTimers]);

	return {
		displayPathname,
		phase,
		isTransitioning: phase !== "idle",
		setDisplayPathname,
	};
}
