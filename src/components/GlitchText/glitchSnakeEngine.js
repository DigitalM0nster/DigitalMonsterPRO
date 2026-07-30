import { playGlitchTextSound } from "@/sounds/soundDesign.js";
import { getGlitchReplacements, createGlitchTextSlots } from "./glitchLetterModel.js";

export const DELAY_BETWEEN_LETTERS = 75;
export const DELAY_BETWEEN_SYMBOLS = 50;
const BASE_SNAKE_LENGTH = 2;
const SNAKE_CHARS_STEP = 12;
const SNAKE_LENGTH_STEP = 2;
/** Fade-in основной буквы — portfolio.scss .mainLetter { transition: opacity 0.1s } */
export const MAIN_LETTER_FADE_MS = 100;

/** @typedef {'hover' | 'appear' | 'disappear'} GlitchSnakeMode */

/** @typedef {{ isSpace: true, char: ' ' } | {
 *   isSpace: false,
 *   char: string,
 *   replacements: string[],
 *   mainHiddenCount: number,
 *   appearPending: boolean,
 *   mainAlpha: number,
 *   hoverPassed: boolean,
 *   visibleCounts: number[],
 * }} GlitchLetterSlot */

/** Сколько букв глитчат одновременно: 2 + 2 за каждые 12 символов. */
export function getSnakeLength(charCount) {
	return BASE_SNAKE_LENGTH + Math.floor(charCount / SNAKE_CHARS_STEP) * SNAKE_LENGTH_STEP;
}

/** Длительность глитча одной буквы (мс). */
export function getLetterAnimDuration(additionalCount, timing) {
	const delaySymbols = timing?.delayBetweenSymbols ?? DELAY_BETWEEN_SYMBOLS;
	return Math.max(additionalCount, 1) * delaySymbols;
}

/** Старт буквы в «волне» змейки. */
export function getLetterStartDelay(containerIndex, snakeLength, additionalCount, timing) {
	const delayLetters = timing?.delayBetweenLetters ?? DELAY_BETWEEN_LETTERS;
	const waveIndex = Math.floor(containerIndex / snakeLength);
	const indexInWave = containerIndex % snakeLength;
	const waveStart = waveIndex * getLetterAnimDuration(additionalCount, timing);
	return waveStart + indexInWave * delayLetters;
}

function resolveSnakeTiming(options = {}) {
	return {
		delayBetweenLetters: options.delayBetweenLetters ?? DELAY_BETWEEN_LETTERS,
		delayBetweenSymbols: options.delayBetweenSymbols ?? DELAY_BETWEEN_SYMBOLS,
		mainLetterFadeMs: options.mainLetterFadeMs ?? MAIN_LETTER_FADE_MS,
	};
}

/** @param {number} naturalDurationMs @param {object} [options] */
export function resolveGlitchSnakeTimeScale(naturalDurationMs, options = {}) {
	let timeScale = getGlitchSnakeTimeScale(naturalDurationMs, options.timeBudgetMs);
	const slowMotion = options.slowMotion ?? 1;
	if (slowMotion > 0 && slowMotion !== 1) {
		timeScale *= slowMotion;
	}
	return timeScale;
}

function scaleMs(ms, timeScale) {
	return Math.max(0, Math.round(ms * timeScale));
}

/** Сжимает тайминги, если змейка длиннее timeBudgetMs. */
export function getGlitchSnakeTimeScale(naturalDurationMs, timeBudgetMs) {
	if (!timeBudgetMs || naturalDurationMs <= 0) {
		return 1;
	}
	if (naturalDurationMs <= timeBudgetMs) {
		return 1;
	}
	return timeBudgetMs / naturalDurationMs;
}

/** Полная длительность змейки по всем буквам (мс). */
export function getTotalSnakeDuration(letterSlots, snakeLength, timeScale = 1, timing) {
	if (!letterSlots.length) {
		return 0;
	}

	const lastIndex = letterSlots.length - 1;
	const lastAdditional = letterSlots[lastIndex].replacements.length;
	const lastStart = getLetterStartDelay(lastIndex, snakeLength, lastAdditional, timing);
	return scaleMs(lastStart + getLetterAnimDuration(lastAdditional, timing), timeScale);
}

function resetSlotRuntime(slot) {
	if (slot.isSpace) {
		return;
	}
	slot.mainHiddenCount = 0;
	slot.appearPending = false;
	slot.mainAlpha = 1;
	slot.hoverPassed = false;
	slot.visibleCounts.fill(0);
}

/**
 * Общий движок змейки — одна логика для HTML GlitchText и canvasGlitchText.
 */
export class GlitchSnakeEngine {
	/** @param {() => void} [onChange] */
	constructor(onChange) {
		/** @type {GlitchLetterSlot[]} */
		this.slots = [];
		this.onChange = onChange ?? (() => {});
		/** @type {ReturnType<typeof setTimeout>[]} */
		this._timeouts = [];
		this._hoverHighlightEnabled = false;
	}

	/** @param {GlitchLetterSlot[]} slots */
	setSlots(slots) {
		this.slots = slots;
	}

	abort() {
		this._hoverHighlightEnabled = false;
		this._timeouts.forEach(clearTimeout);
		this._timeouts = [];
		for (const slot of this.slots) {
			resetSlotRuntime(slot);
		}
		this.onChange();
	}

	/** Змейка в процессе — ensureVisible не должен вызывать abort. */
	hasActiveAnimation() {
		return this._timeouts.length > 0;
	}

	/** Скрыть буквы для appear без промежуточного кадра «всё видно» (abort рисует полный текст). */
	_setSlotsHiddenForAppear() {
		for (const slot of this.slots) {
			if (slot.isSpace) {
				continue;
			}
			slot.mainHiddenCount = 0;
			slot.appearPending = true;
			slot.mainAlpha = 1;
			slot.visibleCounts.fill(0);
		}
	}

