/**
 * Reference presentation used by the completed case-study HUDs.
 *
 * Keep the visual and motion settings together so new projects cannot silently
 * fall back to the legacy generic panel (different typography and much harsher
 * mosaic motion).
 */
export const caseStudyReferencePanelPreset = Object.freeze({
	panelWidth: Object.freeze({ min: 400, max: 520, ratio: 0.24 }),
	contentTopPx: 176,
	contentBottomInsetPx: 48,
	leftPanel: Object.freeze({
		gapAfterBadge: 30,
		gapAfterTitle: 24,
		gapAfterDescription: 12,
		gapBeforeStatsRail: 12,
		categoryFontSize: 13,
		categoryLetterSpacing: 0.14,
		categoryFontWeight: 400,
		sectionBadgeShowDot: false,
		titleFontSize: 36,
		titleFontWeight: 300,
		titleLineHeightMul: 1.05,
		titleLetterSpacing: 0.055,
		descriptionFontSize: 16,
		descriptionLineHeight: 22,
		descriptionFontWeight: 300,
		descriptionUseThemeMuted: true,
		traitListGlyphSize: 32,
		traitListTopSize: 12,
		traitListBottomSize: 13,
		traitListRowPadY: 12,
		traitListGlyphColW: 64,
		traitListTextGap: 2,
		traitListNumberAlignX: 22,
		traitListIconAlignX: 22,
		traitListIconScale: 0.85,
		badgeFontSize: 13,
		badgeLetterSpacing: 0.16,
		footerAllCyan: true,
		mosaicColumns: 28,
		mosaicRows: 24,
		mosaicLiftStrength: 0.005,
		mosaicRandomLift: 150,
		mosaicScatterX: 0,
		mosaicDelay: 0.75,
	}),
});

/**
 * Compact typography used by case 03. It is applied automatically whenever a
 * chapter's measured content would overflow the available left-panel height.
 */
export const caseStudyDensePanelOverrides = Object.freeze({
	gapAfterBadge: 20,
	gapAfterTitle: 15,
	gapAfterDescription: 12,
	gapBeforeStatsRail: 0,
	titleFontSize: 34,
	traitListRowPadY: 7,
});
