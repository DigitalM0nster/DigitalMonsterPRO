import { caseStudyReferencePanelPreset } from "@/pages/portfolio/core/caseStudyReferencePanelPreset.js";

/** @type {import('@/pages/portfolio/core/types.js').PortfolioProjectConfig} */
const projectConfig = {
	id: "02",
	slug: "holodVAuto",
	route: "/portfolio/02",
	title: "ХОЛОД В АВТО",
	summary: "Каталог и сервисная платформа автомобильного климатического оборудования",
	meta: {
		year: 2026,
		type: "ХОЛОД В АВТО / АВТОМОБИЛЬНЫЙ КЛИМАТ",
		skills: ["Next.js", "React", "TypeScript"],
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
		footerLabel: "ХОЛОД В АВТО / АВТОМОБИЛЬНЫЙ КЛИМАТ",
		footerLabelCopy: {
			en: "HOLOD V AUTO / AUTOMOTIVE CLIMATE",
			zh: "HOLOD V AUTO / 汽车气候系统",
		},
		...caseStudyReferencePanelPreset,
	},
};

export default projectConfig;
