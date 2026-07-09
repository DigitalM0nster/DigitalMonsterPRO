/**
 * Порядок блоков левой панели (badge → title → desc → stats → footer).
 * Гайд nipigas: src/portfolio/projects/nipigas/LEFT_PANEL.md
 */
import { drawStatsRail, measureStatsRailBlockHeight } from "./caseStudyLeftPanelStatsRail.js";
import { drawTraitsList, measureTraitsListBlockHeight } from "./caseStudyLeftPanelTraitsList.js";
import {
	drawFeaturesBlock,
	drawPanelFooterLabel,
	drawSectionBadge,
	measureFeaturesBlock,
	measurePanelFooterLabelHeight,
	measureSectionBadgeHeight,
} from "./caseStudyLeftPanelFeatures.js";
import {
	CASE_STUDY_BODY_FONT,
	CASE_STUDY_DISPLAY_FONT,
	fillTextWithSpacing,
	fillWrappedText,
	measureTextWithSpacing,
	drawSpacedTitle,
	measureSpacedTitleHeight,
	fillWrappedTextWithinHeight,
	measureWrappedTextHeight,
} from "./caseStudyCanvasText.js";

/** Радиус cyan-точки у бейджа «STATE 01» (legacy-формат, не nipigas). */
const STATE_BADGE_DOT_R = 4;

// =============================================================================
// БЕЙДЖ ВЕРХНИЙ — два варианта
// =============================================================================
// nipigas: sectionBadge «01 / О ПРОЕКТЕ» → drawSectionBadge (caseStudyLeftPanelFeatures.js)
// другие кейсы: «STATE 01» с точкой → drawStateBadge ниже

/**
 * Высота legacy-бейджа «STATE NN» (только measure, без отрисовки).
 * Нужна для measureLeftPanelFlowHeight — чтобы заранее знать общую высоту панели.
 */
function measureStateBadgeHeight(ctx, chapterNum, cfg) {
	const label = `STATE ${chapterNum}`;
	ctx.font = `500 ${cfg.badgeFontSize}px ${CASE_STUDY_DISPLAY_FONT}`;
	const metrics = ctx.measureText(label);
	const ascent = metrics.actualBoundingBoxAscent || cfg.badgeFontSize * 0.82;
	const descent = metrics.actualBoundingBoxDescent || cfg.badgeFontSize * 0.18;
	return Math.max(ascent + descent, STATE_BADGE_DOT_R * 2) + 2;
}

/**
 * Рисует legacy-бейдж: cyan-точка + «STATE 01» серым.
 * @returns {number} занятая высота в px (cursorY += этот результат)
 */
function drawStateBadge(ctx, x, y, chapterNum, theme, cfg) {
	const label = `STATE ${chapterNum}`;
	const badgeSpacing = cfg.badgeFontSize * cfg.badgeLetterSpacing;

	ctx.save();
	ctx.font = `500 ${cfg.badgeFontSize}px ${CASE_STUDY_DISPLAY_FONT}`;
	const metrics = ctx.measureText(label);
	const ascent = metrics.actualBoundingBoxAscent || cfg.badgeFontSize * 0.82;
	const descent = metrics.actualBoundingBoxDescent || cfg.badgeFontSize * 0.18;
	const textY = y + ascent;
	const dotCy = y + ascent * 0.55;

	// Cyan-точка слева (как индикатор активной секции)
	ctx.beginPath();
	ctx.arc(x + 4, dotCy, STATE_BADGE_DOT_R, 0, Math.PI * 2);
	ctx.fillStyle = theme.cyan;
	ctx.shadowColor = theme.cyanGlow;
	ctx.shadowBlur = 6;
	ctx.fill();
	ctx.shadowBlur = 0;

	ctx.fillStyle = theme.textDim;
	ctx.textAlign = "left";
	ctx.textBaseline = "alphabetic";
	fillTextWithSpacing(ctx, label, x + 16, textY, badgeSpacing);
	ctx.restore();

	return Math.max(ascent + descent, STATE_BADGE_DOT_R * 2) + 2;
}

/** Выбор measure-функции бейджа по типу данных кейса. */
function measureBadgeHeight(ctx, data, cfg) {
	if (data.sectionBadge) {
		return measureSectionBadgeHeight(ctx, data.sectionBadge, cfg);
	}
	return measureStateBadgeHeight(ctx, data.chapterNum ?? "00", cfg);
}

