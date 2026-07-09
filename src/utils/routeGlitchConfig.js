/**
 * Конфиг glitch-змейки (GlitchText) для страниц и блоков сайта.
 *
 * Как добавить новый блок:
 * 1. Добавить scope с isActive(pathname) — когда блок виден по URL в строке браузера.
 * 2. В компоненте со GlitchText вызвать useRouteGlitchScope({ scope, itemCount, itemGlitchRefs }).
 * 3. Перед navigate — triggerRouteGlitchBeforeNavigate(from, to) (уже в LeftMenu).
 *
 * Enter/exit завязаны на location.pathname (URL браузера), не на displayPathname.
 */

import { isPortfolioHubPath } from "@/three/scenes/portfolio/hub/projectsData.js";
import { ROUTE_TRANSITION_ENTER_MS, ROUTE_TRANSITION_EXIT_MS } from "@/config/routeTransition.js";
import { getRouteStaggerDelayMs } from "@/utils/routeStagger.js";

/** @typedef {'enter' | 'exit'} RouteGlitchIntent */
/** @typedef {'cascade' | 'parallel'} RouteGlitchStaggerMode */

/**
 * @typedef {object} RouteGlitchScopeConfig
 * @property {(pathname: string) => boolean} isActive — scope активен по URL в строке браузера
 * @property {RouteGlitchStaggerMode} [enterStagger]
 * @property {RouteGlitchStaggerMode} [exitStagger]
 * @property {number} [enterTimeBudgetMs]
 * @property {number} [exitTimeBudgetMs]
 */

/** @type {Record<string, RouteGlitchScopeConfig & { autoFocusDelayMs?: number }>} */
export const ROUTE_GLITCH_SCOPES = {
	/** Hero-текст на главной (DIGITAL MONSTER). */
	homeHeroText: {
		isActive: (pathname) => pathname === "/" || pathname === "",
		enterStagger: "parallel",
		exitStagger: "parallel",
		exitTimeBudgetMs: ROUTE_TRANSITION_EXIT_MS,
		enterTimeBudgetMs: ROUTE_TRANSITION_ENTER_MS,
	},
	/** Список проектов на hub /portfolio — enter/exit glitch. */
	portfolioHub: {
		isActive: isPortfolioHubPath,
		enterStagger: "cascade",
		exitStagger: "parallel",
		exitTimeBudgetMs: ROUTE_TRANSITION_EXIT_MS,
		enterTimeBudgetMs: ROUTE_TRANSITION_ENTER_MS,
	},
};

/** Scope активен на данном URL (строка браузера). */
export function isRouteGlitchScopeActive(scope, pathname) {
	const config = ROUTE_GLITCH_SCOPES[scope];
	return config?.isActive?.(pathname) ?? false;
}

/**
 * @param {string} scope
 * @param {RouteGlitchIntent} intent
 */
export function getRouteGlitchStaggerMode(scope, intent) {
	const config = ROUTE_GLITCH_SCOPES[scope];
	if (!config) {
		return "cascade";
	}
	return intent === "exit" ? (config.exitStagger ?? "cascade") : (config.enterStagger ?? "cascade");
}

/**
 * @param {string} scope
 * @param {RouteGlitchIntent} intent
 */
export function getRouteGlitchTimeBudgetMs(scope, intent) {
	const config = ROUTE_GLITCH_SCOPES[scope];
	if (!config) {
		return intent === "exit" ? ROUTE_TRANSITION_EXIT_MS : ROUTE_TRANSITION_ENTER_MS;
	}
	return intent === "exit" ? (config.exitTimeBudgetMs ?? ROUTE_TRANSITION_EXIT_MS) : (config.enterTimeBudgetMs ?? ROUTE_TRANSITION_ENTER_MS);
}

/**
 * Когда заканчивается каскад glitch (задержка последнего элемента + бюджет змейки).
 * @param {string} scope
 * @param {RouteGlitchIntent} intent
 * @param {number} itemCount
 */
export function getRouteGlitchCascadeFinishMs(scope, intent, itemCount) {
	const staggerMode = getRouteGlitchStaggerMode(scope, intent);
	const timeBudgetMs = getRouteGlitchTimeBudgetMs(scope, intent);
	const count = Math.max(1, itemCount);

	if (staggerMode === "parallel") {
		return timeBudgetMs;
	}

	const lastIndex = count - 1;
	const lastDelay = getRouteStaggerDelayMs(lastIndex, count, intent);
	return lastDelay + timeBudgetMs;
}
