/** Поддерживаемые языки сайта (порядок = цикл в кнопке языка). */
export const SITE_LOCALES = ["ru", "en", "zh"];

/** @typedef {(typeof SITE_LOCALES)[number]} SiteLocale */

/** @param {unknown} value */
export function normalizeSiteLocale(value) {
	if (value === "en" || value === "zh") {
		return value;
	}
	return "ru";
}

/** @param {unknown} current */
export function getNextSiteLocale(current) {
	const normalized = normalizeSiteLocale(current);
	const index = SITE_LOCALES.indexOf(normalized);
	return SITE_LOCALES[(index + 1) % SITE_LOCALES.length];
}

/** @param {unknown} locale */
export function getSiteLocaleLabel(locale) {
	const labels = {
		ru: "RU",
		en: "EN",
		zh: "ZH",
	};
	return labels[normalizeSiteLocale(locale)];
}

/** @param {HTMLElement | null | undefined} group */
export function getLanguageGroupLocale(group) {
	if (!group) {
		return null;
	}

	return SITE_LOCALES.find((locale) => group.classList.contains(locale)) ?? null;
}
