import { playGlitchTextSound } from "@/sounds/soundDesign.js";
import { getSnakeLength } from "@/shared/glitchText/glitchSnakeEngine.js";

export const DELAY_BETWEEN_LETTERS = 75;
export const DELAY_BETWEEN_SYMBOLS = 50;

/** @typedef {'hover' | 'appear' | 'disappear'} GlitchSnakeMode */

/** @typedef {{ timeBudgetMs?: number, snakeLength?: number, delayBetweenLetters?: number, delayBetweenSymbols?: number, playSound?: boolean, onBeforeAppear?: () => void, onComplete?: () => void }} GlitchSnakeOptions */

/** Сколько букв глитчат одновременно: 2 + 2 за каждые 12 символов. */
export { getSnakeLength };

/** Длительность глитча одной буквы (мс). */
export function getLetterAnimDuration(additionalCount, timing = {}) {
	return Math.max(additionalCount, 1) * (timing.delayBetweenSymbols ?? DELAY_BETWEEN_SYMBOLS);
}

/** Старт буквы в «волне» змейки. */
export function getLetterStartDelay(containerIndex, snakeLength, additionalCount, timing = {}) {
	const waveIndex = Math.floor(containerIndex / snakeLength);
	const indexInWave = containerIndex % snakeLength;
	const waveStart = waveIndex * getLetterAnimDuration(additionalCount, timing);
	return waveStart + indexInWave * (timing.delayBetweenLetters ?? DELAY_BETWEEN_LETTERS);
}

function getLetterContainers(root) {
	if (!root) {
		return [];
	}
	return [...root.querySelectorAll(".letterContainer")].filter(
		(container) => !container.classList.contains("space"),
	);
}

/** Отложенные setTimeout змейки — можно отменить при быстром hover. */
const snakeTimeouts = new WeakMap();
const HIDDEN_COUNT_KEY = "glitchHiddenCount";
const VISIBLE_COUNT_KEY = "glitchVisibleCount";

function clearSnakeTimeouts(root) {
	const ids = snakeTimeouts.get(root);
	if (!ids) {
		return;
	}
	ids.forEach(clearTimeout);
	snakeTimeouts.delete(root);
}

function getClassCount(element, key) {
	return Number(element?.dataset?.[key] ?? 0) || 0;
}

function incrementClassCount(element, key, className) {
	if (!element) {
		return;
	}

	const next = getClassCount(element, key) + 1;
	element.dataset[key] = String(next);
	element.classList.add(className);
}

function decrementClassCount(element, key, className) {
	if (!element) {
		return;
	}

	const next = Math.max(0, getClassCount(element, key) - 1);
	if (next > 0) {
		element.dataset[key] = String(next);
		return;
	}

	delete element.dataset[key];
	element.classList.remove(className);
}

function resetRuntimeClassCountsInScope(scope) {
	if (!scope) {
		return;
	}

	scope.querySelectorAll(".mainLetter").forEach((letter) => {
		delete letter.dataset[HIDDEN_COUNT_KEY];
	});
	scope.querySelectorAll(".additionalLetter").forEach((letter) => {
		delete letter.dataset[VISIBLE_COUNT_KEY];
		letter.classList.remove("visible");
	});
}

function resetRuntimeClassCounts(root) {
	resetRuntimeClassCountsInScope(root);
}

