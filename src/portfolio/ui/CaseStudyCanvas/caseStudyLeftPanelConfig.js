import {
	resolveCaseStudyLeftPanelPreset,
} from "./caseStudyLeftPanelPresets.js";

/**
 * @typedef {{
 *   gapAfterBadge: number,
 *   gapAfterCategory: number,
 *   gapAfterTitle: number,
 *   gapAfterDescription: number,
 *   gapBeforeStatsRail: number,
 *   categoryFontSize: number,
 *   categoryFontWeight: number,
 *   categoryLineHeight: number,
 *   categoryLetterSpacing: number,
 *   categoryMaxLines: number,
 *   titleFontSize: number,
 *   titleFontWeight: number,
 *   titleLineHeightMul: number,
 *   descriptionFontSize: number,
 *   descriptionFontWeight: number,
 *   descriptionLineHeight: number,
 *   descriptionOpacity: number,
 *   tagFontSize: number,
 *   tagFontWeight: number,
 *   tagLetterSpacing: number,
 *   tagPadX: number,
 *   tagPadY: number,
 *   tagGap: number,
 *   badgeFontSize: number,
 *   badgeLetterSpacing: number,
 *   statsRailPadY: number,
 *   statsRailLabelFontSize: number,
 *   statsRailValueFontSize: number,
 *   statsRailLabelGap: number,
 *   statsRailLabelLetterSpacing: number,
 *   statsRailCellPadX: number,
 *   statsRailAccentWidth: number,
 * }} CaseStudyLeftPanelTypography
 */

/**
 * Якоря, ширина панели и dev-override типографики — dev-панель (клавиша 8).
 * В проде типографика берётся из caseStudyLeftPanelPresets.js по ширине viewport.
 */
export const caseStudyLeftPanelConfig = {
	/** Вертикальный зазор под нижней иконкой меню (px). */
	contentBottomGap: 0,
	/** Запас над блоком sound/RU — контент не заходит на нижнее меню (px). */
	contentBottomMenuInset: 12,
	/** Доп. сдвиг панели вниз от якоря home (px). */
	contentTopGap: 5,

	panelWidthMin: 260,
	panelWidthMax: 360,
	panelWidthRatio: 0.22,

	gapAfterBadge: 12,
	gapAfterCategory: 14,
	gapAfterTitle: 14,
	gapAfterDescription: 12,
	gapBeforeStatsRail: 18,

	categoryFontSize: 12,
	categoryFontWeight: 300,
	categoryLineHeight: 16,
	categoryLetterSpacing: 0.08,
	categoryMaxLines: 2,

	titleFontSize: 40,
	titleFontWeight: 300,
	titleLineHeightMul: 1.1,
	titleLetterSpacing: 0.08,

	descriptionFontSize: 16,
	descriptionFontWeight: 300,
	descriptionLineHeight: 22,
	descriptionOpacity: 0.78,

	tagFontSize: 11,
	tagFontWeight: 400,
	tagLetterSpacing: 0.12,
	tagPadX: 8,
	tagPadY: 4,
	tagGap: 6,

	badgeFontSize: 10,
	badgeLetterSpacing: 0.2,

	statsRailPadY: 10,
	statsRailLabelFontSize: 9,
	statsRailValueFontSize: 13,
	statsRailLabelGap: 4,
	statsRailLabelLetterSpacing: 0.14,
	statsRailCellPadX: 0,
	statsRailAccentWidth: 28,

	traitListGlyphSize: 52,
	traitListTopSize: 13,
	traitListBottomSize: 11,
	traitListRowPadY: 14,
	traitListGlyphColW: 56,
	traitListTextGap: 4,

	mosaicColumns: 10,
	mosaicRows: 18,
	mosaicLiftStrength: 1,
	mosaicRandomLift: 120,
	mosaicScatterX: 28,
	mosaicDelay: 0.32,
};

const LAYOUT_KEYS = [
	"contentBottomGap",
	"contentBottomMenuInset",
	"contentTopGap",
	"panelWidthMin",
	"panelWidthMax",
	"panelWidthRatio",
	"mosaicColumns",
	"mosaicRows",
	"mosaicLiftStrength",
	"mosaicRandomLift",
	"mosaicScatterX",
	"mosaicDelay",
];

let configRevision = 0;
const listeners = new Set();

export function getCaseStudyLeftPanelConfigRevision() {
	return configRevision;
}

export function subscribeCaseStudyLeftPanelConfig(listener) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function bumpCaseStudyLeftPanelConfigRevision() {
	configRevision += 1;
	for (const listener of listeners) {
		listener(configRevision);
	}
}

/**
 * Эффективный конфиг отрисовки: пресет по ширине + якоря; в DEV — полный override из dev-панели.
 *
 * @param {number} viewportWidth
 */
export function resolveLeftPanelDrawConfig(viewportWidth) {
	const preset = resolveCaseStudyLeftPanelPreset(viewportWidth);
	const layout = {};

	for (const key of LAYOUT_KEYS) {
		layout[key] = caseStudyLeftPanelConfig[key];
	}

	return { ...preset, ...layout };
}
