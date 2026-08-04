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
		/** @type {{ at: number, fn: () => void }[]} */
		this._scheduledEvents = [];
		this._scheduledEventTimer = 0;
		this._processingScheduledBatch = false;
		this._scheduledBatchChanged = false;
		/** @type {Map<GlitchLetterSlot, { startedAt: number, durationMs: number }>} */
		this._mainFades = new Map();
		this._mainFadeRaf = 0;
		/** @type {Set<() => void>} */
		this._idleResolvers = new Set();
		this._hoverHighlightEnabled = false;
	}

	/** @param {GlitchLetterSlot[]} slots */
	setSlots(slots) {
		this.slots = slots;
	}

	abort() {
		this._hoverHighlightEnabled = false;
		this._clearScheduledEvents();
		this._stopMainFades();
		for (const slot of this.slots) {
			resetSlotRuntime(slot);
		}
		try {
			this.onChange();
		} finally {
			this._resolveIdleWaiters();
		}
	}

	/** Змейка в процессе — ensureVisible не должен вызывать abort. */
	hasActiveAnimation() {
		return (
			this._scheduledEvents.length > 0 ||
			this._scheduledEventTimer !== 0 ||
			this._processingScheduledBatch ||
			this._mainFades.size > 0 ||
			this._mainFadeRaf !== 0
		);
	}

	/**
	 * Resolve when every scheduled event owned by the current snake has run.
	 * This is event-driven (no polling/rAF) and also resolves when the run is aborted.
	 */
	whenIdle() {
		if (!this.hasActiveAnimation()) {
			return Promise.resolve();
		}

		return new Promise((resolve) => {
			this._idleResolvers.add(resolve);
		});
	}

	_resolveIdleWaiters() {
		if (this.hasActiveAnimation() || this._idleResolvers.size === 0) {
			return;
		}

		const resolvers = [...this._idleResolvers];
		this._idleResolvers.clear();
		for (const resolve of resolvers) {
			resolve();
		}
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
		this._clearScheduledEvents();
		this._stopMainFades();
		this._setSlotsHiddenForAppear();
		try {
			this.onChange();
		} finally {
			this._resolveIdleWaiters();
		}
	}

	restoreVisible() {
		this.abort();
		this.onChange();
	}

	_clearScheduledEvents() {
		if (this._scheduledEventTimer) {
			clearTimeout(this._scheduledEventTimer);
			this._scheduledEventTimer = 0;
		}
		this._scheduledEvents.length = 0;
		this._scheduledBatchChanged = false;
	}

	_notifyChange() {
		if (this._processingScheduledBatch) {
			this._scheduledBatchChanged = true;
			return;
		}
		this.onChange();
	}

	_insertScheduledEvent(event) {
		let low = 0;
		let high = this._scheduledEvents.length;
		while (low < high) {
			const middle = (low + high) >>> 1;
			if (this._scheduledEvents[middle].at <= event.at) {
				low = middle + 1;
			} else {
				high = middle;
			}
		}
		this._scheduledEvents.splice(low, 0, event);
		return low;
	}

	_armScheduledEventTimer() {
		if (
			this._processingScheduledBatch ||
			this._scheduledEventTimer ||
			this._scheduledEvents.length === 0
		) {
			return;
		}
		const delayMs = Math.max(0, this._scheduledEvents[0].at - performance.now());
		this._scheduledEventTimer = setTimeout(() => {
			this._scheduledEventTimer = 0;
			this._flushScheduledEvents();
		}, delayMs);
	}

	_flushScheduledEvents() {
		this._processingScheduledBatch = true;
		this._scheduledBatchChanged = false;
		try {
			let now = performance.now();
			while (
				this._scheduledEvents.length > 0 &&
				this._scheduledEvents[0].at <= now + 0.5
			) {
				const event = this._scheduledEvents.shift();
				event.fn();
				now = performance.now();
			}
		} finally {
			this._processingScheduledBatch = false;
			if (this._scheduledBatchChanged) {
				this._scheduledBatchChanged = false;
				this.onChange();
			}
			this._armScheduledEventTimer();
			this._resolveIdleWaiters();
		}
	}

	_schedule(fn, ms) {
		const event = {
			at: performance.now() + Math.max(0, ms),
			fn,
		};
		const insertionIndex = this._insertScheduledEvent(event);
		if (insertionIndex === 0 && this._scheduledEventTimer && !this._processingScheduledBatch) {
			clearTimeout(this._scheduledEventTimer);
			this._scheduledEventTimer = 0;
		}
		this._armScheduledEventTimer();
		return event;
	}

	_stopMainFades() {
		if (this._mainFadeRaf) {
			cancelAnimationFrame(this._mainFadeRaf);
			this._mainFadeRaf = 0;
		}
		this._mainFades.clear();
	}

	_scheduleMainFadeFrame() {
		if (this._mainFadeRaf || this._mainFades.size === 0) {
			return;
		}

		this._mainFadeRaf = requestAnimationFrame((now) => {
			this._mainFadeRaf = 0;
			for (const [slot, fade] of this._mainFades) {
				const t = Math.min(1, Math.max(0, (now - fade.startedAt) / fade.durationMs));
				slot.mainAlpha = t;
				if (t >= 1) {
					slot.mainAlpha = 1;
					this._mainFades.delete(slot);
				}
			}
			try {
				this.onChange();
			} finally {
				if (this._mainFades.size > 0) {
					this._scheduleMainFadeFrame();
				} else {
					this._resolveIdleWaiters();
				}
			}
		});
	}

	_incrementMainHidden(slot) {
		slot.mainHiddenCount += 1;
		this._notifyChange();
	}

	_decrementMainHidden(slot) {
		slot.mainHiddenCount = Math.max(0, slot.mainHiddenCount - 1);
		this._notifyChange();
	}

	_incrementVisible(slot, index) {
		slot.visibleCounts[index] += 1;
		this._notifyChange();
	}

	_decrementVisible(slot, index) {
		slot.visibleCounts[index] = Math.max(0, slot.visibleCounts[index] - 1);
		this._notifyChange();
	}

	/** Плавное появление основной буквы после glitch-символов. */
	_fadeMainLetterIn(slot, durationMs) {
		if (slot.isSpace || durationMs <= 0) {
			slot.mainAlpha = 1;
			this._notifyChange();
			return;
		}

		slot.mainAlpha = 0;
		this._mainFades.set(slot, {
			startedAt: performance.now(),
			durationMs,
		});
		this._notifyChange();
		this._scheduleMainFadeFrame();
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
							this._notifyChange();
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
			this._clearScheduledEvents();
			this._stopMainFades();
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

		this._resolveIdleWaiters();
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
