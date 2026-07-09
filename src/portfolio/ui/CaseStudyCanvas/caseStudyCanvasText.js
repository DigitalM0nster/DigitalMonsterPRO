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

function createWrapUnits(text) {
	if (CJK_CHARACTER_RE.test(text)) {
		return {
			separator: "",
			units: Array.from(text.trim()).filter((character) => !/\s/u.test(character)),
		};
	}

	return {
		separator: " ",
		units: text.split(/\s+/u).filter(Boolean),
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
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} maxWidth
 * @param {number} lineHeight
 * @param {number} letterSpacingPx
 */
export function measureSpacedTitleHeight(ctx, text, maxWidth, lineHeight, letterSpacingPx) {
	const segments = text.split("\n");
	let height = 0;

	for (const segment of segments) {
		const lines = wrapTextLinesWithSpacing(ctx, segment.toUpperCase(), maxWidth, letterSpacingPx);
		height += Math.max(lineHeight, lines.length * lineHeight);
	}

	return height;
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
	const segments = text.split("\n");
	let cursorY = y;

	for (const segment of segments) {
		const lines = wrapTextLinesWithSpacing(ctx, segment.toUpperCase(), maxWidth, letterSpacingPx);
		for (const line of lines) {
			fillTextWithSpacing(ctx, line, x, cursorY, letterSpacingPx);
			cursorY += lineHeight;
		}
	}

	return cursorY - y;
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