/** Выбор draw-функции бейджа. nipigas → sectionBadge из frameData. */
function drawBadge(ctx, x, y, data, theme, cfg) {
	if (data.sectionBadge) {
		return drawSectionBadge(ctx, x, y, data.sectionBadge, theme, cfg);
	}
	return drawStateBadge(ctx, x, y, data.chapterNum, theme, cfg);
}

// =============================================================================
// ОПИСАНИЕ (1–2 абзаца под заголовком)
// =============================================================================

/**
 * Считает высоту блока описания без отрисовки.
 * Берёт descriptionParagraphs[] из states.js или fallback на одну строку description.
 */
function measureDescriptionHeight(ctx, data, cfg, innerW) {
	const paragraphs = data.descriptionParagraphs?.length > 0 ? data.descriptionParagraphs : data.description ? [data.description] : [];

	if (paragraphs.length === 0) {
		return 0;
	}

	ctx.font = `${cfg.descriptionFontWeight} ${cfg.descriptionFontSize}px ${CASE_STUDY_BODY_FONT}`;
	let height = 0;

	for (let index = 0; index < paragraphs.length; index += 1) {
		height += measureWrappedTextHeight(ctx, paragraphs[index], innerW, cfg.descriptionLineHeight);
		// Между абзацами — чуть меньше, чем gapAfterDescription после всего блока
		if (index < paragraphs.length - 1) {
			height += cfg.gapAfterDescription * 0.65;
		}
	}

	// Хвостовой отступ после всего описания (margin-bottom блока)
	return height + cfg.gapAfterDescription;
}

/**
 * Рисует описание с переносом строк по innerW.
 *
 * @param {number} maxHeight — лимит высоты (px). При anchorFooterBlock описание
 *   обрезается, чтобы stats+footer влезли в zoneHeight. Infinity = без лимита.
 *
 * SCSS-аналог: max-height + overflow hidden на .description.
 */
function drawDescription(ctx, x, y, data, cfg, theme, innerW, maxHeight = Number.POSITIVE_INFINITY) {
	const paragraphs = data.descriptionParagraphs?.length > 0 ? data.descriptionParagraphs : data.description ? [data.description] : [];

	if (paragraphs.length === 0 || maxHeight <= 0) {
		return 0;
	}

	ctx.font = `${cfg.descriptionFontWeight} ${cfg.descriptionFontSize}px ${CASE_STUDY_BODY_FONT}`;
	// descriptionUseThemeMuted: true (nipigas) → theme.textMuted вместо rgba opacity
	ctx.fillStyle = cfg.descriptionUseThemeMuted ? theme.textMuted : `rgba(255, 255, 255, ${cfg.descriptionOpacity})`;
	ctx.textAlign = "left";
	ctx.textBaseline = "top";

	let cursorY = y;
	let remaining = maxHeight;

	for (let index = 0; index < paragraphs.length; index += 1) {
		if (remaining <= 0) {
			break;
		}

		const paragraphGap = index < paragraphs.length - 1 ? cfg.gapAfterDescription * 0.65 : 0;
		const blockBudget = Math.max(0, remaining - paragraphGap);
		const used = fillWrappedTextWithinHeight(ctx, paragraphs[index], x, cursorY, innerW, cfg.descriptionLineHeight, blockBudget);

		if (used <= 0) {
			break;
		}

		cursorY += used;
		remaining -= used;

		if (index < paragraphs.length - 1 && remaining > paragraphGap) {
			cursorY += paragraphGap;
			remaining -= paragraphGap;
		}
	}

	return cursorY - y + (remaining > 0 ? cfg.gapAfterDescription : 0);
}

// =============================================================================
// ТЕГИ-PILL (у nipigas hideTags: true — этот блок не рисуется)
// =============================================================================

/**
 * Высота строки pill-тегов (HTML/CSS, Motion…).
 * Теги переносятся на новую строку, если не влезают в innerW.
 */
