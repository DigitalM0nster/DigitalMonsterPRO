import { glitchLetterReplacements } from "@/components/HTML/glitchLetterReplacements.js";

/** Латинские ключи таблицы glitch — для CJK подставляем те же английские символы. */
const LATIN_GLITCH_KEYS = Object.keys(glitchLetterReplacements).filter((key) => /^[A-Z]$/.test(key));

/** @param {string} char */
export function isCjkChar(char) {
	if (!char || char.length === 0) {
		return false;
	}

	const code = char.codePointAt(0) ?? 0;
	return (
		(code >= 0x4e00 && code <= 0x9fff) ||
		(code >= 0x3400 && code <= 0x4dbf) ||
		(code >= 0xf900 && code <= 0xfaff)
	);
}

/** Иероглиф → три латинских glitch-символа (как у A/B/C в таблице). */
function getCjkGlitchReplacements(char) {
	const code = char.codePointAt(0) ?? 0;
	const latinKey = LATIN_GLITCH_KEYS[code % LATIN_GLITCH_KEYS.length] ?? "A";
	return glitchLetterReplacements[latinKey] ?? "EOA";
}

export function getGlitchReplacements(letter) {
	if (letter === " ") {
		return " ";
	}

	if (isCjkChar(letter)) {
		return getCjkGlitchReplacements(letter);
	}

	const latinKey = letter.toUpperCase();
	return glitchLetterReplacements[latinKey] ?? glitchLetterReplacements[letter] ?? "XY";
}

/**
 * @param {string} text
 * @param {boolean} [uppercase]
 * @returns {import('./glitchSnakeEngine.js').GlitchLetterSlot[]}
 */
export function createGlitchTextSlots(text, uppercase = true) {
	const value = uppercase ? String(text).toUpperCase() : String(text);

	return value.split("").map((char) => {
		if (char === " ") {
			return { isSpace: true, char: " " };
		}

		const replacements = getGlitchReplacements(char)
			.split("")
			.filter((symbol) => symbol !== " ");

		return {
			isSpace: false,
			char,
			replacements,
			mainHiddenCount: 0,
			appearPending: false,
			/** 0…1 — fade-in основной буквы после змейки (HTML .mainLetter transition). */
			mainAlpha: 1,
			hoverPassed: false,
			visibleCounts: replacements.map(() => 0),
		};
	});
}

/** @param {import('./glitchSnakeEngine.js').GlitchLetterSlot} slot */
export function isGlitchMainHidden(slot) {
	return !slot.isSpace && (slot.mainHiddenCount > 0 || slot.appearPending);
}

/** @param {import('./glitchSnakeEngine.js').GlitchLetterSlot} slot */
export function getGlitchMainDrawAlpha(slot) {
	if (slot.isSpace || isGlitchMainHidden(slot)) {
		return 0;
	}

	return slot.mainAlpha ?? 1;
}

/** @param {import('./glitchSnakeEngine.js').GlitchLetterSlot} slot @param {number} index */
export function isGlitchReplacementVisible(slot, index) {
	return !slot.isSpace && (slot.visibleCounts[index] ?? 0) > 0;
}
