import { playGlitchTextSound } from "@/sounds/soundDesign.js";
import {
	DELAY_BETWEEN_LETTERS,
	DELAY_BETWEEN_SYMBOLS,
	getLetterAnimDuration,
	getLetterStartDelay,
	getSnakeLength,
} from "@/shared/glitchText/glitchSnakeEngine.js";

/** Appear/disappear defaults (slightly denser than hub hover). Hover uses engine 75/50. */
export const ATEN_DELAY_BETWEEN_LETTERS = 80;
export const ATEN_SYMBOL_STEP_MS = 55;

const APPEAR_SYMBOL_CLASS = "appearSymbol";

/** @typedef {'hover' | 'appear' | 'disappear'} AtenCharSnakeMode */

/**
 * @typedef {{
 *   timeBudgetMs?: number,
 *   timeScale?: number,
 *   delayBetweenLetters?: number,
 *   delayBetweenSymbols?: number,
 *   reverseOrder?: boolean,
 *   playSound?: boolean,
 * }} AtenCharSnakeOptions
 */

const snakeTimeouts = new WeakMap();

function clearSnakeTimeouts(root) {
	const ids = snakeTimeouts.get(root);
	if (!ids) {
		return;
	}
	ids.forEach(clearTimeout);
	snakeTimeouts.delete(root);
}

export function abortAtenCharSnake(root) {
	clearSnakeTimeouts(root);
}

function scheduleSnakeTimeout(root, fn, ms) {
	const id = setTimeout(fn, ms);
	let ids = snakeTimeouts.get(root);
	if (!ids) {
		ids = [];
		snakeTimeouts.set(root, ids);
	}
	ids.push(id);
	return id;
}

function scaleMs(ms, timeScale) {
	return Math.max(0, Math.round(ms * timeScale));
}

function getCharElements(root) {
	if (!root) {
		return [];
	}
	return [...root.querySelectorAll(".charElement")].filter(
		(el) => !el.classList.contains("charSpace"),
	);
}

function setOpacity(el, visible) {
	if (!el) {
		return;
	}
	el.style.opacity = visible ? "1" : "0";
}

function resolveAtenTiming(options = {}, mode) {
	const useHubHoverDefaults = mode === "hover";
	return {
		delayBetweenLetters: Number.isFinite(options.delayBetweenLetters)
			? options.delayBetweenLetters
			: useHubHoverDefaults
				? DELAY_BETWEEN_LETTERS
				: ATEN_DELAY_BETWEEN_LETTERS,
		delayBetweenSymbols: Number.isFinite(options.delayBetweenSymbols)
			? options.delayBetweenSymbols
			: useHubHoverDefaults
				? DELAY_BETWEEN_SYMBOLS
				: ATEN_SYMBOL_STEP_MS,
	};
}

/** @deprecated use getSnakeLength from glitchSnakeEngine — same formula. */
export function getAtenSnakeLength(charCount) {
	return getSnakeLength(charCount);
}

export function getAtenSnakeTimeScale(naturalDurationMs, timeBudgetMs) {
	if (!timeBudgetMs || naturalDurationMs <= 0) {
		return 1;
	}
	if (naturalDurationMs <= timeBudgetMs) {
		return 1;
	}
	return timeBudgetMs / naturalDurationMs;
}

/** Скрытое состояние — как char__element opacity:0 + letter/symbol opacity:0. */
export function prepareAtenHidden(root) {
	getCharElements(root).forEach((element) => {
		setOpacity(element, false);
		setOpacity(element.querySelector(".letter"), false);
		element.querySelectorAll(".symbol").forEach((symbol) => {
			symbol.classList.remove(APPEAR_SYMBOL_CLASS);
			setOpacity(symbol, false);
		});
	});
}

/** Финальное состояние — все буквы видны, символы скрыты. */
export function restoreAtenVisible(root) {
	getCharElements(root).forEach((element) => {
		setOpacity(element, true);
		setOpacity(element.querySelector(".letter"), true);
		element.querySelectorAll(".symbol").forEach((symbol) => {
			symbol.classList.remove(APPEAR_SYMBOL_CLASS);
			setOpacity(symbol, false);
		});
	});
}

/**
 * Одна буква: как GlitchSnakeEngine — каждый replacement на delayBetweenSymbols,
 * затем восстановление основной буквы (appear/hover) или скрытие элемента (disappear).
 */
