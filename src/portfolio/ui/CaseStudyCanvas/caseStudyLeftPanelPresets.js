/**
 * Типографика левого HUD по ширине viewport (аналог @media min-width).
 * Редактируйте пресеты здесь; якоря и ширина панели — в caseStudyLeftPanelConfig.js.
 */

/** @typedef {import('./caseStudyLeftPanelConfig.js').CaseStudyLeftPanelTypography} CaseStudyLeftPanelTypography */

/** @type {CaseStudyLeftPanelTypography} */
const DESKTOP_TYPOGRAPHY = {
	gapAfterBadge: 18,
	gapAfterCategory: 14,
	gapAfterTitle: 16,
	gapAfterDescription: 16,
	gapBeforeStatsRail: 24,

	categoryFontSize: 12,
	categoryFontWeight: 300,
	categoryLineHeight: 16,
	categoryLetterSpacing: 0.08,
	categoryMaxLines: 2,

	titleFontSize: 40,
	titleFontWeight: 300,
	titleLineHeightMul: 1.1,

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
};

/**
 * @type {ReadonlyArray<{
 *   id: string,
 *   minWidth: number,
 *   maxWidth: number,
 *   label: string,
 * } & CaseStudyLeftPanelTypography>}
 */
export const CASE_STUDY_LEFT_PANEL_BREAKPOINTS = [
	{
		id: "compact",
		label: "≤767px",
		minWidth: 0,
		maxWidth: 767,
		...DESKTOP_TYPOGRAPHY,
		gapAfterBadge: 10,
		gapAfterCategory: 10,
		gapAfterTitle: 10,
		gapAfterDescription: 10,
		gapBeforeStatsRail: 14,
		categoryFontSize: 11,
		categoryLineHeight: 15,
		titleFontSize: 28,
		descriptionFontSize: 14,
		descriptionLineHeight: 20,
		tagFontSize: 10,
		tagPadX: 6,
		tagPadY: 3,
		badgeFontSize: 9,
		statsRailLabelFontSize: 8,
		statsRailValueFontSize: 11,
		statsRailPadY: 8,
		statsRailAccentWidth: 20,
	},
	{
		id: "desktop",
		label: "768–1439px",
		minWidth: 768,
		maxWidth: 1439,
		...DESKTOP_TYPOGRAPHY,
	},
	{
		id: "wide",
		label: "1440–1919px",
		minWidth: 1440,
		maxWidth: 1919,
		...DESKTOP_TYPOGRAPHY,
		titleFontSize: 44,
		descriptionFontSize: 17,
		statsRailValueFontSize: 14,
		statsRailAccentWidth: 32,
	},
	{
		id: "xl",
		label: "≥1920px",
		minWidth: 1920,
		maxWidth: Number.POSITIVE_INFINITY,
		...DESKTOP_TYPOGRAPHY,
		titleFontSize: 48,
		descriptionFontSize: 18,
		descriptionLineHeight: 24,
		categoryFontSize: 13,
		statsRailValueFontSize: 15,
		statsRailAccentWidth: 36,
	},
];

/**
 * @param {number} viewportWidth
 * @returns {(typeof CASE_STUDY_LEFT_PANEL_BREAKPOINTS)[number]}
 */
export function resolveCaseStudyLeftPanelPreset(viewportWidth) {
	const width = Math.max(0, viewportWidth);
	let match = CASE_STUDY_LEFT_PANEL_BREAKPOINTS[0];

	for (const breakpoint of CASE_STUDY_LEFT_PANEL_BREAKPOINTS) {
		if (width >= breakpoint.minWidth) {
			match = breakpoint;
		}
	}

	return match;
}