export function measureTagRowHeight(ctx, x, maxWidth, tags, cfg) {
	const fontSize = cfg.tagFontSize;
	const padX = cfg.tagPadX;
	const padY = cfg.tagPadY;
	const gap = cfg.tagGap;
	const letterSpacing = fontSize * cfg.tagLetterSpacing;
	let cursorX = x;
	let cursorY = 0;
	let rowHeight = fontSize + padY * 2;

	ctx.font = `${cfg.tagFontWeight} ${fontSize}px ${CASE_STUDY_BODY_FONT}`;

	for (const tag of tags.slice(0, 4)) {
		const label = tag.toUpperCase();
		const textW = measureTextWithSpacing(ctx, label, letterSpacing);
		const pillW = textW + padX * 2;
		const pillH = fontSize + padY * 2;

		if (cursorX + pillW > x + maxWidth && cursorX > x) {
			cursorX = x;
			cursorY += rowHeight + gap;
			rowHeight = pillH;
		}

		cursorX += pillW + gap;
	}

	return cursorY + rowHeight + 8;
}

/**
 * Полная высота левой панели в «потоковом» режиме (без anchorFooterBlock).
 * Используется в caseStudyCanvasDraw.js для расчёта layout / mobile box.
 *
 * Порядок блоков совпадает с paintLeftPanelFlow — важно для предсказуемой высоты.
 */
export function measureLeftPanelFlowHeight(ctx, data, cfg, innerW) {
	const categoryMaxLines = cfg.categoryMaxLines > 0 ? cfg.categoryMaxLines : Number.POSITIVE_INFINITY;
	let y = 0;

	y += measureBadgeHeight(ctx, data, cfg) + cfg.gapAfterBadge;

	if (data.categoryLabel) {
		ctx.font = `${cfg.categoryFontWeight} ${cfg.categoryFontSize}px ${CASE_STUDY_BODY_FONT}`;
		y += measureWrappedTextHeight(ctx, data.categoryLabel, innerW, cfg.categoryLineHeight, categoryMaxLines) + cfg.gapAfterCategory;
	}

	const titleLineH = cfg.titleFontSize * cfg.titleLineHeightMul;
	const titleSpacing = cfg.titleFontSize * (cfg.titleLetterSpacing ?? 0.08);
	ctx.font = `${cfg.titleFontWeight} ${cfg.titleFontSize}px ${CASE_STUDY_DISPLAY_FONT}`;
	y += measureSpacedTitleHeight(ctx, data.title, innerW, titleLineH, titleSpacing) + cfg.gapAfterTitle;

	y += measureDescriptionHeight(ctx, data, cfg, innerW);

	if (data.tags.length > 0) {
		y += measureTagRowHeight(ctx, 0, innerW, data.tags, cfg);
	}

	// При anchorFooterBlock stats/footer не идут в поток — рисуются отдельно у низа zoneHeight
	if (!data.anchorFooterBlock) {
		if (data.features?.length) {
			y += measureFeaturesBlock(ctx, innerW, data.features, cfg);
		} else if (data.metricsLayout === "verticalList" && data.metrics?.length) {
			y += measureTraitsListBlockHeight(ctx, innerW, data.metrics, cfg);
		} else {
			y += measureStatsRailBlockHeight(ctx, innerW, data.metrics, cfg, { valueFirst: data.statsValueFirst });
		}

		if (data.footerLabel) {
			y += 14 + measurePanelFooterLabelHeight(data.footerLabel, cfg);
		}
	}

	return y;
}

// =============================================================================
// НИЖНИЙ БЛОК — метрики / features (три layout-режима)
// =============================================================================
// verticalList → nipigas (caseStudyLeftPanelTraitsList.js)
// features     → сцены 02–05 nipigas (caseStudyLeftPanelFeatures.js)
// rail         → горизонтальная рельса (caseStudyLeftPanelStatsRail.js)

/** Высота stats/features блока — для anchorFooterBlock (прижать к низу). */
function measureBottomBlockHeight(ctx, data, cfg, innerW) {
	if (data.features?.length) {
		return measureFeaturesBlock(ctx, innerW, data.features, cfg);
	}
	if (data.metricsLayout === "verticalList" && data.metrics?.length) {
		return measureTraitsListBlockHeight(ctx, innerW, data.metrics, cfg);
	}
	return measureStatsRailBlockHeight(ctx, innerW, data.metrics, cfg, { valueFirst: data.statsValueFirst });
}

