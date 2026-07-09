import { playGlitchTextSound } from "@/sounds/soundDesign.js";

/** Тайминги как у Aten7 timeline — два symbol-шага на букву, змейка по слову. */
export const ATEN_DELAY_BETWEEN_LETTERS = 80;
export const ATEN_SYMBOL_STEP_MS = 55;

const BASE_SNAKE_LENGTH = 2;
const SNAKE_CHARS_STEP = 12;
const SNAKE_LENGTH_STEP = 2;
const APPEAR_SYMBOL_CLASS = "appearSymbol";

/** @typedef {'hover' | 'appear' | 'disappear'} AtenCharSnakeMode */

/** @typedef {{ timeBudgetMs?: number }} AtenCharSnakeOptions */

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

export function getAtenSnakeLength(charCount) {
	return BASE_SNAKE_LENGTH + Math.floor(charCount / SNAKE_CHARS_STEP) * SNAKE_LENGTH_STEP;
}

function getCharAnimDuration() {
	return ATEN_SYMBOL_STEP_MS * 3;
}

function getCharStartDelay(containerIndex, snakeLength) {
	const waveIndex = Math.floor(containerIndex / snakeLength);
	const indexInWave = containerIndex % snakeLength;
	const waveStart = waveIndex * getCharAnimDuration();
	return waveStart + indexInWave * ATEN_DELAY_BETWEEN_LETTERS;
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
 * Одна буква Aten7: symbol₁ → symbol₂ → letter (appear), обратно при disappear.
 */
function animateAtenCharElement(element, startDelay, mode, timeScale, root) {
	const letter = element.querySelector(".letter");
	const symbols = element.querySelectorAll(".symbol");
	const sym0 = symbols[0];
	const sym1 = symbols[1];
	const step = () => scaleMs(ATEN_SYMBOL_STEP_MS, timeScale);

	const schedule = (fn, ms) => scheduleSnakeTimeout(root, fn, ms);

	schedule(() => {
		if (mode === "hover" || mode === "appear") {
			setOpacity(element, true);
			setOpacity(letter, false);
			setOpacity(sym0, false);
			setOpacity(sym1, false);

			schedule(() => {
				sym0?.classList.add(APPEAR_SYMBOL_CLASS);
				setOpacity(sym0, true);
				schedule(() => {
					setOpacity(sym0, false);
					sym0?.classList.remove(APPEAR_SYMBOL_CLASS);
					sym1?.classList.add(APPEAR_SYMBOL_CLASS);
					setOpacity(sym1, true);
					schedule(() => {
						setOpacity(sym1, false);
						sym1?.classList.remove(APPEAR_SYMBOL_CLASS);
						setOpacity(letter, true);
					}, step());
				}, step());
			}, 0);
			return;
		}

		setOpacity(letter, false);
		schedule(() => {
			setOpacity(sym1, true);
			schedule(() => {
				setOpacity(sym1, false);
				setOpacity(sym0, true);
				schedule(() => {
					setOpacity(sym0, false);
					setOpacity(element, false);
				}, step());
			}, step());
		}, 0);
	}, scaleMs(startDelay, timeScale));
}

function getTotalAtenDuration(charElements, snakeLength, timeScale = 1) {
	if (!charElements.length) {
		return 0;
	}
	const lastIndex = charElements.length - 1;
	const lastStart = getCharStartDelay(lastIndex, snakeLength);
	return scaleMs(lastStart + getCharAnimDuration(), timeScale);
}

/**
 * Змейка Aten7 по .charElement внутри .charWrapper.
 * @returns {number} длительность в мс
 */
export function runAtenCharSnake(root, mode, options = {}) {
	if (!root) {
		return 0;
	}

	clearSnakeTimeouts(root);

	const charElements = getCharElements(root);
	const snakeLength = getAtenSnakeLength(charElements.length);
	const naturalDuration = getTotalAtenDuration(charElements, snakeLength, 1);
	const timeScale = getAtenSnakeTimeScale(naturalDuration, options.timeBudgetMs);

	if (mode === "appear") {
		prepareAtenHidden(root);
	}

	charElements.forEach((element, index) => {
		const startDelay = getCharStartDelay(index, snakeLength);
		animateAtenCharElement(element, startDelay, mode, timeScale, root);
	});

	const durationMs = getTotalAtenDuration(charElements, snakeLength, timeScale);

	if (durationMs > 0 && mode === "hover") {
		playGlitchTextSound(durationMs, "hover");
	}

	return durationMs;
}
