import {
	getRouteGlitchCascadeFinishMs,
	getRouteGlitchStaggerMode,
	getRouteGlitchTimeBudgetMs,
	isRouteGlitchScopeActive,
} from "@/utils/routeGlitchConfig.js";
import { playGlitchTextSound } from "@/sounds/soundDesign.js";
import { runStaggeredRouteAnimation } from "@/utils/routeStagger.js";

/** @typedef {{ onEnter?: () => void, onExit?: () => void }} RouteGlitchScopeHandlers */

/** @type {Map<string, RouteGlitchScopeHandlers>} */
const scopeHandlers = new Map();

/** Не дублировать appear при navigate + useLayoutEffect на одном клике. */
const lastEnterAtByScope = new Map();
const ROUTE_GLITCH_ENTER_DEDUP_MS = 120;

/** Отмена последнего каскада appear/disappear по scope (быстрый возврат на hub). */
const staggerCancelByScope = new Map();

/**
 * Компонент со GlitchText регистрирует appear/disappear при mount.
 * @param {string} scope
 * @param {RouteGlitchScopeHandlers} handlers
 */
export function registerRouteGlitchScope(scope, handlers) {
	if (!handlers.onEnter && !handlers.onExit) {
		scopeHandlers.delete(scope);
		return;
	}
	scopeHandlers.set(scope, handlers);
}

export function unregisterRouteGlitchScope(scope) {
	scopeHandlers.delete(scope);
}

export function triggerRouteGlitchScopeEnter(scope) {
	scopeHandlers.get(scope)?.onEnter?.();
}

export function triggerRouteGlitchScopeExit(scope) {
	scopeHandlers.get(scope)?.onExit?.();
}

/** Сбросить отложенные playAppear/playDisappear (например, отмена ухода с hub). */
export function cancelRouteGlitchStagger(scope) {
	staggerCancelByScope.get(scope)?.();
	staggerCancelByScope.delete(scope);
}

export { isRouteGlitchScopeActive };

/**
 * Запуск appear/disappear для группы GlitchText refs.
 * @param {string} scope
 * @param {'enter' | 'exit'} intent
 * @param {{ current: Array<{ playAppear?: (ms?: number) => void, playDisappear?: (ms?: number) => void } | null> }} itemGlitchRefs
 * @param {number} itemCount
 * @param {{ force?: boolean }} [options]
 */
export function runRouteGlitchStagger(scope, intent, itemGlitchRefs, itemCount, options = {}) {
	const refs = itemGlitchRefs.current ?? [];
	const playMethod = intent === "enter" ? "playAppear" : "playDisappear";
	const readyCount = refs.filter((ref) => typeof ref?.[playMethod] === "function").length;

	if (intent === "enter" && !options.force) {
		const now = performance.now();
		const lastAt = lastEnterAtByScope.get(scope) ?? 0;
		if (now - lastAt < ROUTE_GLITCH_ENTER_DEDUP_MS) {
			return;
		}
	}

	if (readyCount === 0) {
		return;
	}

	if (intent === "enter") {
		lastEnterAtByScope.set(scope, performance.now());
	}

	const staggerMode = getRouteGlitchStaggerMode(scope, intent);
	const timeBudgetMs = getRouteGlitchTimeBudgetMs(scope, intent);
	const routeSoundDurationMs =
		staggerMode === "cascade" && intent === "enter"
			? getRouteGlitchCascadeFinishMs(scope, intent, itemCount)
			: timeBudgetMs;

	playGlitchTextSound(routeSoundDurationMs, "route");

	staggerCancelByScope.get(scope)?.();
	const cancel = runStaggeredRouteAnimation({
		itemCount,
		intent,
		staggerMode,
		onItem: (index) => {
			refs[index]?.[playMethod]?.(timeBudgetMs);
		},
	});
	staggerCancelByScope.set(scope, cancel);
}