	prepareAppear() {
		this._timeouts.forEach(clearTimeout);
		this._timeouts = [];
		this._setSlotsHiddenForAppear();
		this.onChange();
	}

	restoreVisible() {
		this.abort();
		this.onChange();
	}

	_schedule(fn, ms) {
		const id = setTimeout(() => {
			this._timeouts = this._timeouts.filter((timeoutId) => timeoutId !== id);
			fn();
		}, ms);
		this._timeouts.push(id);
		return id;
	}

	_incrementMainHidden(slot) {
		slot.mainHiddenCount += 1;
		this.onChange();
	}

	_decrementMainHidden(slot) {
		slot.mainHiddenCount = Math.max(0, slot.mainHiddenCount - 1);
		this.onChange();
	}

	_incrementVisible(slot, index) {
		slot.visibleCounts[index] += 1;
		this.onChange();
	}

	_decrementVisible(slot, index) {
		slot.visibleCounts[index] = Math.max(0, slot.visibleCounts[index] - 1);
		this.onChange();
	}

	/** Плавное появление основной буквы после glitch-символов. */
	_fadeMainLetterIn(slot, durationMs) {
		if (slot.isSpace || durationMs <= 0) {
			slot.mainAlpha = 1;
			this.onChange();
			return;
		}

		slot.mainAlpha = 0;
		const startedAt = performance.now();

		const tick = () => {
			const t = Math.min(1, (performance.now() - startedAt) / durationMs);
			slot.mainAlpha = t;
			this.onChange();

			if (t < 1) {
				this._schedule(tick, 16);
			} else {
				slot.mainAlpha = 1;
				this.onChange();
			}
		};

		this._schedule(tick, 0);
	}

	/**
	 * @param {GlitchLetterSlot} slot
	 * @param {number} startDelay
	 * @param {GlitchSnakeMode} mode
	 * @param {number} timeScale
	 * @param {ReturnType<typeof resolveSnakeTiming>} timing
	 */
	_animateSlot(slot, startDelay, mode, timeScale, timing) {
		if (slot.isSpace) {
			return;
		}

		this._schedule(
			() => {
				this._incrementMainHidden(slot);

				slot.replacements.forEach((_, index) => {
					this._schedule(
						() => {
							this._incrementVisible(slot, index);
							this._schedule(
								() => {
									this._decrementVisible(slot, index);
								},
								scaleMs(timing.delayBetweenSymbols, timeScale),
							);
						},
						scaleMs(index * timing.delayBetweenSymbols, timeScale),
					);
				});

				const glitchDuration = scaleMs(slot.replacements.length * timing.delayBetweenSymbols, timeScale);
				this._schedule(() => {
					if (mode === "hover" || mode === "appear") {
						this._decrementMainHidden(slot);
						slot.appearPending = false;
						if (mode === "appear") {
							this._fadeMainLetterIn(slot, scaleMs(timing.mainLetterFadeMs, timeScale));
						} else {
							slot.mainAlpha = 1;
							slot.hoverPassed = this._hoverHighlightEnabled;
							this.onChange();
						}
					}
				}, glitchDuration);
			},
			scaleMs(startDelay, timeScale),
		);
	}

	/**
	 * @param {GlitchSnakeMode} mode
	 * @param {{
	 *   timeBudgetMs?: number,
	 *   slowMotion?: number,
	 *   delayBetweenLetters?: number,
	 *   delayBetweenSymbols?: number,
	 *   mainLetterFadeMs?: number,
	 *   playSound?: boolean,
	 *   soundPan?: number,
	 * }} [options]
	 * @returns {number}
	 */
	run(mode, options = {}) {
		const timing = resolveSnakeTiming(options);
		this._hoverHighlightEnabled = mode === "hover";
		if (mode === "hover") {
			for (const slot of this.slots) {
				if (!slot.isSpace) {
					slot.hoverPassed = false;
				}
			}
		}

		// hover: как в HTML — не отменять прошлую змейку, счётчики mainHidden/visible сами сходятся.
		if (mode !== "hover") {
			this._timeouts.forEach(clearTimeout);
			this._timeouts = [];
			// appear: prepareAppear сам выставит скрытое состояние без кадра «всё видно».
			if (mode !== "appear") {
				for (const slot of this.slots) {
					resetSlotRuntime(slot);
				}
			}
		}

		const letterSlots = this.slots.filter((slot) => !slot.isSpace);
		const snakeLength = getSnakeLength(letterSlots.length);
		const naturalDuration = getTotalSnakeDuration(letterSlots, snakeLength, 1, timing);
		const timeScale = resolveGlitchSnakeTimeScale(naturalDuration, options);

		if (mode === "appear") {
			this.prepareAppear();
		}

		letterSlots.forEach((slot, containerIndex) => {
			const additionalCount = slot.replacements.length;
			const startDelay = getLetterStartDelay(containerIndex, snakeLength, additionalCount, timing);
			this._animateSlot(slot, startDelay, mode, timeScale, timing);
		});

		const durationMs = getTotalSnakeDuration(letterSlots, snakeLength, timeScale, timing);

		if (durationMs > 0 && mode === "hover" && options.playSound !== false) {
			playGlitchTextSound(durationMs, "hover", options.soundPan);
		}

		return durationMs;
	}

	clearHoverPassed() {
		this._hoverHighlightEnabled = false;
		let changed = false;
		for (const slot of this.slots) {
			if (!slot.isSpace && slot.hoverPassed) {
				slot.hoverPassed = false;
				changed = true;
			}
		}
		if (changed) {
			this.onChange();
		}
	}
}

export { getGlitchReplacements, createGlitchTextSlots };
