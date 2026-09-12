import { plannedPortfolioProjects } from "./plannedProjects.js";

const media = {
 nipigas: { video: "/video/portfolio/nipigas-presentation-v11-1080.mp4", videoLow: "/video/portfolio/nipigas-presentation-v11-540.mp4", detail: "Интерактивные проекты", en: "Interactive experiences", zh: "互动项目", accent: "#b19a76", sideCopy: { ru: "ИСТОРИЯ\nЛЮДИ\nСОБЫТИЯ", en: "HISTORY\nPEOPLE\nEVENTS", zh: "历史\n人物\n活动" } },
 hubarch: { video: "/video/portfolio/hubarch-presentation-v10-1080.mp4", videoLow: "/video/portfolio/hubarch-presentation-v10-540.mp4", detail: "Архитектура в цифровом пространстве", en: "Architecture in digital space", zh: "数字空间中的建筑", accent: "#a5bdca", sideCopy: { ru: "ФОРМА\nСВЕТ\nСРЕДА", en: "FORM\nLIGHT\nSPACE", zh: "形态\n光线\n空间" } },
 ostankino: { video: "/video/portfolio/ostankino-presentation-v10-1080.mp4", videoLow: "/video/portfolio/ostankino-presentation-v10-540.mp4", detail: "Медиа. Характер. Масштаб.", en: "Media. Character. Scale.", zh: "媒体 · 个性 · 规模", accent: "#b9c965", sideCopy: { ru: "МЕДИА\nГОЛОС\nМАСШТАБ", en: "MEDIA\nVOICE\nSCALE", zh: "媒体\n声音\n规模" } },
 globtravlink: { video: "/video/portfolio/globtravlink-presentation-v10-1080.mp4", videoLow: "/video/portfolio/globtravlink-presentation-v10-540.mp4", detail: "Платформа путешествий и возможностей", en: "A platform for travel and opportunity", zh: "旅行与机遇平台", accent: "#26b7c8", sideCopy: { ru: "ЛЮДИ\nМАРШРУТЫ\nСВЯЗИ", en: "PEOPLE\nROUTES\nCONNECTIONS", zh: "人们\n路线\n连接" } },
 "universe-travel": { video: "/video/portfolio/universe-travel-presentation-v10-1080.mp4", videoLow: "/video/portfolio/universe-travel-presentation-v10-540.mp4", detail: "Туризм и бизнес в одной экосистеме", en: "Travel and business in one ecosystem", zh: "旅行与商业的统一生态系统", accent: "#2485db", sideCopy: { ru: "МИР\nБИЗНЕС\nВОЗМОЖНОСТИ", en: "WORLD\nBUSINESS\nOPPORTUNITY", zh: "世界\n商业\n机遇" } },
 "mmk-1": { video: "/video/portfolio/mmk-1-presentation-v10-1080.mp4", videoLow: "/video/portfolio/mmk-1-presentation-v10-540.mp4", detail: "Индустриальный характер", en: "Industrial character", zh: "工业风格", accent: "#d39e74", sideCopy: { ru: "СИЛА\nВЫСОТА\nРАЗМАХ", en: "POWER\nHEIGHT\nREACH", zh: "力量\n高度\n视野" } },
 "belka-production": { video: "/video/portfolio/belka-production-presentation-v10-1080.mp4", videoLow: "/video/portfolio/belka-production-presentation-v10-540.mp4", detail: "Идеи в движении", en: "Ideas in motion", zh: "创意在行动", accent: "#e58d53", sideCopy: { ru: "ИДЕИ\nЦВЕТ\nРИТМ", en: "IDEAS\nCOLOUR\nRHYTHM", zh: "创意\n色彩\n节奏" } },
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
