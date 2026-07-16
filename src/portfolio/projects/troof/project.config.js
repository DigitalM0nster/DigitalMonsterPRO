import { caseStudyReferencePanelPreset } from "@/portfolio/core/caseStudyReferencePanelPreset.js";

/** @type {import('@/portfolio/core/types.js').PortfolioProjectConfig} */
const projectConfig = {
	id: "02",
	slug: "troof",
	route: "/portfolio/02",
	title: "TROOF",
	summary: "Многостраничный сайт кровельной компании с интерактивной композицией",
	hubLogo: "/images/portfolio/case2.webp",
	contentStatus: "ready",
	models: {
		primary: "/models/case2/platform1.glb",
	},
	scene: {
		defaultCamera: { position: [0, 0, 9], lookAt: [0, 0, 0] },
		rootOffsetDesktop: [1.25, 0, 0],
	},
	meta: {
		year: 2022,
		type: "TROOF / КРОВЕЛЬНЫЕ СИСТЕМЫ",
		skills: ["HTML", "CSS", "JavaScript"],
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
		footerLabel: "TROOF / КРОВЕЛЬНЫЕ СИСТЕМЫ",
		footerLabelCopy: {
			en: "TROOF / ROOFING SYSTEMS",
			zh: "TROOF / 屋面系统",
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
