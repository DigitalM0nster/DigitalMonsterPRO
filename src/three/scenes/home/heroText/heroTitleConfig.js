import { store } from "@/store.jsx";
import { normalizeSiteLocale } from "@/utils/siteLocale.js";

/** Конфиг hero-надписи (digital-monster TextMesh). */
export const HERO_TITLE_LINES = ["DIGITAL", "MONSTER"];

export const HERO_COPY = {
	ru: {
		tagline: ["Создаём сайты и цифровые миры, которые оживают"],
		stack: ["3D / AR / VR / WebGPU"],
	},
	en: {
		tagline: ["We build websites and digital worlds that come alive"],
		stack: ["3D / AR / VR / WebGPU"],
	},
	zh: {
		tagline: ["我们打造栩栩如生的网站与数字世界"],
		stack: ["3D / AR / VR / WebGPU"],
	},
};

export function getHeroLocale() {
	return normalizeSiteLocale(store.siteLocale);
}

export function getHeroTaglineLines(locale = getHeroLocale()) {
	return HERO_COPY[locale]?.tagline ?? HERO_COPY.ru.tagline;
}

export function getHeroStackLines(locale = getHeroLocale()) {
	return HERO_COPY[locale]?.stack ?? HERO_COPY.ru.stack;
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
	fontWeight: 300,
	fontColor: "#8ce8ff",
	letterSpacing: 0.22,
};

export const HERO_TEXT_LAYOUT = {
	canvasWidth: 2048,
	appearDurationMs: 1000,
};
