/** HUD-заголовки, метки, дуга — техно-стиль. */
export const CASE_STUDY_DISPLAY_FONT = 'ManifoldExtended, "Segoe UI", system-ui, sans-serif';

/** Основной читаемый текст — Jura, как subtitle / hint на главной. */
export const CASE_STUDY_BODY_FONT = 'Jura, "Segoe UI", system-ui, sans-serif';

/** @deprecated Используйте CASE_STUDY_DISPLAY_FONT или CASE_STUDY_BODY_FONT. */
export const CASE_STUDY_FONT = CASE_STUDY_DISPLAY_FONT;

/** Типичные начертания левой панели — грузим до первого ctx.font / measureText. */
const CASE_STUDY_FONT_LOAD_SPECS = [
	"300 32px ManifoldExtended",
	"300 40px ManifoldExtended",
	"300 46px ManifoldExtended",
	"500 11px ManifoldExtended",
	"500 13px ManifoldExtended",
	"400 13px Jura",
	"400 12px Jura",
	"400 11px Jura",
];

let caseStudyFontsPromise = null;

/**
 * Canvas не перерисовывается при подгрузке @font-face — без await первый кадр
 * рисуется fallback (Segoe UI), после HMR шрифты уже в кэше и всё «чинится».
 */
export function ensureCaseStudyCanvasFonts() {
	if (caseStudyFontsPromise) {
		return caseStudyFontsPromise;
	}

	caseStudyFontsPromise = (async () => {
		if (typeof document === "undefined" || !document.fonts?.load) {
			return;
		}

		try {
			await Promise.all(CASE_STUDY_FONT_LOAD_SPECS.map((spec) => document.fonts.load(spec)));
			if (document.fonts.ready) {
				await document.fonts.ready;
			}
		} catch {
			// Fallback на system-ui в canvas.
		}
	})();

	return caseStudyFontsPromise;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} letterSpacingPx
 */
export function measureTextWithSpacing(ctx, text, letterSpacingPx) {
	let width = 0;
	for (let index = 0; index < text.length; index += 1) {
		width += ctx.measureText(text[index]).width;
		if (index < text.length - 1) {
			width += letterSpacingPx;
		}
	}
	return width;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} x
 * @param {number} y
 * @param {number} letterSpacingPx
 */
export function fillTextWithSpacing(ctx, text, x, y, letterSpacingPx) {
	let cursorX = x;
	for (let index = 0; index < text.length; index += 1) {
		const char = text[index];
		ctx.fillText(char, cursorX, y);
		cursorX += ctx.measureText(char).width + letterSpacingPx;
	}
}

