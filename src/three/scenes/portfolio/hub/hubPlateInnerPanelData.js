import { getLocalizedText } from "@/app/localization/interfaceTranslations.js";
import {
	getPortfolioLocale,
	getPortfolioProjectName,
	getPortfolioProjectPlateSecondary,
} from "@/pages/portfolio/data/portfolioProjectsCopy.js";

const PANEL_DATA_BY_ID = {
	"01": {
		description: {
			ru: "Юбилейный digital-спецпроект к 50-летию компании",
			en: "An anniversary digital experience created for the company's 50th year",
			zh: "为公司成立 50 周年打造的互动数字专题项目",
		},
		year: "2022",
		type: "ИНТЕРАКТИВНЫЙ ЮБИЛЕЙНЫЙ САЙТ",
		gallery: [
			"/images/case1/caseImages/image1.webp",
			"/images/case1/caseImages/image2.webp",
			"/images/case1/caseImages/image3.webp",
			"/images/case1/caseImages/image4.webp",
			"/images/case1/caseImages/image5.webp",
			"/images/case1/caseImages/image6.webp",
			"/images/case1/caseImages/image7.webp",
			"/images/case1/caseImages/image8.webp",
			"/images/case1/caseImages/image9.webp",
			"/images/case1/caseImages/image10.webp",
			"/images/case1/caseImages/image11.webp",
		],
	},
	"02": {
		description: {
			ru: "Каталог и сервисная платформа автомобильного климатического оборудования",
			en: "A catalogue and service platform for automotive climate equipment",
			zh: "汽车气候设备目录与服务平台",
		},
		year: "2026",
		type: "АВТОМОБИЛЬНОЕ КЛИМАТИЧЕСКОЕ ОБОРУДОВАНИЕ",
		url: "https://holod-v-auto.ru/",
		gallery: [
			"/images/portfolio/holod-v-auto/image1.webp",
			"/images/portfolio/holod-v-auto/image2.webp",
			"/images/portfolio/holod-v-auto/image3.webp",
			"/images/portfolio/holod-v-auto/image4.webp",
			"/images/portfolio/holod-v-auto/image5.webp",
			"/images/portfolio/holod-v-auto/image6.webp",
			"/images/portfolio/holod-v-auto/image7.webp",
			"/images/portfolio/holod-v-auto/image8.webp",
			"/images/portfolio/holod-v-auto/image9.webp",
			"/images/portfolio/holod-v-auto/image10.webp",
			"/images/portfolio/holod-v-auto/image11.webp",
		],
	},
	"03": {
		description: {
			ru: "Интерактивный каталог офисных помещений с навигацией по зданию",
			en: "An interactive office catalogue with navigation through the building",
			zh: "带有建筑导航功能的互动办公空间目录",
		},
		year: "2025",
		type: "ИНТЕРАКТИВНЫЙ САЙТ / АРЕНДА ОФИСОВ",
		url: "https://ostankino.ru/rent/",
		gallery: [
			"/images/portfolio/ostankino/image1.webp",
			"/images/portfolio/ostankino/image2.webp",
			"/images/portfolio/ostankino/image3.webp",
			"/images/portfolio/ostankino/image4.webp",
			"/images/portfolio/ostankino/image5.webp",
			"/images/portfolio/ostankino/image6.webp",
			"/images/portfolio/ostankino/image7.webp",
			"/images/portfolio/ostankino/image8.webp",
			"/images/portfolio/ostankino/image9.webp",
			"/images/portfolio/ostankino/image10.webp",
			"/images/portfolio/ostankino/image11.webp",
			"/images/portfolio/ostankino/image12.webp",
			"/images/portfolio/ostankino/image13.webp",
		],
	},
	"04": {
		description: {
			ru: "Современный сайт с 3D-визуализацией и интерактивным подбором техники",
			en: "A modern website with 3D visualisation and interactive equipment selection",
			zh: "包含 3D 可视化与互动设备选型的现代网站",
		},
		year: "2023",
		type: "АРЕНДА БАШЕННЫХ КРАНОВ",
		url: "https://mmk-1.com/",
		gallery: [
			"/images/portfolio/mmk1/image1.webp",
			"/images/portfolio/mmk1/image2.webp",
			"/images/portfolio/mmk1/image3.webp",
			"/images/portfolio/mmk1/image4.webp",
			"/images/portfolio/mmk1/image5.webp",
			"/images/portfolio/mmk1/image6.webp",
			"/images/portfolio/mmk1/image7.webp",
		],
	},
	"05": {
		description: {
			ru: "Интерактивный лендинг креативного агентства полного цикла",
			en: "An interactive landing page for a full-cycle creative agency",
			zh: "全方位创意代理机构的互动式落地页",
		},
		year: "2019–2020",
		type: "КРЕАТИВНОЕ АГЕНТСТВО / MOTION",
		url: "https://re-ev.ru/",
		gallery: [
			"/images/portfolio/reevolution/image1.webp",
			"/images/portfolio/reevolution/image2.webp",
			"/images/portfolio/reevolution/image3.webp",
			"/images/portfolio/reevolution/image4.webp",
		],
	},
	"06": {
		description: {
			ru: "Корпоративный сайт и портфолио продакшн-студии полного цикла",
			en: "A corporate website and portfolio for a full-cycle production studio",
			zh: "全流程制作工作室的企业网站与作品集",
		},
		year: "2023",
		type: "FULL-CYCLE PRODUCTION",
		url: "https://belka-production.ru/",
		gallery: [
			"/images/portfolio/belka-production/image1.webp",
			"/images/portfolio/belka-production/image2.webp",
			"/images/portfolio/belka-production/image3.webp",
			"/images/portfolio/belka-production/image4.webp",
			"/images/portfolio/belka-production/image5.webp",
			"/images/portfolio/belka-production/image6.webp",
			"/images/portfolio/belka-production/image7.webp",
			"/images/portfolio/belka-production/image8.webp",
		],
	},
	"07": {
		description: {
			ru: "Архитектурное портфолио с управлением контентом через WordPress",
			en: "An architecture portfolio with content management powered by WordPress",
			zh: "基于 WordPress 内容管理的建筑作品集",
		},
		year: "2025",
		type: "АРХИТЕКТУРА И ИНТЕРЬЕРЫ",
		url: "https://hubarch.ru/",
		gallery: [
			"/images/portfolio/hubarch/image1.webp",
			"/images/portfolio/hubarch/image2.webp",
			"/images/portfolio/hubarch/image3.webp",
			"/images/portfolio/hubarch/image4.webp",
			"/images/portfolio/hubarch/image5.webp",
			"/images/portfolio/hubarch/image6.webp",
			"/images/portfolio/hubarch/image7.webp",
			"/images/portfolio/hubarch/image8.webp",
			"/images/portfolio/hubarch/image9.webp",
			"/images/portfolio/hubarch/image10.webp",
			"/images/portfolio/hubarch/image11.webp",
			"/images/portfolio/hubarch/image12.webp",
			"/images/portfolio/hubarch/image13.webp",
		],
	},
};

const CURRENT_PROJECT_COPY = {
	ru: "ТЕКУЩИЙ ПРОЕКТ",
	en: "CURRENT PROJECT",
	zh: "当前项目",
};

const VISIT_SITE_COPY = {
	ru: "ПОСЕТИТЬ САЙТ",
	en: "VISIT WEBSITE",
	zh: "访问网站",
};

export function getHubPlateInnerPanelData(project, locale = getPortfolioLocale()) {
	const data = PANEL_DATA_BY_ID[project?.id] ?? {};
	return {
		title: getPortfolioProjectName(project?.id, locale) || project?.name || "PROJECT",
		description: data.description
			? getLocalizedText(data.description, locale)
			: project?.hubTagline ?? "",
		year: data.year ?? "—",
		type: getPortfolioProjectPlateSecondary(project?.id, locale)
			|| data.type
			|| project?.hubKind
			|| "DIGITAL PROJECT",
		url: data.url ?? null,
		gallery: data.gallery?.length ? data.gallery : project?.hubLogo ? [project.hubLogo] : [],
		currentProjectLabel: getLocalizedText(CURRENT_PROJECT_COPY, locale),
		visitSiteLabel: getLocalizedText(VISIT_SITE_COPY, locale),
	};
}
