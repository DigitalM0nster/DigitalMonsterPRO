import { caseStudyReferencePanelPreset } from "@/pages/portfolio/core/caseStudyReferencePanelPreset.js";

/** @type {import('@/pages/portfolio/core/types.js').PortfolioProjectConfig} */
const projectConfig = {
	id: "05",
	slug: "reEvolution",
	route: "/portfolio/05",
	title: "RE:EVOLUTION",
	summary: "Интерактивный лендинг агентства полного цикла",
	meta: {
		year: "2019–2020",
		type: "RE:EVOLUTION / АГЕНТСТВО ПОЛНОГО ЦИКЛА",
		skills: ["HTML", "SCSS"],
		accentColor: "#e51386",
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
		footerLabel: "RE:EVOLUTION / АГЕНТСТВО ПОЛНОГО ЦИКЛА",
		footerLabelCopy: {
			en: "RE:EVOLUTION / FULL-CYCLE AGENCY",
			zh: "RE:EVOLUTION / 全方位代理机构",
		},
		...caseStudyReferencePanelPreset,
	},
};

export default projectConfig;
