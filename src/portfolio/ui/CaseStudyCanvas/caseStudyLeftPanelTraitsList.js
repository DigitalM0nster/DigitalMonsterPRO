import { CASE_STUDY_BODY_FONT, fillWrappedText, measureWrappedTextHeight } from "./caseStudyCanvasText.js";

const MAX_ROWS = 3;

/**
 * @param {{ label: string, value: string }} metric
 */
export function parseTraitMetricRow(metric) {
	const label = (metric.label ?? "").trim();
	const value = (metric.value ?? "").trim();
	const numberMatch = value.match(/^(\d+)\s+(.+)$/);

	if (numberMatch) {
		return {
			glyphType: "number",
			glyph: numberMatch[1],
			topText: numberMatch[2],
			bottomText: label,
		};
	}

	return {
		glyphType: "icon",
		glyph: null,
		topText: label,
		bottomText: value,
	};
}

/**
 * @param {typeof import('./caseStudyLeftPanelConfig.js').caseStudyLeftPanelConfig} cfg
 */
function rowTypography(cfg) {
	return {
		glyphSize: cfg.traitListGlyphSize ?? 46,
		topSize: cfg.traitListTopSize ?? 12,
		bottomSize: cfg.traitListBottomSize ?? 11,
		rowPadY: cfg.traitListRowPadY ?? 16,
		glyphColW: cfg.traitListGlyphColW ?? 52,
		textGap: cfg.traitListTextGap ?? 3,
		iconScale: cfg.traitListIconScale ?? 0.62,
		numberAlignX: cfg.traitListNumberAlignX ?? 20,
		iconAlignX: cfg.traitListIconAlignX ?? (cfg.traitListGlyphColW ?? 52) * 0.38,
	};
}

function measureTraitTextBlock(ctx, row, textW, typo) {
	const topLineH = typo.topSize * 1.2;
	const bottomLineH = typo.bottomSize * 1.25;

	ctx.font = `400 ${typo.topSize}px ${CASE_STUDY_BODY_FONT}`;
	const topH = measureWrappedTextHeight(ctx, row.topText, textW, topLineH, 2);

	ctx.font = `400 ${typo.bottomSize}px ${CASE_STUDY_BODY_FONT}`;
	const bottomH = measureWrappedTextHeight(ctx, row.bottomText, textW, bottomLineH, 3);

	return { topH, bottomH, textBlockH: topH + typo.textGap + bottomH };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} size
 * @param {typeof import('./caseStudyCanvasTheme.js').CASE_STUDY_CANVAS_THEME} theme
 */
function drawFormatGlyph(ctx, cx, cy, size, theme) {
	const half = size * 0.24;
	const arm = size * 0.15;

	ctx.save();
	ctx.strokeStyle = theme.cyan;
	ctx.lineWidth = 1;
	ctx.shadowColor = theme.cyanGlow;
	ctx.shadowBlur = 5;

	const corners = [
		[-half, -half],
		[half, -half],
		[-half, half],
		[half, half],
	];

	for (const [ox, oy] of corners) {
		ctx.beginPath();
		ctx.moveTo(cx + ox, cy + oy + (oy < 0 ? arm : -arm));
		ctx.lineTo(cx + ox, cy + oy);
		ctx.lineTo(cx + ox + (ox < 0 ? arm : -arm), cy + oy);
		ctx.stroke();
	}

	ctx.shadowBlur = 0;
	ctx.font = `400 ${Math.round(size * 0.32)}px ${CASE_STUDY_BODY_FONT}`;
	ctx.fillStyle = theme.cyan;
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillText("+", cx, cy);
	ctx.restore();
}

function drawTraitDivider(ctx, x, y, width, theme) {
	ctx.strokeStyle = theme.line;
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(x, y);
	ctx.lineTo(x + width, y);
	ctx.stroke();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {{ label: string, value: string }[]} metrics
 * @param {typeof import('./caseStudyLeftPanelConfig.js').caseStudyLeftPanelConfig} cfg
 */
export function measureTraitsListBlockHeight(ctx, width, metrics, cfg) {
	const rows = metrics.slice(0, MAX_ROWS).map(parseTraitMetricRow);
	if (rows.length === 0) {
		return 0;
	}

	const typo = rowTypography(cfg);
	const textW = Math.max(1, width - typo.glyphColW);
	let height = cfg.gapBeforeStatsRail;

	for (const row of rows) {
		const { textBlockH } = measureTraitTextBlock(ctx, row, textW, typo);
		height += Math.max(typo.glyphSize, textBlockH) + typo.rowPadY * 2;
	}

	return height;
}

/**
 * Вертикальный список метрик — как в макете nipigas.
 */
export function drawTraitsList(ctx, x, y, width, metrics, theme, cfg) {
	const rows = metrics.slice(0, MAX_ROWS).map(parseTraitMetricRow);
	if (rows.length === 0) {
		return 0;
	}

	const typo = rowTypography(cfg);
	const textX = x + typo.glyphColW;
	const textW = Math.max(1, width - typo.glyphColW);
	let cursorY = y + cfg.gapBeforeStatsRail;

	ctx.save();
	ctx.textAlign = "left";
	ctx.textBaseline = "top";

	for (let index = 0; index < rows.length; index += 1) {
		const row = rows[index];
		const rowTop = cursorY;

		if (index > 0) {
			drawTraitDivider(ctx, x, rowTop, width, theme);
		}

		const { topH, textBlockH } = measureTraitTextBlock(ctx, row, textW, typo);
		const rowContentH = Math.max(typo.glyphSize, textBlockH);
		const rowH = rowContentH + typo.rowPadY * 2;
		const blockY = rowTop + typo.rowPadY + (rowContentH - textBlockH) / 2;
		const glyphY = rowTop + typo.rowPadY + (rowContentH - typo.glyphSize) / 2;

		if (row.glyphType === "number" && row.glyph) {
			ctx.font = `300 ${typo.glyphSize}px ${CASE_STUDY_BODY_FONT}`;
			ctx.fillStyle = theme.cyan;
			ctx.textBaseline = "top";
			ctx.textAlign = "center";
			ctx.fillText(row.glyph, x + typo.numberAlignX, glyphY);
		} else {
			const iconSize = typo.glyphSize * typo.iconScale;
			drawFormatGlyph(ctx, x + typo.iconAlignX, glyphY + typo.glyphSize * 0.48, iconSize, theme);
		}

		ctx.textBaseline = "top";
		ctx.font = `400 ${typo.topSize}px ${CASE_STUDY_BODY_FONT}`;
		ctx.textAlign = "left";
		ctx.fillStyle = theme.cyan;
		fillWrappedText(ctx, row.topText, textX, blockY, textW, typo.topSize * 1.2, 2);

		ctx.font = `400 ${typo.bottomSize}px ${CASE_STUDY_BODY_FONT}`;
		ctx.fillStyle = theme.textMuted;
		fillWrappedText(ctx, row.bottomText, textX, blockY + topH + typo.textGap, textW, typo.bottomSize * 1.25, 3);

		cursorY += rowH;
	}

	ctx.restore();

	return cursorY - y;
}
