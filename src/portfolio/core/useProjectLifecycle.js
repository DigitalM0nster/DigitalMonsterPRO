import { useEffect, useMemo } from "react";
import { useRouteTransitionContext } from "@/context/RouteTransitionContext.jsx";
import { ROUTE_TRANSITION_ENTER_MS, ROUTE_TRANSITION_EXIT_MS } from "@/config/routeTransition.js";

/**
 * CSS-классы и тайминги появления/исчезновения проекта.
 * Звуки роута — глобально (useRouteTransition); здесь только UI-фаза.
 *
 * @param {import('./types.js').PortfolioProjectModule} project
 */
export function useProjectLifecycle(project) {
	const { phase, isTransitioning } = useRouteTransitionContext();
	const lifecycle = project.config.lifecycle;

	const enterMs = lifecycle?.enterMs ?? ROUTE_TRANSITION_ENTER_MS;
	const exitMs = lifecycle?.exitMs ?? ROUTE_TRANSITION_EXIT_MS;

	const shellClassName = useMemo(() => {
		const classes = ["portfolioProject"];
		if (phase === "entering") {
			classes.push("entering");
		}
		if (phase === "exiting") {
			classes.push("exiting");
		}
		if (phase === "idle") {
			classes.push("active");
		}
		return classes.join(" ");
	}, [phase]);

	const accentColor = project.config.meta?.accentColor ?? "#008890";

	useEffect(() => {
		document.documentElement.style.setProperty("--portfolioAccent", accentColor);
		return () => {
			document.documentElement.style.removeProperty("--portfolioAccent");
		};
	}, [accentColor]);

	return {
		shellClassName,
		isTransitioning,
		enterMs,
		exitMs,
		phase,
	};
}