/** Общая геометрия anchor-низа для Canvas и selectable HTML overlay. */
export function resolveAnchoredBottomLayout(ctx, data, cfg, innerW, zoneHeight) {
	if (!data.anchorFooterBlock || zoneHeight <= 0) {
		return null;
	}

	const footerH = data.footerLabel ? measurePanelFooterLabelHeight(data.footerLabel, cfg) + 10 : 0;
	const bottomH = measureBottomBlockHeight(ctx, data, cfg, innerW);
	const footerGap = 14;

	return {
		bottomH,
		bottomY: Math.max(0, zoneHeight - footerH - bottomH - footerGap),
		footerY: zoneHeight - footerH + 4,
	};
}

/** Отрисовка stats/features — делегирует в нужный модуль по metricsLayout. */
function paintBottomBlock(ctx, x, y, innerW, cfg, theme, data) {
	if (data.features?.length) {
		drawFeaturesBlock(ctx, x, y, innerW, data.features, theme, cfg);
		return;
	}
	if (data.metricsLayout === "verticalList" && data.metrics?.length) {
		drawTraitsList(ctx, x, y, innerW, data.metrics, theme, cfg);
		return;
	}
	drawStatsRail(ctx, x, y, innerW, data.metrics, theme, cfg, { valueFirst: data.statsValueFirst });
}

/** Скруглённый rect для обводки pill-тегов (canvas path API). */
function roundRect(ctx, x, y, width, height, radius) {
	const r = Math.min(radius, width / 2, height / 2);
	ctx.moveTo(x + r, y);
	ctx.arcTo(x + width, y, x + width, y + height, r);
	ctx.arcTo(x + width, y + height, x, y + height, r);
	ctx.arcTo(x, y + height, x, y, r);
	ctx.arcTo(x, y, x + width, y, r);
	ctx.closePath();
}

/** Рисует pill-теги; @returns занятая высота. */
function drawTagRow(ctx, x, y, maxWidth, tags, theme, cfg) {
	const fontSize = cfg.tagFontSize;
	const padX = cfg.tagPadX;
	const padY = cfg.tagPadY;
	const gap = cfg.tagGap;
	const letterSpacing = fontSize * cfg.tagLetterSpacing;
	let cursorX = x;
	let cursorY = y;
	let rowHeight = fontSize + padY * 2;

	ctx.font = `${cfg.tagFontWeight} ${fontSize}px ${CASE_STUDY_BODY_FONT}`;
	ctx.textBaseline = "top";

	for (const tag of tags.slice(0, 4)) {
		const label = tag.toUpperCase();
		const textW = measureTextWithSpacing(ctx, label, letterSpacing);
		const pillW = textW + padX * 2;
		const pillH = fontSize + padY * 2;

		if (cursorX + pillW > x + maxWidth && cursorX > x) {
			cursorX = x;
			cursorY += rowHeight + gap;
			rowHeight = pillH;
		}

		ctx.strokeStyle = theme.tagBorder;
		ctx.lineWidth = 1;
		roundRect(ctx, cursorX, cursorY, pillW, pillH, 2);
		ctx.stroke();

		ctx.fillStyle = theme.textMuted;
		fillTextWithSpacing(ctx, label, cursorX + padX, cursorY + padY, letterSpacing);

		cursorX += pillW + gap;
	}

	return cursorY + rowHeight - y + 8;
}

// =============================================================================
// ГЛАВНАЯ ФУНКЦИЯ ОТРИСОВКИ
// =============================================================================

/**
 * Рисует всю левую колонку кейса сверху вниз.
 *
 * @param {CanvasRenderingContext2D} ctx — контекст panel-canvas
 * @param {number} x — левый край колонки (обычно 0 после translate в drawLeftPanel)
 * @param {number} y — верх колонки (обычно 0)
 * @param {number} innerW — ширина текстовой колонки (panel.width − padding)
 * @param {object} cfg — merge пресета + project.config leftPanel + dev-панель (клав. 8)
 * @param {object} theme — цвета из caseStudyCanvasTheme.js
 * @param {object} data — frameData из caseStudyFrameData.js
 * @param {number} [zoneHeight=0] — высота зоны контента (от якоря до низа меню).
 *   Передаётся из caseStudyCanvasDraw.js → layout.centerClear.height.
 *
 * Режим anchorFooterBlock (nipigas):
 *   ┌─ badge, title ──────────────── прижаты к верху (cursorY растёт)
 *   ├─ description ───────────────── занимает середину (maxDescHeight)
 *   ├─ stats (verticalList) ────── bottomY = zoneHeight − footer − stats
 *   └─ footer «НИПИГАЗ / 50 ЛЕТ» ─ zoneHeight − footerH
 *
 * SCSS-аналог: flex column + margin-top: auto на .stats и .footer.
 */
