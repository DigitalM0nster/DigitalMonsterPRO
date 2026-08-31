import { createProjectModule } from "@/pages/portfolio/core/createProjectModule.js";
import mmk1Project from "@/pages/portfolio/projects/mmk1/index.js";

const state = {
	id: "light_trails_01",
	pathTitle: "ГЕНЕРАТИВНАЯ СРЕДА",
	title: "СВЕТОВЫЕ ТРАЕКТОРИИ\nВ БЕСКОНЕЧНОМ ПРОСТРАНСТВЕ",
	descriptionParagraphs: [
		"Поток световых линий непрерывно проходит сквозь процедурную цифровую архитектуру. Секции пространства циклически перестраиваются впереди камеры, создавая ощущение бесконечного движения.",
		"Каждая траектория обладает собственной пластикой, скоростью и свечением. Линии мягко запаздывают за курсором, собираясь в живой управляемый поток.",
	],
	traits: [],
	scrollAnchor: 0,
	localizedCopy: {
		en: {
			pathTitle: "GENERATIVE ENVIRONMENT",
			title: "LIGHT TRAJECTORIES\nIN INFINITE SPACE",
			descriptionParagraphs: [
				"A stream of light lines continuously moves through procedural digital architecture. Recycled spatial sections rebuild ahead of the camera to create endless motion.",
				"Every trajectory has its own motion, speed and glow. The lines follow the cursor with a soft delay and merge into a living, controllable flow.",
			],
			traits: [],
		},
		zh: {
			pathTitle: "生成式环境",
			title: "无限空间中的\n光轨迹",
			descriptionParagraphs: [
				"光流持续穿越程序化数字建筑。空间区段会在镜头前方循环重组，营造出无尽前行的体验。",
				"每条轨迹都拥有独立的动态、速度与光晕。光线以柔和延迟跟随光标，汇聚成可实时操控的生命流。",
			],
			traits: [],
		},
	},
};

const config = {
	...mmk1Project.config,
	id: "C02",
	slug: "capability-light-trails",
	route: "/capabilities/light-trails",
	title: "Световые траектории",
	summary: "Интерактивная генеративная WebGL-среда",
	meta: {
		...mmk1Project.config.meta,
		year: 2026,
		type: "DIGITALMONSTER / GENERATIVE EXPERIENCE",
		accentColor: "#38d8ff",
	},
	caseStudy: {
		...mmk1Project.config.caseStudy,
		panelHudRoutes: ["/capabilities/light-trails"],
		panelIntroDelayMs: 90,
		chapterBase: 2,
		footerLabel: "DIGITALMONSTER / GENERATIVE EXPERIENCE",
		footerLabelCopy: {
			en: "DIGITALMONSTER / GENERATIVE EXPERIENCE",
			zh: "DIGITALMONSTER / 生成式体验",
		},
	},
};

const lightTrailsHudProject = createProjectModule(config, [state], {}, () => null);

export default lightTrailsHudProject;
