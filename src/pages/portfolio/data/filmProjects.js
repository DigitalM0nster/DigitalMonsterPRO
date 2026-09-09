import { plannedPortfolioProjects } from "./plannedProjects.js";

const media = {
 nipigas: { video: "/video/portfolio/nipigas-720.mp4", videoLow: "/video/portfolio/nipigas-960.mp4", detail: "Календарь нашей памяти", en: "A calendar of our memory", zh: "记忆日历", accent: "#b19a76", sideCopy: { ru: "ИСТОРИЯ\nДАТЫ\nПАМЯТЬ", en: "HISTORY\nDATES\nMEMORY", zh: "历史\n日期\n记忆" } },
 hubarch: { detail: "Архитектура в цифровом пространстве", en: "Architecture in digital space", zh: "数字空间中的建筑", accent: "#a5bdca", sideCopy: { ru: "ФОРМА\nСВЕТ\nСРЕДА", en: "FORM\nLIGHT\nSPACE", zh: "形态\n光线\n空间" } },
 ostankino: { detail: "Медиа. Характер. Масштаб.", en: "Media. Character. Scale.", zh: "媒体 · 个性 · 规模", accent: "#b9c965", sideCopy: { ru: "МЕДИА\nГОЛОС\nМАСШТАБ", en: "MEDIA\nVOICE\nSCALE", zh: "媒体\n声音\n规模" } },
 "mmk-1": { detail: "Индустриальный характер", en: "Industrial character", zh: "工业风格", accent: "#d39e74", sideCopy: { ru: "СИЛА\nВЫСОТА\nРАЗМАХ", en: "POWER\nHEIGHT\nREACH", zh: "力量\n高度\n视野" } },
 "belka-production": { detail: "Идеи в движении", en: "Ideas in motion", zh: "创意在行动", accent: "#e58d53", sideCopy: { ru: "ИДЕИ\nЦВЕТ\nРИТМ", en: "IDEAS\nCOLOUR\nRHYTHM", zh: "创意\n色彩\n节奏" } },
};

// Only published media enter the film. The complete approved order stays in plannedProjects.
export const filmProjects = plannedPortfolioProjects.filter(({ id }) => media[id]).map((project) => ({
	...project,
	...media[project.id],
	poster: `/images/portfolio/film/${project.id}.webp`,
}));

export const filmCopy = {
	ru: { eyebrow: "ПОРТФОЛИО / ИЗБРАННОЕ", inspect: "РАССМОТРЕТЬ", back: "К ОБЗОРУ", play: "ВОСПРОИЗВЕСТИ", pause: "ПАУЗА", hint: "СКРОЛЛ — ПРОЕКТЫ", still: "ПРОЕКТ", video: "ВИДЕО", prev: "НАЗАД", next: "ДАЛЕЕ", sidePrimary: "ИЗБРАННЫЕ", sideSecondary: "ПРОЕКТЫ", sideStatus: "ПРОСМОТР" },
	en: { eyebrow: "PORTFOLIO / SELECTED WORK", inspect: "EXPLORE", back: "OVERVIEW", play: "PLAY", pause: "PAUSE", hint: "SCROLL TO EXPLORE", still: "PROJECT", video: "MOTION", prev: "PREV", next: "NEXT", sidePrimary: "SELECTED", sideSecondary: "WORKS", sideStatus: "VIEWING" },
	zh: { eyebrow: "作品集 / 精选作品", inspect: "查看", back: "返回总览", play: "播放", pause: "暂停", hint: "滚动浏览作品", still: "项目", video: "视频", prev: "上一个", next: "下一个", sidePrimary: "精选", sideSecondary: "作品", sideStatus: "查看" },
};
