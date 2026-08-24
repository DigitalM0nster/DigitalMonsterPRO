import { createProjectModule } from "@/pages/portfolio/core/createProjectModule.js";
import mmk1Project from "@/pages/portfolio/projects/mmk1/index.js";
import lightTrailsHudProject from "@/pages/capabilities/lightTrails/lightTrailsHudProject.js";
import { getCapabilityById } from "./capabilities.js";

const TEMPLATE_COPY = {
	"synthetic-core": {
		pathTitle: "ПРОТОТИП / ВЫЧИСЛИТЕЛЬНАЯ ФОРМА",
		title: "СИНТЕТИЧЕСКОЕ ЯДРО\nИ ОРБИТАЛЬНЫЕ КОНТУРЫ",
		descriptionParagraphs: [
			"Временная сцена демонстрирует будущую структуру третьей возможности: центральный объект, систему орбит и реакцию композиции на движение камеры.",
			"Геометрия и текст используются как шаблон. Их можно заменить финальным контентом без изменения внутренней навигации страницы.",
		],
	},
	"signal-field": {
		pathTitle: "ГЕНЕРАТОР / ЦИФРОВЫЕ АРТЕФАКТЫ",
		title: "ЧАСТИЦЫ СОБИРАЮТ\nУЗНАВАЕМЫЕ ФОРМЫ",
		descriptionParagraphs: [
			"Восемнадцать тысяч частиц последовательно собирают рельефную планету, квантовый тор-реактор, структуру ДНК и огранённый кристалл.",
			"Каждая форма создаётся отдельным процедурным генератором, поэтому любой артефакт можно заменить или детально доработать независимо от остальных.",
		],
		localizedCopy: {
			en: {
				pathTitle: "GENERATOR / DIGITAL ARTIFACTS",
				title: "PARTICLES ASSEMBLE\nRECOGNIZABLE FORMS",
				descriptionParagraphs: [
					"Eighteen thousand particles assemble a relief planet, a quantum torus reactor, a DNA structure and a faceted energy crystal.",
					"Each form has an independent procedural generator, so any artifact can be replaced or refined without rebuilding the morphing system.",
				],
				traits: [],
			},
		},
	},
	"spatial-matrix": {
		pathTitle: "ГОРОДСКАЯ СРЕДА / АРХИТЕКТУРНАЯ МОДЕЛЬ",
		title: "АРХИТЕКТУРНАЯ\n3D-МОДЕЛЬ",
		descriptionParagraphs: [
			"Городская композиция собрана в единой авторской 3D-модели с исходной геометрией и материалами.",
			"Свободный обзор позволяет рассмотреть архитектуру и взаимное расположение объектов с разных ракурсов.",
		],
		localizedCopy: {
			en: {
				pathTitle: "URBAN ENVIRONMENT / ARCHITECTURAL MODEL",
				title: "ARCHITECTURAL\n3D MODEL",
				descriptionParagraphs: [
					"The urban composition is presented as one authored 3D model with its original geometry and materials intact.",
					"Free viewing makes it possible to inspect the architecture and spatial relationships from different angles.",
				],
				traits: [],
			},
		},
	},
};

function createTemplateProject(capabilityId, index) {
	const capability = getCapabilityById(capabilityId);
	const copy = TEMPLATE_COPY[capabilityId];
	const state = {
		id: `${capabilityId}_01`,
		...copy,
		traits: [],
		scrollAnchor: 0,
		localizedCopy: copy.localizedCopy ?? {
			en: {
				pathTitle: `PROTOTYPE / CAPABILITY ${String(index + 1).padStart(2, "0")}`,
				title: capability.title.toUpperCase(),
				descriptionParagraphs: [
					"This temporary scene reserves the structure and navigation slot for the future capability.",
					"Its geometry, copy and interaction can be replaced without rebuilding the five-stage experience.",
				],
				traits: [],
			},
		},
	};
	const config = {
		...mmk1Project.config,
		id: `C${String(index + 1).padStart(2, "0")}`,
		slug: `capability-${capabilityId}`,
		route: capability.path,
		title: capability.title,
		summary: capability.description,
		meta: {
			...mmk1Project.config.meta,
			year: 2026,
			type: "DIGITALMONSTER / CAPABILITY PROTOTYPE",
			accentColor: "#38d8ff",
		},
		caseStudy: {
			...mmk1Project.config.caseStudy,
			panelHudRoutes: ["/capabilities", capability.path],
			panelIntroDelayMs: 90,
			chapterBase: index + 1,
			footerLabel: "DIGITALMONSTER / CAPABILITY PROTOTYPE",
		},
	};

	return createProjectModule(config, [state], {}, () => null);
}

const projects = new Map([
	["mmk1", mmk1Project],
	["light-trails", lightTrailsHudProject],
	["synthetic-core", createTemplateProject("synthetic-core", 2)],
	["signal-field", createTemplateProject("signal-field", 3)],
	["spatial-matrix", createTemplateProject("spatial-matrix", 4)],
]);

export function getCapabilityHudProject(capabilityId) {
	return projects.get(capabilityId) ?? mmk1Project;
}

/** All capability HUD modules must be painted/uploaded under the loader curtain. */
export function getAllCapabilityHudProjects() {
	return [...projects.values()];
}
