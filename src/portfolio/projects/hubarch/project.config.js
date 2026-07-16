import { caseStudyReferencePanelPreset } from "@/portfolio/core/caseStudyReferencePanelPreset.js";

/** @type {import('@/portfolio/core/types.js').PortfolioProjectConfig} */
const projectConfig = {
	id: "07",
	slug: "hubarch",
	route: "/portfolio/07",
	title: "HUBARCH",
	summary: "Архитектурное портфолио на React с управлением контентом через WordPress",
	hubLogo: "/images/portfolio/case7.webp",
	contentStatus: "ready",
	meta: {
		year: 2025,
		type: "HUBARCH / АРХИТЕКТУРА И ИНТЕРЬЕРЫ",
		skills: ["React", "WordPress"],
	},
	caseStudy: {
		renderTextInScene: true,
		chapterBase: 1,
		useSectionBadge: true,
		hideCategoryLabel: true,
		hideTags: true,
		statsValueFirst: true,
		metricsLayout: "verticalList",
		anchorFooterBlock: false,
		footerLabel: "HUBARCH / АРХИТЕКТУРА И ИНТЕРЬЕРЫ",
		footerLabelCopy: {
			en: "HUBARCH / ARCHITECTURE & INTERIORS",
			zh: "HUBARCH / 建筑与室内设计",
		},
		mobileHorizontalSwipe: true,
		...caseStudyReferencePanelPreset,
	},
	mediaPolicy: {
		maxVideos: 0,
		defaultLoad: "onDemand",
	},
};

export default projectConfig;
