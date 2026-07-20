import { caseStudyReferencePanelPreset } from "@/portfolio/core/caseStudyReferencePanelPreset.js";

/** @type {import('@/portfolio/core/types.js').PortfolioProjectConfig} */
const projectConfig = {
	id: "06",
	slug: "belkaProduction",
	route: "/portfolio/06",
	title: "Belka Production",
	summary: "Корпоративный сайт и портфолио продакшн-студии полного цикла",
	hubLogo: "/images/portfolio/case4.webp",
	contentStatus: "ready",
	meta: {
		year: 2023,
		type: "СТУДИЯ БЕЛКИ / FULL-CYCLE PRODUCTION",
		skills: ["React", "SCSS"],
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
		footerLabel: "СТУДИЯ БЕЛКИ / FULL-CYCLE PRODUCTION",
		footerLabelCopy: {
			en: "BELKA PRODUCTION / FULL CYCLE",
			zh: "BELKA PRODUCTION / 全流程制作",
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
