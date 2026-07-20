import { CASE_STUDY_BODY_FONT, CASE_STUDY_DISPLAY_FONT, fillTextWithSpacing, fillWrappedText, measureTextWithSpacing, measureWrappedTextHeight } from "./caseStudyCanvasText.js";

const MAX_FEATURES = 3;

function getVisibleFeatures(features, cfg) {
	const limit = Math.max(1, Math.round(cfg.maxFeatures ?? MAX_FEATURES));
	return features.slice(0, limit);
}

function featureTypography(cfg) {
	return {
		glyphSize: cfg.traitListGlyphSize ?? 46,
		topSize: cfg.traitListTopSize ?? 12,
		bottomSize: cfg.traitListBottomSize ?? 11,
		rowPadY: cfg.traitListRowPadY ?? 16,
		glyphColW: cfg.traitListGlyphColW ?? 52,
		textGap: cfg.traitListTextGap ?? 3,
	};
}

function drawListDivider(ctx, x, y, width, theme) {
	ctx.strokeStyle = theme.line;
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(x, y);
	ctx.lineTo(x + width, y);
	ctx.stroke();
}

function measureFeatureTextBlock(ctx, feature, textW, typo) {
	const topLineH = typo.topSize * 1.2;
	const bottomLineH = typo.bottomSize * 1.25;

	ctx.font = `400 ${typo.topSize}px ${CASE_STUDY_BODY_FONT}`;
	const topH = measureWrappedTextHeight(ctx, feature.title, textW, topLineH, 2);

	let bottomH = 0;
	if (feature.subtitle) {
		ctx.font = `400 ${typo.bottomSize}px ${CASE_STUDY_BODY_FONT}`;
		bottomH = measureWrappedTextHeight(ctx, feature.subtitle, textW, bottomLineH, 3);
	}

	return { topH, bottomH, textBlockH: topH + (bottomH ? typo.textGap + bottomH : 0) };
}

function measureFeatureRowHeight(ctx, feature, textW, typo) {
	const { textBlockH } = measureFeatureTextBlock(ctx, feature, textW, typo);
	return Math.max(typo.glyphSize, textBlockH) + typo.rowPadY * 2;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} innerW
 * @param {{ title: string, subtitle?: string }[]} features
 * @param {typeof import('./caseStudyLeftPanelConfig.js').caseStudyLeftPanelConfig} cfg
 */
export function measureFeaturesBlockHeight(ctx, innerW, features, cfg) {
	const items = getVisibleFeatures(features, cfg);
	if (items.length === 0) {
		return 0;
	}

	const typo = featureTypography(cfg);
	const textW = Math.max(1, innerW - typo.glyphColW);
	let height = cfg.gapBeforeStatsRail;

	for (const item of items) {
		height += measureFeatureRowHeight(ctx, item, textW, typo);
	}

	return height;
}

/**
 * Нумерованный список особенностей (сцены 02–05) — тот же вертикальный стиль, что у traits.
 */
export function drawFeaturesBlock(ctx, x, y, innerW, features, theme, cfg) {
	const items = getVisibleFeatures(features, cfg);
	if (items.length === 0) {
		return 0;
	}

	const typo = featureTypography(cfg);
	const textX = x + typo.glyphColW;
	const textW = Math.max(1, innerW - typo.glyphColW);
	let cursorY = y + cfg.gapBeforeStatsRail;

	ctx.save();
	ctx.textAlign = "left";
	ctx.textBaseline = "top";

	for (let index = 0; index < items.length; index += 1) {
		const item = items[index];
		const rowTop = cursorY;

		if (index > 0) {
			drawListDivider(ctx, x, rowTop, innerW, theme);
		}

		const { topH, textBlockH } = measureFeatureTextBlock(ctx, item, textW, typo);
		const rowContentH = Math.max(typo.glyphSize, textBlockH);
		const rowH = rowContentH + typo.rowPadY * 2;
		const blockY = rowTop + typo.rowPadY + (rowContentH - textBlockH) / 2;
		const glyphY = rowTop + typo.rowPadY + (rowContentH - typo.glyphSize) / 2;

		ctx.font = `300 ${typo.glyphSize}px ${CASE_STUDY_BODY_FONT}`;
		ctx.fillStyle = theme.cyan;
		ctx.fillText(String(index + 1), x, glyphY);

		ctx.font = `400 ${typo.topSize}px ${CASE_STUDY_BODY_FONT}`;
		ctx.fillStyle = theme.cyan;
		fillWrappedText(ctx, item.title, textX, blockY, textW, typo.topSize * 1.2, 2);

		if (item.subtitle) {
			ctx.font = `400 ${typo.bottomSize}px ${CASE_STUDY_BODY_FONT}`;
			ctx.fillStyle = theme.textMuted;
			fillWrappedText(ctx, item.subtitle, textX, blockY + topH + typo.textGap, textW, typo.bottomSize * 1.25, 3);
		}

		cursorY += rowH;
	}

	ctx.restore();

	return cursorY - y;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} innerW
 * @param {{ title: string, subtitle?: string }[]} features
 * @param {typeof import('./caseStudyLeftPanelConfig.js').caseStudyLeftPanelConfig} cfg
 */