/** Сбрасывает незавершённую змейку (застрявшие glitch-символы). */
export function abortGlitchSnake(root) {
	clearSnakeTimeouts(root);
	resetRuntimeClassCounts(root);
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

/** Сжимает тайминги, если змейка длиннее timeBudgetMs (для exit route transition). */
export function getGlitchSnakeTimeScale(naturalDurationMs, timeBudgetMs) {
	if (!timeBudgetMs || naturalDurationMs <= 0) {
		return 1;
	}
	if (naturalDurationMs <= timeBudgetMs) {
		return 1;
	}
	return timeBudgetMs / naturalDurationMs;
}

/** Перед appear — все основные буквы скрыты до прохода змейки (без отмены других таймеров). */
export function prepareGlitchAppearInScope(scope) {
	if (!scope) {
		return;
	}

	getLetterContainers(scope).forEach((container) => {
		container.querySelector(".mainLetter")?.classList.add("hidden");
	});
}

/** Перед appear — все основные буквы скрыты до прохода змейки. */
export function prepareGlitchAppear(root) {
	abortGlitchSnake(root);
	prepareGlitchAppearInScope(root);
}

/** Статичная видимость группы языка (без анимации). */
export function setLanguageGroupLettersVisible(group, visible) {
	if (!group) {
		return;
	}

	getLetterContainers(group).forEach((container) => {
		const mainLetter = container.querySelector(".mainLetter");
		if (!mainLetter) {
			return;
		}

		if (visible) {
			mainLetter.classList.remove("hidden");
			delete mainLetter.dataset[HIDDEN_COUNT_KEY];
			return;
		}

		mainLetter.classList.add("hidden");
		delete mainLetter.dataset[HIDDEN_COUNT_KEY];
	});
}

/** Сброс после ошибочного disappear (внутренний переход hub ↔ case). */
export function restoreGlitchLettersVisible(root) {
	abortGlitchSnake(root);
	getLetterContainers(root).forEach((container) => {
		container.querySelector(".mainLetter")?.classList.remove("hidden");
	});
}

/**
 * Одна буква: глитч-символы, затем исход/появление mainLetter в зависимости от режима.
 * hover / appear — буква остаётся видимой; disappear — остаётся скрытой.
 */
export function animateLetterContainer(container, startDelay, mode, timeScale = 1, root = null, timing = {}) {
	const mainLetter = container.querySelector(".mainLetter");
	const additionalLetters = container.querySelectorAll(".additionalLetter");
	if (!mainLetter) {
		return;
	}

	const schedule = (fn, ms) => {
		if (root) {
			scheduleSnakeTimeout(root, fn, ms);
		} else {
			setTimeout(fn, ms);
		}
	};

	schedule(() => {
		incrementClassCount(mainLetter, HIDDEN_COUNT_KEY, "hidden");
		additionalLetters.forEach((letter, index) => {
			schedule(() => {
				incrementClassCount(letter, VISIBLE_COUNT_KEY, "visible");
				schedule(() => {
					decrementClassCount(letter, VISIBLE_COUNT_KEY, "visible");
				}, scaleMs(DELAY_BETWEEN_SYMBOLS, timeScale));
			}, scaleMs(index * (timing.delayBetweenSymbols ?? DELAY_BETWEEN_SYMBOLS), timeScale));
		});

		const glitchDuration = scaleMs(additionalLetters.length * (timing.delayBetweenSymbols ?? DELAY_BETWEEN_SYMBOLS), timeScale);
		schedule(() => {
			if (mode === "hover" || mode === "appear") {
				decrementClassCount(mainLetter, HIDDEN_COUNT_KEY, "hidden");
			}
		}, glitchDuration);
	}, scaleMs(startDelay, timeScale));
}

/** Полная длительность змейки по всем буквам (мс). */
export function getTotalSnakeDuration(letterContainers, snakeLength, timeScale = 1, timing = {}) {
	if (!letterContainers.length) {
		return 0;
	}

	const lastIndex = letterContainers.length - 1;
	const lastAdditional = letterContainers[lastIndex].querySelectorAll(".additionalLetter").length;
	const lastStart = getLetterStartDelay(lastIndex, snakeLength, lastAdditional, timing);
	return scaleMs(lastStart + getLetterAnimDuration(lastAdditional, timing), timeScale);
}

/**
 * Змейка внутри scope (.languageGroup или весь .wordContainer).
 * timeoutRoot — куда писать таймеры (общий root при смене языка).
 * @returns {number} длительность анимации в мс
 */
export function runGlitchSnakeInScope(scope, mode, options = {}, timeoutRoot = scope) {
	if (!scope) {
		return 0;
	}

	if (mode !== "hover") {
		resetRuntimeClassCountsInScope(scope);
	}

	const letterContainers = getLetterContainers(scope);
	const snakeLength = Math.max(1, options.snakeLength ?? getSnakeLength(letterContainers.length));
	const timing = {
		delayBetweenLetters: options.delayBetweenLetters,
		delayBetweenSymbols: options.delayBetweenSymbols,
	};
	const naturalDuration = getTotalSnakeDuration(letterContainers, snakeLength, 1, timing);
	const timeScale = getGlitchSnakeTimeScale(naturalDuration, options.timeBudgetMs);

	if (mode === "appear") {
		prepareGlitchAppearInScope(scope);
	}

	letterContainers.forEach((container, containerIndex) => {
		const additionalCount = container.querySelectorAll(".additionalLetter").length;
		const startDelay = getLetterStartDelay(containerIndex, snakeLength, additionalCount, timing);
		animateLetterContainer(container, startDelay, mode, timeScale, timeoutRoot, timing);
	});

	return getTotalSnakeDuration(letterContainers, snakeLength, timeScale, timing);
}

/**
 * Запуск змейки по всем буквам внутри .glitchText / .wordContainer.
 * timeBudgetMs — уложить анимацию в бюджет (ускорение пропорционально).
 * @returns {number} длительность анимации в мс
 */
export function runGlitchSnake(root, mode, options = {}) {
	if (!root) {
		return 0;
	}

	if (mode !== "hover") {
		clearSnakeTimeouts(root);
		resetRuntimeClassCounts(root);
	}

	const durationMs = runGlitchSnakeInScope(root, mode, options, root);

	// Звук только на hover — enter/exit один раз на весь каскад (routeGlitchRegistry).
	if (durationMs > 0 && mode === "hover") {
		playGlitchTextSound(durationMs, "hover");
	}

	return durationMs;
}

/**
 * Змейка между двумя glitch-группами: disappear старой, на полпути — appear новой.
 * @returns {number} ориентировочная полная длительность в мс
 */
export function runGlitchGroupSwitch(root, fromGroup, toGroup, options = {}) {
	if (!root || !fromGroup || !toGroup || fromGroup === toGroup) {
		options.onComplete?.();
		return 0;
	}

	clearSnakeTimeouts(root);
	resetRuntimeClassCounts(root);

	setLanguageGroupLettersVisible(fromGroup, true);
	setLanguageGroupLettersVisible(toGroup, false);

	const disappearDuration = runGlitchSnakeInScope(fromGroup, "disappear", options, root);
	const appearDelay = Math.round(disappearDuration / 2);
	const toLetterContainers = getLetterContainers(toGroup);
	const toSnakeLength = Math.max(1, options.snakeLength ?? getSnakeLength(toLetterContainers.length));
	const toNaturalDuration = getTotalSnakeDuration(toLetterContainers, toSnakeLength, 1);
	const appearTimeScale = getGlitchSnakeTimeScale(toNaturalDuration, options.timeBudgetMs);
	const appearDuration = getTotalSnakeDuration(toLetterContainers, toSnakeLength, appearTimeScale);
	const totalDuration = appearDelay + appearDuration;

	// Звук сразу вместе с disappear — как в HeroTextGlitchController и hub projects.
	if (options.playSound !== false && totalDuration > 0) {
		playGlitchTextSound(totalDuration, "hover");
	}

	scheduleSnakeTimeout(root, () => {
		// Layout-sensitive consumers switch their reserved width only after the old
		// word is gone and before any letter of the new word can become visible.
		options.onBeforeAppear?.();
		runGlitchSnakeInScope(toGroup, "appear", options, root);

		scheduleSnakeTimeout(root, () => {
			options.onComplete?.();
		}, appearDuration);
	}, appearDelay);

	return totalDuration;
}

/**
 * Смена языка: disappear старой группы, на полпути — appear новой (как digital-monster).
 * @returns {number} ориентировочная полная длительность в мс
 */
export function runGlitchLanguageSwitch(root, fromLocale, toLocale, options = {}) {
	const fromGroup = root?.querySelector(`.languageGroup.${fromLocale}`);
	const toGroup = root?.querySelector(`.languageGroup.${toLocale}`);

	return runGlitchGroupSwitch(root, fromGroup, toGroup, options);
}
