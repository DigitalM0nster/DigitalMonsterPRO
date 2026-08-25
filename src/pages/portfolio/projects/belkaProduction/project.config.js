import { caseStudyReferencePanelPreset } from "@/pages/portfolio/core/caseStudyReferencePanelPreset.js";

/** @type {import('@/pages/portfolio/core/types.js').PortfolioProjectConfig} */
const projectConfig = {
	id: "06",
	slug: "belkaProduction",
	route: "/portfolio/06",
	title: "Belka Production",
	summary: "Корпоративный сайт и портфолио продакшн-студии полного цикла",
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
		...caseStudyReferencePanelPreset,
	},
};

export default projectConfig;