export function measureFeaturesBlock(ctx, innerW, features, cfg) {
	return measureFeaturesBlockHeight(ctx, innerW, features, cfg);
}

/**
 * Подпись проекта внизу панели — весь текст cyan, как в макете nipigas.
 */
export function drawPanelFooterLabel(ctx, x, y, innerW, label, theme, cfg) {
	if (!label) {
		return 0;
	}

	const fontSize = cfg.badgeFontSize;
	const spacing = fontSize * cfg.badgeLetterSpacing;
	const text = label.toUpperCase();

	ctx.save();
	ctx.font = `500 ${fontSize}px ${CASE_STUDY_DISPLAY_FONT}`;
	ctx.textAlign = "left";
	ctx.textBaseline = "top";
	ctx.fillStyle = cfg.footerAllCyan === false ? theme.textDim : theme.cyan;

	if (cfg.footerAllCyan === false) {
		const slashIndex = label.indexOf("/");
		const brandPart = (slashIndex >= 0 ? label.slice(0, slashIndex) : label).trim();
		const restPart = slashIndex >= 0 ? label.slice(slashIndex).trim() : "";

		ctx.fillStyle = theme.cyan;
		ctx.fillText(brandPart.toUpperCase(), x, y);

		if (restPart) {
			const brandW = ctx.measureText(brandPart.toUpperCase()).width + spacing * 0.35;
			ctx.fillStyle = theme.textDim;
			ctx.fillText(restPart.toUpperCase(), x + brandW, y);
		}
	} else {
		fillTextWithSpacing(ctx, text, x, y, spacing);
	}

	ctx.restore();

	return fontSize + 8;
}

export function measurePanelFooterLabelHeight(label, cfg) {
	return label ? cfg.badgeFontSize + 8 : 0;
}

/**
 * Бейдж секции: «01» cyan + «/ О ПРОЕКТЕ» grey (без точки — как в макете).
 */
export function drawSectionBadge(ctx, x, y, label, theme, cfg) {
	const fontSize = cfg.categoryFontSize;
	const spacing = fontSize * cfg.categoryLetterSpacing;
	const match = label.match(/^(\S+)\s*(.*)$/);
	const chapterPart = (match?.[1] ?? label).trim();
	const restPart = (match?.[2] ?? "").trim();
	const textX = cfg.sectionBadgeShowDot === true ? x + 16 : x;

	ctx.save();

	if (cfg.sectionBadgeShowDot === true) {
		const dotCy = y + fontSize * 0.55;
		ctx.beginPath();
		ctx.arc(x + 4, dotCy, 4, 0, Math.PI * 2);
		ctx.fillStyle = theme.cyan;
		ctx.shadowColor = theme.cyanGlow;
		ctx.shadowBlur = 6;
		ctx.fill();
		ctx.shadowBlur = 0;
	}

	ctx.font = `${cfg.categoryFontWeight} ${fontSize}px ${CASE_STUDY_BODY_FONT}`;
	ctx.textAlign = "left";
	ctx.textBaseline = "top";

	ctx.fillStyle = theme.cyan;
	fillTextWithSpacing(ctx, chapterPart.toUpperCase(), textX, y, spacing);

	if (restPart) {
		const chapterW = measureTextWithSpacing(ctx, chapterPart.toUpperCase(), spacing) + measureTextWithSpacing(ctx, " ", spacing);
		ctx.fillStyle = theme.textDim;
		fillTextWithSpacing(ctx, restPart.toUpperCase(), textX + chapterW, y, spacing);
	}

	ctx.restore();

	return fontSize * 1.35 + 2;
}

export function measureSectionBadgeHeight(ctx, label, cfg) {
	ctx.font = `${cfg.categoryFontWeight} ${cfg.categoryFontSize}px ${CASE_STUDY_BODY_FONT}`;
	return cfg.categoryFontSize * 1.35 + 2;
}
