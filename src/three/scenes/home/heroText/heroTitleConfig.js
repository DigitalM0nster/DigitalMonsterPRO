import { store } from "@/app/store.jsx";
import { normalizeSiteLocale } from "@/functions/siteLocale.js";
import { getHeroResponsiveLayout } from "./heroResponsiveLayout.js";

/** Конфиг hero-надписи (digital-monster TextMesh). */
export const HERO_TITLE_LINES = ["DIGITAL", "MONSTER"];

export const HERO_COPY = {
	ru: {
		tagline: [
			"Создаём интерактивные сайты и digital-продукты.",
			"Расширяем границы возможного.",
		],
		stack: ["ИНТЕРАКТИВНЫЕ САЙТЫ / ВЕБ-ПРИЛОЖЕНИЯ / ИНТЕРАКТИВНЫЕ ПРОЕКТЫ"],
	},
	en: {
		tagline: [
			"We create interactive websites and digital products.",
			"Expanding the boundaries of what's possible.",
		],
		stack: ["INTERACTIVE WEBSITES / WEB APPLICATIONS / INTERACTIVE PROJECTS"],
	},
	zh: {
		tagline: [
			"我们打造互动网站与数字产品。",
			"拓展可能的边界。",
		],
		stack: ["互动网站 / 网页应用 / 互动项目"],
	},
};

export function getHeroLocale() {
	return normalizeSiteLocale(store.siteLocale);
}

export const HERO_COMPACT_COPY = {
	ru: { tagline: ["Создаём интерактивные сайты", "и digital-продукты.", "Расширяем границы возможного."],
		stack: ["ИНТЕРАКТИВНЫЕ САЙТЫ", "ВЕБ-ПРИЛОЖЕНИЯ", "ИНТЕРАКТИВНЫЕ ПРОЕКТЫ"] },
	en: { tagline: ["We create interactive websites", "and digital products.", "Expanding what's possible."],
		stack: ["INTERACTIVE WEBSITES", "WEB APPLICATIONS", "INTERACTIVE PROJECTS"] },
	zh: HERO_COPY.zh,
};

export function getHeroTaglineLines(locale = getHeroLocale()) {
	const layout = typeof window !== "undefined" && getHeroResponsiveLayout(window.innerWidth, window.innerHeight);
	const copy = layout.compact && !layout.landscape ? HERO_COMPACT_COPY : HERO_COPY;
	return copy[locale]?.tagline ?? copy.ru.tagline;
}

export function getHeroStackLines(locale = getHeroLocale()) {
	const copy = typeof window !== "undefined" && getHeroResponsiveLayout(window.innerWidth, window.innerHeight).compact ? HERO_COMPACT_COPY : HERO_COPY;
	return copy[locale]?.stack ?? copy.ru.stack;
}

const HERO_CJK_FONT_FALLBACK = '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif';

/** Jura не покрывает иероглифы — для zh добавляем системный CJK-fallback. */
export function getHeroSubtitleFontFamily(locale = getHeroLocale()) {
	if (normalizeSiteLocale(locale) === "zh") {
		return `Jura, ${HERO_CJK_FONT_FALLBACK}`;
	}
	return HERO_SUBTITLE_FONT.fontFamily;
}

export function getHeroStackFontFamily(locale = getHeroLocale()) {
	if (normalizeSiteLocale(locale) === "zh") {
		return `Jura, ${HERO_CJK_FONT_FALLBACK}`;
	}
	return HERO_STACK_FONT.fontFamily;
}

export const HERO_TITLE_FONT = {
	fontFamily: "Aquire",
	fontSize: 100,
	lineHeight: 90,
	fontWeight: 300,
	fontColor: "#ffffff",
};

export const HERO_SUBTITLE_FONT = {
	fontFamily: "Jura",
	fontSize: 25,
	lineHeight: 35,
	fontWeight: 100,
	fontColor: "#ffffff",
};

export const HERO_STACK_FONT = {
	fontFamily: "Jura",
	fontSize: 14,
	lineHeight: 28,
	fontWeight: 400,
	fontColor: "#ffffff",
	letterSpacing: 0.18,
};

export const HERO_TEXT_LAYOUT = {
	canvasWidth: 2048,
	appearDurationMs: 1000,
};
