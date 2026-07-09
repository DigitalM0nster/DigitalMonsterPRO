import {
	ROUTE_TRANSITION_ENTER_MS,
	ROUTE_TRANSITION_EXIT_MS,
} from "../config/routeTransition.js";

/**
 * Каскад HTML при смене страницы.
 *
 * Элементы с data-stagger-i внутри .page → syncRouteStagger → CSS-переменные на #contentContainer.
 *
 * | Класс                      | Анимация                          | Где задаётся          |
 * |----------------------------|-----------------------------------|-----------------------|
 * | transitionAnimatedElement  | opacity + translate (CSS)         | mainTransition.scss   |
 * | routeGlitchElement         | glitch-змейка (JS)                | useRouteGlitchScope   |
 *
 * Оба класса учитываются в itemCount и делят одни тайминги enter/exit.
 */

/** CSS-каскад: opacity / transform через классы .page (hidden | activating | active | removing | remove | leaving) */
export const TRANSITION_ANIMATED_ELEMENT_CLASS = "transitionAnimatedElement";

/** JS-каскад: appear / disappear через GlitchText и useRouteGlitchScope */
export const ROUTE_GLITCH_ELEMENT_CLASS = "routeGlitchElement";

const ROUTE_ANIMATED_SELECTOR = `.${TRANSITION_ANIMATED_ELEMENT_CLASS}, .${ROUTE_GLITCH_ELEMENT_CLASS}`;

/**
 * Доля totalMs на длительность анимации одного элемента (остальное — паузы между стартами).
 * 0.45 → при 500ms у элемента ~225ms, шаг ~68ms для 5 элементов.
 */
export const ROUTE_STAGGER_ELEMENT_RATIO = 0.45;

/**
 * @param {number} totalMs — ROUTE_TRANSITION_ENTER_MS или EXIT_MS
 * @param {number} itemCount — число элементов в каскаде (по max индексу + 1)
 * @param {number} [elementRatio] — доля totalMs на transition-duration одного элемента
 * @returns {{ elementDuration: number, stepMs: number }}
 */
export function computeStaggerTiming(totalMs, itemCount, elementRatio = ROUTE_STAGGER_ELEMENT_RATIO) {
	const elementDuration = Math.round(totalMs * elementRatio);
	const stepMs =
		itemCount <= 1 ? 0 : Math.max(0, (totalMs - elementDuration) / (itemCount - 1));

	return { elementDuration, stepMs };
}

/**
 * Задержка старта элемента каскада (мс).
 * @param {'enter' | 'exit'} intent
 */
export function getRouteStaggerDelayMs(index, itemCount, intent) {
	const totalMs = intent === "enter" ? ROUTE_TRANSITION_ENTER_MS : ROUTE_TRANSITION_EXIT_MS;
	const { stepMs } = computeStaggerTiming(totalMs, itemCount);
	return index * stepMs;
}

/**
 * Запускает onItem(index) с каскадной или параллельной задержкой; возвращает отмену таймеров.
 * @param {{ itemCount: number, intent: 'enter' | 'exit', staggerMode?: 'cascade' | 'parallel', onItem: (index: number) => void }} params
 * @returns {() => void}
 */
export function runStaggeredRouteAnimation({
	itemCount,
	intent,
	onItem,
	staggerMode = "cascade",
}) {
	const count = Math.max(1, itemCount);
	const timeoutIds = [];

	for (let index = 0; index < count; index++) {
		const delay =
			staggerMode === "parallel" ? 0 : getRouteStaggerDelayMs(index, count, intent);
		if (delay === 0) {
			onItem(index);
		} else {
			timeoutIds.push(setTimeout(() => onItem(index), delay));
		}
	}

	return () => {
		timeoutIds.forEach(clearTimeout);
	};
}

/**
 * Пишет в контейнер (обычно #contentContainer) переменные для CSS:
 * delay = calc(var(--routeEnterStaggerStep) * var(--stagger-i))
 * последний элемент (индекс itemCount - 1) заканчивает ровно на totalMs.
 */
export function applyRouteStaggerCssVars(element, itemCount = 1) {
	if (!element) {
		return;
	}

	const count = Math.max(1, itemCount);
	const enter = computeStaggerTiming(ROUTE_TRANSITION_ENTER_MS, count);
	const exit = computeStaggerTiming(ROUTE_TRANSITION_EXIT_MS, count);

	element.style.setProperty("--routeEnterDuration", `${ROUTE_TRANSITION_ENTER_MS}ms`);
	element.style.setProperty("--routeExitDuration", `${ROUTE_TRANSITION_EXIT_MS}ms`);
	element.style.setProperty("--routeEnterElementDuration", `${enter.elementDuration}ms`);
	element.style.setProperty("--routeEnterStaggerStep", `${enter.stepMs}ms`);
	element.style.setProperty("--routeExitElementDuration", `${exit.elementDuration}ms`);
	element.style.setProperty("--routeExitStaggerStep", `${exit.stepMs}ms`);
	element.style.setProperty("--routeStaggerCount", String(count));
}

function getStaggerIndex(element, domIndex) {
	const raw = element.dataset.staggerI;
	if (raw === undefined || raw === "") {
		return domIndex;
	}
	const parsed = Number(raw);
	return Number.isFinite(parsed) ? parsed : domIndex;
}

/**
 * Находит анимированные элементы внутри текущей `.page`, выставляет --stagger-i и пересчитывает шаги.
 * @param {HTMLElement | null} container
 * @returns {number} itemCount
 */
export function syncRouteStagger(container) {
	if (!container) {
		return 1;
	}

	const pageRoot = container.querySelector(".page");
	const items = pageRoot ? [...pageRoot.querySelectorAll(ROUTE_ANIMATED_SELECTOR)] : [];

	let maxIndex = -1;
	items.forEach((el, domIndex) => {
		const index = getStaggerIndex(el, domIndex);
		el.style.setProperty("--stagger-i", String(index));
		maxIndex = Math.max(maxIndex, index);
	});

	const itemCount = items.length === 0 ? 1 : maxIndex + 1;
	applyRouteStaggerCssVars(container, itemCount);
	return itemCount;
}
