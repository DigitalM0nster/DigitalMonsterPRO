import {
	CASE_STUDY_BODY_FONT,
	CASE_STUDY_DISPLAY_FONT,
	fillTextWithSpacing,
	fillWrappedText,
	measureWrappedTextHeight,
} from "./caseStudyCanvasText.js";

const MAX_STATS = 3;

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ label: string, value: string }} cell
 * @param {number} cellInnerW
 * @param {typeof import('./caseStudyLeftPanelConfig.js').caseStudyLeftPanelConfig} cfg
 * @param {boolean} valueFirst
 */
function measureStatsCellHeight(ctx, cell, cellInnerW, cfg, valueFirst) {
	const primaryLabel = cell.label ?? "";
	const primaryValue = cell.value ?? "";
	const topText = valueFirst ? primaryValue : primaryLabel;
	const bottomText = valueFirst ? primaryLabel : primaryValue;

	const topFontSize = valueFirst ? cfg.statsRailValueFontSize : cfg.statsRailLabelFontSize;
	const bottomFontSize = valueFirst ? cfg.statsRailLabelFontSize : cfg.statsRailValueFontSize;
	const topLineH = topFontSize * 1.12;
	const bottomLineH = bottomFontSize * 1.22;

	ctx.font = `500 ${topFontSize}px ${valueFirst ? CASE_STUDY_BODY_FONT : CASE_STUDY_DISPLAY_FONT}`;
	const topH = valueFirst
		? measureWrappedTextHeight(ctx, topText, cellInnerW, topLineH, 2)
		: topLineH;

	ctx.font = `400 ${bottomFontSize}px ${CASE_STUDY_BODY_FONT}`;
	const bottomH = measureWrappedTextHeight(ctx, bottomText, cellInnerW, bottomLineH, 3);

	return topH + cfg.statsRailLabelGap + bottomH;
}

/**
 * @param {typeof import('./caseStudyLeftPanelConfig.js').caseStudyLeftPanelConfig} cfg
 * @param {number} metricsCount
 * @param {number} [maxCellHeight]
 */
export function measureStatsRailHeight(cfg, metricsCount, maxCellHeight = 0) {
	if (metricsCount <= 0) {
		return 0;
	}

	const contentH =
		maxCellHeight > 0
			? maxCellHeight
			: cfg.statsRailValueFontSize + cfg.statsRailLabelGap + cfg.statsRailLabelFontSize;

	return cfg.gapBeforeStatsRail + cfg.statsRailPadY + contentH + cfg.statsRailPadY + 1;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {{ label: string, value: string }[]} metrics
 * @param {typeof import('./caseStudyLeftPanelConfig.js').caseStudyLeftPanelConfig} cfg
 * @param {{ valueFirst?: boolean }} [options]
 */
export function measureStatsRailBlockHeight(ctx, width, metrics, cfg, options = {}) {
	const cells = metrics.slice(0, MAX_STATS);
	if (cells.length === 0) {
		return 0;
	}

	const valueFirst = Boolean(options.valueFirst);
	const cellW = width / cells.length;
	const cellPad = cfg.statsRailCellPadX;
	let maxCellH = 0;

	for (const cell of cells) {
		const cellInnerW = Math.max(1, cellW - cellPad * 2);
		maxCellH = Math.max(maxCellH, measureStatsCellHeight(ctx, cell, cellInnerW, cfg, valueFirst));
	}

	return measureStatsRailHeight(cfg, cells.length, maxCellH);
}

/**
 * Горизонтальная рельса: акцентная линия + ячейки с переносом длинных подписей.
 */
export function drawStatsRail(ctx, x, y, width, metrics, theme, cfg, options = {}) {
	const cells = metrics.slice(0, MAX_STATS);
	if (cells.length === 0) {
		return 0;
	}

	const valueFirst = Boolean(options.valueFirst);
	const railY = y + cfg.gapBeforeStatsRail;
	const contentY = railY + 1 + cfg.statsRailPadY;
	const labelSpacing = cfg.statsRailLabelFontSize * cfg.statsRailLabelLetterSpacing;
	const cellW = width / cells.length;
	const cellPad = cfg.statsRailCellPadX;

	let maxCellH = 0;
	for (const cell of cells) {
		const cellInnerW = Math.max(1, cellW - cellPad * 2);
		maxCellH = Math.max(maxCellH, measureStatsCellHeight(ctx, cell, cellInnerW, cfg, valueFirst));
	}

	ctx.save();

	const dividerBottom = contentY + maxCellH + 2;

	for (let index = 1; index < cells.length; index += 1) {
		const dividerX = x + cellW * index;
		ctx.strokeStyle = theme.line;
		ctx.beginPath();
		ctx.moveTo(dividerX, contentY - 2);
		ctx.lineTo(dividerX, dividerBottom);
		ctx.stroke();
	}

	for (let index = 0; index < cells.length; index += 1) {
		const cellX = x + cellW * index + cellPad;
		const cellInnerW = Math.max(1, cellW - cellPad * 2);
		const primaryLabel = cells[index].label ?? "";
		const primaryValue = cells[index].value ?? "";
		const topText = valueFirst ? primaryValue : primaryLabel;
		const bottomText = valueFirst ? primaryLabel : primaryValue;

		const topFontSize = valueFirst ? cfg.statsRailValueFontSize : cfg.statsRailLabelFontSize;
		const bottomFontSize = valueFirst ? cfg.statsRailLabelFontSize : cfg.statsRailValueFontSize;
		const topLineH = topFontSize * 1.12;
		const bottomLineH = bottomFontSize * 1.22;

		ctx.textAlign = "left";
		ctx.textBaseline = "top";

		ctx.font = `500 ${topFontSize}px ${valueFirst ? CASE_STUDY_BODY_FONT : CASE_STUDY_DISPLAY_FONT}`;
		ctx.fillStyle = valueFirst ? theme.text : theme.textDim;
		let topBlockH = 0;
		if (valueFirst) {
			topBlockH = fillWrappedText(ctx, topText, cellX, contentY, cellInnerW, topLineH, 2);
		} else {
			fillTextWithSpacing(ctx, topText.toUpperCase(), cellX, contentY, labelSpacing);
			topBlockH = topLineH;
		}

		ctx.font = `400 ${bottomFontSize}px ${CASE_STUDY_BODY_FONT}`;
		ctx.fillStyle = theme.textMuted;
		fillWrappedText(
			ctx,
			bottomText,
			cellX,
			contentY + topBlockH + cfg.statsRailLabelGap,
			cellInnerW,
			bottomLineH,
			3,
		);
	}

	ctx.restore();

	return measureStatsRailHeight(cfg, cells.length, maxCellH);
}
