import { getNavItemLabel } from "@/i18n/siteCopy.js";
import { getPortfolioProjectName } from "@/i18n/portfolioProjectsCopy.js";

const PATH_TO_NAV = {
	"/": "main",
	"/portfolio": "portfolio",
	"/about": "about",
	"/contacts": "contacts",
	"/lab": "lab",
};

/** Заголовок страницы для верхней HUD-панели. */
export function resolveTopHudPageTitle(pathname, locale) {
	const normalizedPath = String(pathname ?? "/").replace(/\/+$/, "") || "/";
	if (normalizedPath.startsWith("/portfolio/")) {
		return getNavItemLabel("portfolio", locale);
	}

	const key = PATH_TO_NAV[normalizedPath];
	if (key) {
		return getNavItemLabel(key, locale);
	}

	return getNavItemLabel("main", locale);
}

/** Only the case title; the breadcrumb separator is rendered independently. */
export function resolveTopHudCaseCrumb(pathname, locale) {
	const normalizedPath = String(pathname ?? "/").replace(/\/+$/, "") || "/";
	const match = normalizedPath.match(/^\/portfolio\/([^/]+)/);
	if (!match) {
		return "";
	}

	const projectTitle = getPortfolioProjectName(match[1], locale);
	return projectTitle || "";
}
