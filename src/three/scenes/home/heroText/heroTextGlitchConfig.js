/**
 * Змейка смены языка hero canvas-текстов (subtitle + stack).
 * Live-tune: dev-панель 6 → «Змейка смены языка».
 */
import { isCjkChar } from "@/shared/glitchText/glitchLetterModel.js";

export const heroTextGlitchConfig = {
	/** >1 — медленнее (4 = в 4 раза дольше). */
	slowMotion: 1,
	/** Задержка между буквами в волне, ms. */
	delayBetweenLetters: 40,
	/** Задержка между glitch-символами одной буквы, ms. */
	delayBetweenSymbols: 40,
	/** Fade-in основной буквы после appear, ms. */
	mainLetterFadeMs: 10,
	/** Когда стартует appear: доля от длительности disappear (0.9 = почти в конце disappear). */
	appearOverlapRatio: 0.9,
	playSound: true,
	/** Яркость cyan glitch-символов (canvas halo / neon fringe). */
	replacementGlowStrength: 1.6,
	/**
	 * Множитель яркости glitch-символов в шейдере для site bloom (threshold ≈ 1).
	 */
	replacementBloomBoost: 4.5,
	/** Цвет HDR-bloom glitch-символов (hex). */
	replacementBloomColor: "#009dff",

	/** Шрифт glitch-символов (отдельно от Jura/Aquire основного текста). */
	replacementFontFamily: 'ManifoldExtended, "Segoe UI"',
	replacementFontWeight: 400,
	/** Смещение glitch-символа по Y (em от fontSize), отдельно по регистру. */
	uppercaseReplacementOffsetYEm: 0.09,
	lowercaseReplacementOffsetYEm: -0.11,

	/** Масштаб glitch-символа относительно основного fontSize (заглавная буква). */
	uppercaseReplacementScaleX: 0.68,
	uppercaseReplacementScaleY: 1,
	/** Масштаб для строчной буквы. */
	lowercaseReplacementScaleX: 0.74,
	lowercaseReplacementScaleY: 1,

	/** Glitch-символы поверх китайского иероглифа (ширина ячейки больше латиницы). */
	cjkReplacementOffsetYEm: 0.08,
	cjkReplacementScaleX: 1,
	cjkReplacementScaleY: 1.3,
};

/** Строчная латиница / кириллица — не путать с CJK и цифрами. */
export function isLowercaseSourceChar(char) {
	return char.length === 1 && char === char.toLowerCase() && char !== char.toUpperCase();
}

/** @param {string} sourceChar @param {typeof heroTextGlitchConfig} [config] */
export function resolveHeroReplacementMetrics(sourceChar, config = heroTextGlitchConfig) {
	if (isCjkChar(sourceChar)) {
		return {
			isLower: false,
			isCjk: true,
			scaleX: config.cjkReplacementScaleX,
			scaleY: config.cjkReplacementScaleY,
			offsetYEm: config.cjkReplacementOffsetYEm,
		};
	}

	const isLower = isLowercaseSourceChar(sourceChar);
	return {
		isLower,
		isCjk: false,
		scaleX: isLower ? config.lowercaseReplacementScaleX : config.uppercaseReplacementScaleX,
		scaleY: isLower ? config.lowercaseReplacementScaleY : config.uppercaseReplacementScaleY,
		offsetYEm: isLower ? config.lowercaseReplacementOffsetYEm : config.uppercaseReplacementOffsetYEm,
	};
}

/** Glitch-таблица в uppercase — для строчной основы показываем строчные латинские замены. */
export function resolveHeroReplacementDisplayChar(replacement, sourceChar) {
	if (isLowercaseSourceChar(sourceChar) && /^[A-Za-z]+$/.test(replacement)) {
		return replacement.toLowerCase();
	}
	return replacement;
}

/** @param {Partial<typeof heroTextGlitchConfig>} [overrides] */
export function getHeroGlitchSnakeRunOptions(overrides = {}) {
	const cfg = heroTextGlitchConfig;
	return {
		slowMotion: overrides.slowMotion ?? cfg.slowMotion,
		delayBetweenLetters: overrides.delayBetweenLetters ?? cfg.delayBetweenLetters,
		delayBetweenSymbols: overrides.delayBetweenSymbols ?? cfg.delayBetweenSymbols,
		mainLetterFadeMs: overrides.mainLetterFadeMs ?? cfg.mainLetterFadeMs,
		appearOverlapRatio: overrides.appearOverlapRatio ?? cfg.appearOverlapRatio,
		playSound: overrides.playSound ?? cfg.playSound,
		timeBudgetMs: overrides.timeBudgetMs,
	};
}

/** HDR-bloom для canvas glitch-символов (subtitle + stack). */
export function applyHeroGlitchShaderUniforms(material) {
	const uniforms = material?.uniforms;
	if (!uniforms?.uReplacementBloomBoost) {
		return;
	}
	const cfg = heroTextGlitchConfig;
	uniforms.uReplacementBloomBoost.value = cfg.replacementBloomBoost;
	if (uniforms.uReplacementBloomTint) {
		uniforms.uReplacementBloomTint.value.set(cfg.replacementBloomColor);
	}
}
