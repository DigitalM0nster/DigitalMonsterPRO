import { shouldActivateRoutePage } from "@/utils/shouldActivateRoutePage.js";

/** Видимость сцены при смене роута (display + teleport + phase). */
export function computeRouteSceneVisibility({ currentPage, teleportPage, routePhase, matchPage }) {
	const displayed = matchPage(currentPage);
	const target = matchPage(teleportPage);
	const show = displayed || (target && routePhase !== "exiting");
	const shouldWake =
		shouldActivateRoutePage(displayed, routePhase) || (target && routePhase === "entering");
	return { show, shouldWake, displayed };
}
