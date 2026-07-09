/** @type {import('@/portfolio/core/types.js').PortfolioProjectConfig} */
/**
 * NIPIGAS — конфиг проекта.
 *
 * Левая canvas-панель (HUD): полный гайд → ./LEFT_PANEL.md
 *   • контент (тексты)     → states.js
 *   • стили и отступы      → caseStudy.leftPanel ниже
 *   • live-подгонка        → Chrome, /portfolio/01, клавиша 8
 */
const projectConfig = {
	id: "01",
	slug: "nipigas",
	route: "/portfolio/01",
	title: "НИПИГАЗ",
	summary: "Юбилейный digital-спецпроект к 50-летию компании",
	hubLogo: "/images/portfolio/case1.webp",
	models: {
		primary: "/models/case1/NipigasLogoModel.glb",
		orbitTexture: "/images/c1.png",
	},
	scene: {
		defaultCamera: {
			position: [0, 0, 9],
			lookAt: [0, 0, 0],
			fov: 50,
		},
		rootOffsetDesktop: [0, 0, 0],
		rootOffsetMobile: [0, -0.4, 0],
		scale: 1.1,
	},
	meta: {
		year: 2022,
		type: "НИПИГАЗ / 50 ЛЕТ",
		skills: ["HTML", "CSS", "JavaScript", "Motion", "3D"],
		accentColor: "#00d9d6",
	},
	caseStudy: {
		chapterBase: 1,
		useSectionBadge: true,
		hideCategoryLabel: true,
		hideTags: true,
		statsValueFirst: true,
		metricsLayout: "verticalList",
		anchorFooterBlock: false,
		footerLabel: "НИПИГАЗ / 50 ЛЕТ",
		footerLabelCopy: {
			en: "NIPIGAS / 50 YEARS",
			zh: "尼皮加兹 / 50周年",
		},
		mobileHorizontalSwipe: true,
		panelWidth: { min: 400, max: 520, ratio: 0.24 },
		contentTopPx: 176,
		contentBottomInsetPx: 48,
		leftPanel: {
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
			mosaicColumns: 20,
			mosaicRows: 15,
			mosaicLiftStrength: 0.005,
			mosaicRandomLift: 150,
			mosaicScatterX: 0,
			mosaicDelay: 0.75,
		},
	},
	mediaPolicy: {
		maxVideos: 1,
		defaultLoad: "onDemand",
	},
	optionalVideo: {
		src: "/video/case1Video2_720.mp4",
		poster: "/images/case1/bigImage.webp",
		label: "Смотреть фрагмент сайта",
		attachToState: "state_03",
	},
	lifecycle: {
		enterMs: 500,
		exitMs: 500,
		stateChangeSound: null,
		investigationEnterSound: null,
	},
};

export default projectConfig;
