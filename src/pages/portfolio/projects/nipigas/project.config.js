import { caseStudyReferencePanelPreset } from "@/pages/portfolio/core/caseStudyReferencePanelPreset.js";

/** @type {import('@/pages/portfolio/core/types.js').PortfolioProjectConfig} */
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
		/** Left panel + project nav → WebGL (hex like home hero text). Arc stays HTML. */
		renderTextInScene: true,
		footerLabel: "НИПИГАЗ / 50 ЛЕТ",
		footerLabelCopy: {
			en: "NIPIGAS / 50 YEARS",
			zh: "尼皮加兹 / 50周年",
		},
		...caseStudyReferencePanelPreset,
	},
};

export default projectConfig;