function animateAtenCharElement(element, startDelay, mode, timeScale, root, timing) {
	const letter = element.querySelector(".letter");
	const symbols = [...element.querySelectorAll(".symbol")];
	const symbolCount = Math.max(symbols.length, 1);
	const stepMs = () => scaleMs(timing.delayBetweenSymbols, timeScale);
	const letterDur = scaleMs(getLetterAnimDuration(symbolCount, timing), timeScale);
	const schedule = (fn, ms) => scheduleSnakeTimeout(root, fn, ms);

	schedule(() => {
		if (mode === "hover" || mode === "appear") {
			setOpacity(element, true);
			setOpacity(letter, false);
			symbols.forEach((sym) => {
				sym.classList.remove(APPEAR_SYMBOL_CLASS);
				setOpacity(sym, false);
			});

			symbols.forEach((sym, index) => {
				schedule(() => {
					sym.classList.add(APPEAR_SYMBOL_CLASS);
					setOpacity(sym, true);
					schedule(() => {
						setOpacity(sym, false);
						sym.classList.remove(APPEAR_SYMBOL_CLASS);
					}, stepMs());
				}, scaleMs(index * timing.delayBetweenSymbols, timeScale));
			});

			schedule(() => {
				setOpacity(letter, true);
			}, letterDur);
			return;
		}

		setOpacity(letter, false);
		const reverseSymbols = [...symbols].reverse();
		reverseSymbols.forEach((sym, index) => {
			schedule(() => {
				sym.classList.add(APPEAR_SYMBOL_CLASS);
				setOpacity(sym, true);
				schedule(() => {
					setOpacity(sym, false);
					sym.classList.remove(APPEAR_SYMBOL_CLASS);
					if (index === reverseSymbols.length - 1) {
						setOpacity(element, false);
					}
				}, stepMs());
			}, scaleMs(index * timing.delayBetweenSymbols, timeScale));
		});
		if (reverseSymbols.length === 0) {
			setOpacity(element, false);
		}
	}, scaleMs(startDelay, timeScale));
}

function getSymbolCount(element) {
	return Math.max(element.querySelectorAll(".symbol").length, 1);
}

function getTotalAtenDuration(charElements, snakeLength, timeScale, timing) {
	if (!charElements.length) {
		return 0;
	}
	const lastIndex = charElements.length - 1;
	const lastAdditional = getSymbolCount(charElements[lastIndex]);
	const lastStart = getLetterStartDelay(lastIndex, snakeLength, lastAdditional, timing);
	return scaleMs(lastStart + getLetterAnimDuration(lastAdditional, timing), timeScale);
}

/**
 * Змейка Aten по .charElement — та же волна, что GlitchSnakeEngine (hub project list).
 * @returns {number} длительность в мс
 */
export function runAtenCharSnake(root, mode, options = {}) {
	if (!root) {
		return 0;
	}

	// Hub hover: do not cancel an in-flight snake — counters converge naturally.
	if (mode !== "hover") {
		clearSnakeTimeouts(root);
	}

	const charElements = getCharElements(root);
	if (options.reverseOrder === true) {
		charElements.reverse();
	}
	const timing = resolveAtenTiming(options, mode);
	const snakeLength = getSnakeLength(charElements.length);
	const naturalDuration = getTotalAtenDuration(charElements, snakeLength, 1, timing);
	const budgetScale = getAtenSnakeTimeScale(naturalDuration, options.timeBudgetMs);
	const paceScale = Number.isFinite(options.timeScale) && options.timeScale > 0 ? options.timeScale : 1;
	const timeScale = budgetScale * paceScale;

	if (mode === "appear") {
		prepareAtenHidden(root);
	}

	charElements.forEach((element, index) => {
		const additionalCount = getSymbolCount(element);
		const startDelay = getLetterStartDelay(index, snakeLength, additionalCount, timing);
		animateAtenCharElement(element, startDelay, mode, timeScale, root, timing);
	});

	const durationMs = getTotalAtenDuration(charElements, snakeLength, timeScale, timing);

	if (durationMs > 0 && mode === "hover" && options.playSound !== false) {
		playGlitchTextSound(durationMs, "hover");
	}

	return durationMs;
}
