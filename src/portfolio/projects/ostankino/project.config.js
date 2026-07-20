import { caseStudyReferencePanelPreset } from "@/portfolio/core/caseStudyReferencePanelPreset.js";

/** @type {import('@/portfolio/core/types.js').PortfolioProjectConfig} */
const projectConfig = {
	id: "03",
	slug: "ostankino",
	route: "/portfolio/03",
	title: "ОСТАНКИНО",
	summary: "Интерактивный каталог офисных помещений с навигацией по зданию",
	hubLogo: "/images/portfolio/case6.webp",
	contentStatus: "ready",
	meta: {
		year: 2025,
		type: "ОСТАНКИНО / АРЕНДА ОФИСОВ",
		skills: ["WordPress", "JavaScript", "HTML", "SCSS"],
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
		footerLabel: "ОСТАНКИНО / АРЕНДА ОФИСОВ",
		footerLabelCopy: {
			en: "OSTANKINO / OFFICE RENTAL",
			zh: "OSTANKINO / 办公室租赁",
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
