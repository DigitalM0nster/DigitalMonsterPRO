import { getSiteCopy } from "@/i18n/siteCopy.js";
import { normalizeSiteLocale } from "@/utils/siteLocale.js";
import { store } from "@/store.jsx";

/** Названия проектов в списке /portfolio (HUD + плиты) — всегда CAPS. */
export const PORTFOLIO_PROJECT_NAMES = {
	"01": {
		ru: "НИПИГАЗ",
		en: "NIPIGAS",
		zh: "NIPIGAS",
	},
	"02": {
		ru: "TROOF",
		en: "TROOF",
		zh: "TROOF",
	},
	"03": {
		ru: "ОСТАНКИНО",
		en: "OSTANKINO",
		zh: "OSTANKINO",
	},
	"04": {
		ru: "MMK-1",
		en: "MMK-1",
		zh: "MMK-1",
	},
	"05": {
		ru: "RE-EVOLUTION",
		en: "RE-EVOLUTION",
		zh: "RE-EVOLUTION",
	},
	"06": {
		ru: "СТУДИЯ БЕЛКИ",
		en: "BELKA PRODUCTION",
		zh: "BELKA PRODUCTION",
	},
	"07": {
		ru: "HUBARCH",
		en: "HUBARCH",
		zh: "HUBARCH",
	},
};

/** Белая подпись на плите хаба (secondary, над названием проекта). */
export const PORTFOLIO_PROJECT_PLATE_SECONDARY = {
	"01": {
		ru: "интерактивный юбилейный сайт",
		en: "interactive anniversary website",
		zh: "互动周年纪念网站",
	},
	"02": {
		ru: "кровельные системы и услуги",
		en: "roofing systems and services",
		zh: "屋面系统与服务",
	},
	"03": {
		ru: "интерактивный каталог офисов",
		en: "interactive office catalogue",
		zh: "互动式办公室目录",
	},
	"04": {
		ru: "аренда башенных кранов",
		en: "tower crane rental",
		zh: "塔式起重机租赁",
	},
	"05": {
		ru: "креативное агентство полного цикла",
		en: "full-cycle creative agency",
		zh: "全方位创意代理机构",
	},
	"06": {
		ru: "продакшн-студия полного цикла",
		en: "full-cycle production studio",
		zh: "全流程制作工作室",
	},
	"07": {
		ru: "архитектурное портфолио",
		en: "architecture portfolio",
		zh: "建筑作品集",
	},
};

/** Кнопка «Смотреть кейс» на плитах портфолио и в мобильных кейсах. */
export const PORTFOLIO_VIEW_CASE_BUTTON_COPY = {
	ru: "Смотреть кейс",
	en: "View case",
	zh: "查看案例",
};

export function getPortfolioLocale() {
	return normalizeSiteLocale(store.siteLocale);
}

/** @param {string} projectId @param {unknown} [locale] */
export function getPortfolioProjectName(projectId, locale = getPortfolioLocale()) {
	const copy = PORTFOLIO_PROJECT_NAMES[projectId];
	if (!copy) {
		return "";
	}

	return getSiteCopy(copy, locale);
}

/** @param {string} projectId @param {unknown} [locale] */
export function getPortfolioProjectPlateSecondary(projectId, locale = getPortfolioLocale()) {
	const copy = PORTFOLIO_PROJECT_PLATE_SECONDARY[projectId];
	if (!copy) {
		return "";
	}

	return getSiteCopy(copy, locale);
}

/** Список проектов на canvas всегда в CAPS (как hero title). */
export function getPortfolioProjectListUppercase() {
	return true;
}

/** @param {unknown} [locale] */
export function getPortfolioViewCaseButtonLabel(locale = getPortfolioLocale()) {
	return getSiteCopy(PORTFOLIO_VIEW_CASE_BUTTON_COPY, locale);
}
