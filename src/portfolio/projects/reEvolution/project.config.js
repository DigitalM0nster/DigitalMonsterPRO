import { caseStudyReferencePanelPreset } from "@/portfolio/core/caseStudyReferencePanelPreset.js";

/** @type {import('@/portfolio/core/types.js').PortfolioProjectConfig} */
const projectConfig = {
	id: "05",
	slug: "reEvolution",
	route: "/portfolio/05",
	title: "RE:EVOLUTION",
	summary: "Интерактивный лендинг агентства полного цикла",
	hubLogo: "/images/portfolio/case5.webp",
	contentStatus: "ready",
	models: {
		primary: "/models/case5/RE-EV.glb",
		legacyScene: "/models/case5/sceneReev.glb",
	},
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
		mobileHorizontalSwipe: true,
		...caseStudyReferencePanelPreset,
	},
	mediaPolicy: {
		maxVideos: 0,
		defaultLoad: "onDemand",
	},
};

export default projectConfig;
