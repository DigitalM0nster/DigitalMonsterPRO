import { createGlitchTextSlots } from "@/shared/glitchText/glitchLetterModel.js";
import {
	GlitchSnakeEngine,
	getSnakeLength,
	getTotalSnakeDuration,
	resolveGlitchSnakeTimeScale,
} from "@/shared/glitchText/glitchSnakeEngine.js";
import { playGlitchTextSound } from "@/sounds/soundDesign.js";
import { getHeroGlitchSnakeRunOptions } from "./heroTextGlitchConfig.js";

function normalizeLines(lines) {
	return (Array.isArray(lines) ? lines : [String(lines)])
		.map((line) => line.trim())
		.filter(Boolean);
}

function createLineGroup(lineText, uppercase, onRedraw) {
	const engine = new GlitchSnakeEngine(onRedraw);
	const slots = createGlitchTextSlots(lineText, uppercase);
	engine.setSlots(slots);
	return { engine, slots };
}

function estimateGroupSnakeDuration(slots, runOptions) {
	const timing = {
		delayBetweenLetters: runOptions.delayBetweenLetters,
		delayBetweenSymbols: runOptions.delayBetweenSymbols,
		mainLetterFadeMs: runOptions.mainLetterFadeMs,
	};
	const letterSlots = slots.filter((slot) => !slot.isSpace);
	const snakeLength = getSnakeLength(letterSlots.length);
	const naturalDuration = getTotalSnakeDuration(letterSlots, snakeLength, 1, timing);
	const timeScale = resolveGlitchSnakeTimeScale(naturalDuration, runOptions);
	return getTotalSnakeDuration(letterSlots, snakeLength, timeScale, timing);
}

/** Фазы runLanguageSwitch — для синхронизации линии под названием компании. */
export function estimateLanguageSwitchPhases(primaryGroups, nextLines, options = {}) {
	const runOptions = getHeroGlitchSnakeRunOptions(options);
	const uppercase = options.uppercase ?? false;
	const nextNormalized = normalizeLines(nextLines);

	const disappearDurationMs = Math.max(
		0,
		...primaryGroups.map((group) => estimateGroupSnakeDuration(group.slots, runOptions)),
	);

	const overlapRatio = Math.max(0, Math.min(1, runOptions.appearOverlapRatio ?? 0.5));
	const appearDelayMs = Math.round(disappearDurationMs * overlapRatio);

	const appearDurations = nextNormalized.map((line) => {
		const slots = createGlitchTextSlots(line, uppercase);
		return estimateGroupSnakeDuration(slots, runOptions);
	});
	const appearDurationMs = Math.max(0, ...appearDurations, 0);

	return {
		disappearDurationMs,
		appearDelayMs,
		appearDurationMs,
		totalDurationMs: appearDelayMs + appearDurationMs,
	};
}

/** Оценка полной длительности runLanguageSwitch без запуска анимации. */
export function estimateLanguageSwitchDuration(primaryGroups, nextLines, options = {}) {
	return estimateLanguageSwitchPhases(primaryGroups, nextLines, options).totalDurationMs;
}

/**
 * Змейка для hero canvas-текста.
 * При смене языка — disappear старого + appear нового с перекрытием (как HTML GlitchBilingualText).
 */
export class HeroTextGlitchController {
	/** @param {{ uppercase?: boolean, onRedraw?: () => void }} options */
	constructor({ uppercase = false, onRedraw } = {}) {
		this.uppercase = uppercase;
		this.onRedraw = onRedraw ?? (() => {});
		/** @type {{ engine: GlitchSnakeEngine, slots: import('@/shared/glitchText/glitchSnakeEngine.js').GlitchLetterSlot[] }[]} */
		this.primaryGroups = [];
		/** @type {{ engine: GlitchSnakeEngine, slots: import('@/shared/glitchText/glitchSnakeEngine.js').GlitchLetterSlot[] }[] | null} */
		this.secondaryGroups = null;
		/** @type {ReturnType<typeof setTimeout>[]} */
		this._switchTimeouts = [];
	}

	setText(lines) {
		this._clearSwitchTimeouts();
		this.secondaryGroups = null;
		this.primaryGroups = normalizeLines(lines).map((line) =>
			createLineGroup(line, this.uppercase, () => this.onRedraw()),
		);
		this.onRedraw();
	}

	/** @param {string[]} lines @param {ReturnType<typeof getHeroGlitchSnakeRunOptions>} [options] */
	runLanguageSwitch(lines, options = {}) {
		return new Promise((resolve) => {
			this._clearSwitchTimeouts();
			this._switchResolve = resolve;

			const runOptions = getHeroGlitchSnakeRunOptions(options);
			const timing = {
				delayBetweenLetters: runOptions.delayBetweenLetters,
				delayBetweenSymbols: runOptions.delayBetweenSymbols,
				mainLetterFadeMs: runOptions.mainLetterFadeMs,
			};

			const nextLines = normalizeLines(lines);
			this.secondaryGroups = nextLines.map((line) => {
				const group = createLineGroup(line, this.uppercase, () => this.onRedraw());
				// Как HTML setLanguageGroupLettersVisible(toGroup, false) — новый текст скрыт до appear.
				group.engine.prepareAppear();
				return group;
			});

			const disappearDuration = Math.max(
				0,
				...this.primaryGroups.map((group) => group.engine.run("disappear", runOptions)),
			);
			const overlapRatio = Math.max(0, Math.min(1, runOptions.appearOverlapRatio ?? 0.5));
			const appearDelay = Math.round(disappearDuration * overlapRatio);

			const appearDurations = this.secondaryGroups.map((group) => {
				const letterSlots = group.slots.filter((slot) => !slot.isSpace);
				const snakeLength = getSnakeLength(letterSlots.length);
				const naturalDuration = getTotalSnakeDuration(letterSlots, snakeLength, 1, timing);
				const timeScale = resolveGlitchSnakeTimeScale(naturalDuration, runOptions);
				return getTotalSnakeDuration(letterSlots, snakeLength, timeScale, timing);
			});
			const appearDuration = Math.max(0, ...appearDurations, 0);
			const totalDuration = appearDelay + appearDuration;

			if (runOptions.playSound !== false && totalDuration > 0) {
				playGlitchTextSound(totalDuration, "hover");
			}

			const startAppearId = setTimeout(() => {
				for (const group of this.secondaryGroups ?? []) {
					group.engine.run("appear", runOptions);
				}

				const finishId = setTimeout(() => {
					for (const group of this.primaryGroups) {
						group.engine.abort();
					}
					this.primaryGroups = this.secondaryGroups ?? [];
					this.secondaryGroups = null;
					this.onRedraw();
					this._finishSwitch();
				}, appearDuration);
				this._switchTimeouts.push(finishId);
			}, appearDelay);
			this._switchTimeouts.push(startAppearId);
		});
	}

	_finishSwitch() {
		this._switchResolve?.();
		this._switchResolve = null;
	}

	_clearSwitchTimeouts() {
		this._switchTimeouts.forEach(clearTimeout);
		this._switchTimeouts = [];
	}

	dispose() {
		this._clearSwitchTimeouts();
		this._finishSwitch();
		for (const group of this.primaryGroups) {
			group.engine.abort();
		}
		for (const group of this.secondaryGroups ?? []) {
			group.engine.abort();
		}
		this.primaryGroups = [];
		this.secondaryGroups = null;
	}
}