export function paintLeftPanelFlow(ctx, x, y, innerW, cfg, theme, data, zoneHeight = 0) {
	const categoryMaxLines = cfg.categoryMaxLines > 0 ? cfg.categoryMaxLines : Number.POSITIVE_INFINITY;
	let cursorY = y;

	// --- 1. Бейдж «01 / О ПРОЕКТЕ» ---
	cursorY += drawBadge(ctx, x, cursorY, data, theme, cfg) + cfg.gapAfterBadge;

	// --- 2. Категория (meta.type) — у nipigas hideCategoryLabel: true, блок пропускается ---
	if (data.categoryLabel) {
		ctx.font = `${cfg.categoryFontWeight} ${cfg.categoryFontSize}px ${CASE_STUDY_BODY_FONT}`;
		ctx.fillStyle = theme.textDim;
		ctx.textAlign = "left";
		ctx.textBaseline = "top";
		cursorY += fillWrappedText(ctx, data.categoryLabel, x, cursorY, innerW, cfg.categoryLineHeight, categoryMaxLines) + cfg.gapAfterCategory;
	}

	// --- 3. Заголовок с letter-spacing и переносом (\n в states.js) ---
	const titleLineH = cfg.titleFontSize * cfg.titleLineHeightMul;
	const titleSpacing = cfg.titleFontSize * (cfg.titleLetterSpacing ?? 0.08);
	ctx.font = `${cfg.titleFontWeight} ${cfg.titleFontSize}px ${CASE_STUDY_DISPLAY_FONT}`;
	ctx.fillStyle = theme.text;
	ctx.textAlign = "left";
	ctx.textBaseline = "top";
	cursorY += drawSpacedTitle(ctx, data.title, x, cursorY, innerW, titleLineH, titleSpacing) + cfg.gapAfterTitle;

	// --- Подготовка anchor-layout: считаем высоты footer и stats до описания ---
	const footerH = data.footerLabel ? measurePanelFooterLabelHeight(data.footerLabel, cfg) + 10 : 0;
	const bottomH = measureBottomBlockHeight(ctx, data, cfg, innerW);
	let maxDescHeight = Number.POSITIVE_INFINITY;

	if (data.anchorFooterBlock && zoneHeight > 0) {
		const footerGap = 14;
		// Y, где должен начаться блок метрик (statsTop)
		const statsTop = Math.max(0, zoneHeight - footerH - bottomH - footerGap);
		// Описание не может опуститься ниже statsTop — иначе наложение
		maxDescHeight = Math.max(0, statsTop - cursorY - 8);
	}

	// --- 4. Описание (может быть обрезано maxDescHeight) ---
	cursorY += drawDescription(ctx, x, cursorY, data, cfg, theme, innerW, maxDescHeight);

	// --- 5. Pill-теги (nipigas: hideTags — пустой массив, пропуск) ---
	if (data.tags.length > 0) {
		cursorY += drawTagRow(ctx, x, cursorY, innerW, data.tags, theme, cfg);
	}

	// --- 6a. Anchor-режим: stats + footer у низа zoneHeight ---
	if (data.anchorFooterBlock && zoneHeight > 0) {
		const anchored = resolveAnchoredBottomLayout(ctx, data, cfg, innerW, zoneHeight);
		paintBottomBlock(ctx, x, anchored.bottomY, innerW, cfg, theme, data);

		if (data.footerLabel) {
			drawPanelFooterLabel(ctx, x, anchored.footerY, innerW, data.footerLabel, theme, cfg);
		}
		return;
	}

	// --- 6b. Потоковый режим: stats + footer сразу после описания (без привязки к zoneHeight) ---
	const bottomBlockH = measureBottomBlockHeight(ctx, data, cfg, innerW);
	if (bottomBlockH > 0) {
		paintBottomBlock(ctx, x, cursorY, innerW, cfg, theme, data);
		cursorY += bottomBlockH;
	}

	if (data.footerLabel) {
		cursorY += 14;
		drawPanelFooterLabel(ctx, x, cursorY, innerW, data.footerLabel, theme, cfg);
	}
}