const CJK_CHARACTER_RE = /[\u2e80-\u2eff\u3000-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u;
const CJK_LINE_START_FORBIDDEN_RE = /^[、。，．！？；：）》」』】〕〉》）］｝…—]/u;
const CJK_LINE_END_FORBIDDEN_RE = /[（《「『【〔〈“‘]$/u;

/** Short particles that must not end a line — glued to the following word(s). */
const HANGING_PARTICLES = new Set([
	// ru
	"а", "и", "но", "да", "или", "либо", "ни", "то", "чем", "что", "как",
	"в", "во", "к", "ко", "с", "со", "у", "о", "об", "обо", "от", "до", "по", "на", "за",
	"из", "изо", "под", "над", "при", "про", "без", "для", "через", "между", "перед", "после",
	"не", "же", "ли", "бы",
	// en
	"a", "an", "the", "and", "or", "but", "nor", "of", "to", "in", "on", "at", "for", "by", "as",
	"with", "from", "into", "onto", "over", "under", "via", "per", "vs",
	// de
	"und", "oder", "aber", "in", "im", "am", "an", "auf", "aus", "bei", "mit", "nach", "von", "zu",
	"zum", "zur", "für", "über", "dem", "den", "der", "des", "die", "das",
	// fr
	"et", "ou", "à", "au", "aux", "de", "des", "du", "en", "la", "le", "les", "un", "une", "y",
	// es / it / pt (common shorts)
	"y", "e", "o", "u", "de", "del", "la", "el", "los", "las", "un", "una", "en", "a", "al",
	"con", "por", "para", "di", "da", "do", "das", "dos",
]);

/** Prefer at most this many title lines; shrink font when wrapping exceeds it. */
export const CASE_STUDY_TITLE_MAX_LINES = 3;

function normalizeHangToken(unit) {
	return String(unit ?? "")
		.replace(/^[«"'“‘(\[{«]+/u, "")
		.replace(/[,.;:!?…»"'”’)\]}]+$/u, "")
		.toLowerCase();
}

function isHangingParticle(unit) {
	const token = normalizeHangToken(unit);
	return token.length > 0 && token.length <= 6 && HANGING_PARTICLES.has(token);
}

/** «в мире» / «and the» stay one wrap unit so the particle cannot end a line. */
function glueHangingParticles(units) {
	const out = [];
	let index = 0;
	while (index < units.length) {
		if (isHangingParticle(units[index]) && index + 1 < units.length) {
			let glued = units[index];
			index += 1;
			while (index < units.length) {
				const next = units[index];
				glued += ` ${next}`;
				index += 1;
				if (!isHangingParticle(next) || index >= units.length) {
					break;
				}
			}
			out.push(glued);
			continue;
		}
		out.push(units[index]);
		index += 1;
	}
	return out;
}

function createWrapUnits(text) {
	if (CJK_CHARACTER_RE.test(text)) {
		return {
			separator: "",
			units: Array.from(text.trim()).filter((character) => !/\s/u.test(character)),
		};
	}

	const words = text.split(/\s+/u).filter(Boolean);
	return {
		separator: " ",
		units: glueHangingParticles(words),
	};
}

function wrapMeasuredText(text, maxWidth, measure) {
	const { units, separator } = createWrapUnits(text);
	if (units.length === 0) {
		return [];
	}

	const lines = [];
	let current = "";

	for (const unit of units) {
		const next = current ? `${current}${separator}${unit}` : unit;
		if (!current || measure(next) <= maxWidth) {
			current = next;
			continue;
		}

		if (separator === "" && CJK_LINE_START_FORBIDDEN_RE.test(unit)) {
			const currentCharacters = Array.from(current);
			const previousCharacter = currentCharacters.pop();
			if (currentCharacters.length > 0) {
				lines.push(currentCharacters.join(""));
				current = `${previousCharacter}${unit}`;
				continue;
			}
		}

		if (separator === "" && CJK_LINE_END_FORBIDDEN_RE.test(current)) {
			const currentCharacters = Array.from(current);
			const openingCharacter = currentCharacters.pop();
			if (currentCharacters.length > 0) {
				lines.push(currentCharacters.join(""));
				current = `${openingCharacter}${unit}`;
				continue;
			}
		}

		lines.push(current);
		current = unit;
	}

	if (current) {
		lines.push(current);
	}
	return lines;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} maxWidth
 */
export function wrapTextLines(ctx, text, maxWidth) {
	return wrapMeasuredText(text, maxWidth, (line) => ctx.measureText(line).width);
}

/**
 * Перенос строк с учётом letter-spacing (для заголовков).
 */
export function wrapTextLinesWithSpacing(ctx, text, maxWidth, letterSpacingPx) {
	return wrapMeasuredText(
		text,
		maxWidth,
		(line) => measureTextWithSpacing(ctx, line, letterSpacingPx),
	);
}

/**
 * All visual title lines after explicit \\n splits and width wrap.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} maxWidth
 * @param {number} letterSpacingPx
 */
export function getSpacedTitleLines(ctx, text, maxWidth, letterSpacingPx) {
	const lines = [];
	for (const segment of String(text ?? "").split("\n")) {
		const wrapped = wrapTextLinesWithSpacing(ctx, segment.toUpperCase(), maxWidth, letterSpacingPx);
		if (wrapped.length === 0) {
			lines.push("");
		} else {
			lines.push(...wrapped);
		}
	}
	return lines;
}

/**
 * Shrink title font until line count ≤ maxLines (or min size).
 * @param {CanvasRenderingContext2D} ctx
 * @param {{
 *   text: string,
 *   maxWidth: number,
 *   fontSize: number,
 *   fontWeight: number | string,
 *   fontFamily?: string,
 *   lineHeightMul: number,
 *   letterSpacingMul: number,
 *   maxLines?: number,
 *   minFontSize?: number,
 * }} opts
 */
export function resolveFittedSpacedTitle(ctx, opts) {
	const {
		text,
		maxWidth,
		fontSize,
		fontWeight,
		fontFamily = CASE_STUDY_DISPLAY_FONT,
		lineHeightMul,
		letterSpacingMul,
		maxLines = CASE_STUDY_TITLE_MAX_LINES,
		minFontSize,
	} = opts;

	const floor = Math.max(14, Math.round(minFontSize ?? fontSize * 0.62));
	let size = Math.max(floor, Math.round(fontSize));
	/** @type {{ fontSize: number, lineHeight: number, letterSpacing: number, lines: string[] }} */
	let best = {
		fontSize: size,
		lineHeight: size * lineHeightMul,
		letterSpacing: size * letterSpacingMul,
		lines: [""],
	};

	while (size >= floor) {
		const lineHeight = size * lineHeightMul;
		const letterSpacing = size * letterSpacingMul;
		ctx.font = `${fontWeight} ${size}px ${fontFamily}`;
		const lines = getSpacedTitleLines(ctx, text, maxWidth, letterSpacing);
		best = { fontSize: size, lineHeight, letterSpacing, lines };
		if (lines.length <= maxLines) {
			return best;
		}
		size -= 1;
	}

	return best;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {string[]} lines
 * @param {number} x
 * @param {number} y
 * @param {number} lineHeight
 * @param {number} letterSpacingPx
 */
export function drawSpacedTitleLines(ctx, lines, x, y, lineHeight, letterSpacingPx) {
	let cursorY = y;
	for (const line of lines) {
		fillTextWithSpacing(ctx, line, x, cursorY, letterSpacingPx);
		cursorY += lineHeight;
	}
	return cursorY - y;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} maxWidth
 * @param {number} lineHeight
 * @param {number} letterSpacingPx
 */
export function measureSpacedTitleHeight(ctx, text, maxWidth, lineHeight, letterSpacingPx) {
	const lines = getSpacedTitleLines(ctx, text, maxWidth, letterSpacingPx);
	return Math.max(lineHeight, lines.length * lineHeight);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} x
 * @param {number} y
 * @param {number} maxWidth
 * @param {number} lineHeight
 * @param {number} letterSpacingPx
 */
export function drawSpacedTitle(ctx, text, x, y, maxWidth, lineHeight, letterSpacingPx) {
	const lines = getSpacedTitleLines(ctx, text, maxWidth, letterSpacingPx);
	return drawSpacedTitleLines(ctx, lines, x, y, lineHeight, letterSpacingPx);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} x
 * @param {number} y
 * @param {number} maxWidth
 * @param {number} lineHeight
 * @param {number} [maxLines]
 */
export function fillWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 4) {
	const lines = wrapTextLines(ctx, text, maxWidth).slice(0, maxLines);
	lines.forEach((line, index) => {
		ctx.fillText(line, x, y + index * lineHeight);
	});
	return lines.length * lineHeight;
}

/**
 * Высота блока переноса без отрисовки.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} maxWidth
 * @param {number} lineHeight
 * @param {number} [maxLines]
 */
export function measureWrappedTextHeight(ctx, text, maxWidth, lineHeight, maxLines = Number.POSITIVE_INFINITY) {
	const lines = wrapTextLines(ctx, text, maxWidth);
	const limit = Number.isFinite(maxLines) ? Math.min(lines.length, maxLines) : lines.length;
	return Math.max(lineHeight, limit * lineHeight);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} x
 * @param {number} y
 * @param {number} maxWidth
 * @param {number} lineHeight
 * @param {number} maxHeight
 */
export function fillWrappedTextWithinHeight(ctx, text, x, y, maxWidth, lineHeight, maxHeight) {
	if (maxHeight <= 0) {
		return 0;
	}

	const maxLines = Math.max(1, Math.floor(maxHeight / lineHeight));
	return fillWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines);
}
