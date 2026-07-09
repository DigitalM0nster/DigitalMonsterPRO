import { normalizeSiteLocale } from "@/utils/siteLocale.js";

/** Подписи пунктов левого меню. */
export const NAV_ITEM_COPY = {
	main: {
		ru: "Главная",
		en: "Main",
		zh: "首页",
	},
	portfolio: {
		ru: "Портфолио",
		en: "Portfolio",
		zh: "作品集",
	},
	about: {
		ru: "О нас",
		en: "About",
		zh: "关于我们",
	},
	contacts: {
		ru: "Контакты",
		en: "Contacts",
		zh: "联系我们",
	},
	lab: {
		ru: "Лаборатория",
		en: "Lab",
		zh: "实验室",
	},
};

/** Подсказка скролла на главной. */
export const HERO_SCROLL_HINT_COPY = {
	ru: "ЛИСТАЙТЕ ВНИЗ",
	en: "SCROLL TO EXPLORE",
	zh: "向下滚动探索",
};

/** Подпись «страница» в верхнем HUD. */
export const TOP_HUD_PAGE_LABEL_COPY = {
	ru: "Страница",
	en: "Page",
	zh: "页面",
};

/** Подпись «звук» в верхнем HUD. */
export const TOP_HUD_SOUND_LABEL_COPY = {
	ru: "Звук",
	en: "Sound",
	zh: "声音",
};

export const TOP_HUD_SOUND_STATUS_COPY = {
	on: {
		ru: "вкл",
		en: "on",
		zh: "开",
	},
	off: {
		ru: "выкл",
		en: "off",
		zh: "关",
	},
};

export const TOP_HUD_SOUND_TOGGLE_ARIA_COPY = {
	on: {
		ru: "Выключить звук",
		en: "Mute sound",
		zh: "关闭声音",
	},
	off: {
		ru: "Включить звук",
		en: "Enable sound",
		zh: "开启声音",
	},
};

/** @param {Record<string, string>} copyMap @param {unknown} locale */
export function getSiteCopy(copyMap, locale) {
	const normalized = normalizeSiteLocale(locale);
	return copyMap[normalized] ?? copyMap.ru;
}

/** @param {string} itemId @param {unknown} locale */
export function getNavItemLabel(itemId, locale) {
	return getSiteCopy(NAV_ITEM_COPY[itemId] ?? NAV_ITEM_COPY.main, locale);
}

/** @param {unknown} locale */
export function getTopHudPageLabel(locale) {
	return getSiteCopy(TOP_HUD_PAGE_LABEL_COPY, locale);
}

/** @param {unknown} locale */
export function getTopHudSoundLabel(locale) {
	return getSiteCopy(TOP_HUD_SOUND_LABEL_COPY, locale);
}

/** @param {boolean} active @param {unknown} locale */
export function getTopHudSoundStatus(active, locale) {
	return getSiteCopy(active ? TOP_HUD_SOUND_STATUS_COPY.on : TOP_HUD_SOUND_STATUS_COPY.off, locale);
}

/** @param {boolean} active @param {unknown} locale */
export function getTopHudSoundToggleAria(active, locale) {
	return getSiteCopy(active ? TOP_HUD_SOUND_TOGGLE_ARIA_COPY.on : TOP_HUD_SOUND_TOGGLE_ARIA_COPY.off, locale);
}
