import { ROUTE_GLITCH_SCOPES } from "@/utils/routeGlitchConfig.js";
import {
	triggerRouteGlitchScopeEnter,
	triggerRouteGlitchScopeExit,
} from "@/utils/routeGlitchRegistry.js";

/**
 * Перед navigate(): glitch exit/enter по URL в строке браузера (location.pathname).
 * Вызывать до смены URL — пока GlitchText ещё в DOM (как dev-кнопка).
 *
 * @param {string} fromPathname — текущий location.pathname
 * @param {string} toPathname — целевой путь
 */
export function triggerRouteGlitchBeforeNavigate(fromPathname, toPathname) {
	if (fromPathname === toPathname) {
		return;
	}

	for (const scope of Object.keys(ROUTE_GLITCH_SCOPES)) {
		const { isActive } = ROUTE_GLITCH_SCOPES[scope];
		const wasActive = isActive(fromPathname);
		const willBeActive = isActive(toPathname);

		if (wasActive && !willBeActive) {
			triggerRouteGlitchScopeExit(scope);
		}
		if (!wasActive && willBeActive) {
			triggerRouteGlitchScopeEnter(scope);
		}
	}
}
