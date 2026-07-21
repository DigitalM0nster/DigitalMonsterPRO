/** Список проектов портфолио: навигация хаба, маршруты кейсов, hubLogo. */
import {
	getPortfolioLocale,
	getPortfolioProjectName,
	getPortfolioProjectPlateSecondary,
} from "@/i18n/portfolioProjectsCopy.js";
/** Видимых пунктов в меню без колёсика (все текущие проекты). */
export const PORTFOLIO_MENU_VISIBLE_COUNT = 7;

export const projectsData = [
	{
		id: "01",
		slug: "01",
		name: "НИПИГАЗ",
		path: "/portfolio/01",
		hubLogo: "/images/portfolio/case1.webp",
		hubTagline: "интерактивный юбилейный сайт",
		hubKind: "интерактивный юбилейный сайт",
		hubPlateSignal: "3D · WEB",
		hubPlateLabel: {
			secondary: "интерактивный юбилейный сайт",
		},
	},
	{
		id: "02",
		slug: "02",
		name: "Troof",
		path: "/portfolio/02",
		hubLogo: "/images/portfolio/case2.webp",
		hubTagline: "Кровельные системы и услуги",
		hubKind: "Кровельные системы и услуги",
		hubPlateSignal: "CORP · B2B",
		hubPlateLabel: {
			secondary: "Кровельные системы и услуги",
		},
	},
	{
		id: "03",
		slug: "03",
		name: "Ostankino",
		path: "/portfolio/03",
		hubLogo: "/images/portfolio/case6.webp",
		hubTagline: "Интерактивный каталог офисов",
		hubKind: "Интерактивный каталог офисов",
		hubPlateSignal: "SPACE · SELECT",
		hubPlateLabel: {
			secondary: "Интерактивный каталог офисов",
		},
	},
	{
		id: "04",
		slug: "04",
		name: "MMK-1",
		path: "/portfolio/04",
		hubLogo: "/images/portfolio/case3.webp",
		hubTagline: "Аренда башенных кранов",
		hubKind: "Аренда башенных кранов",
		hubPlateSignal: "RENT · FLEET",
		hubPlateLabel: {
			secondary: "Аренда башенных кранов",
		},
		/** Accent bloom: маска по targetColor + channelBoost (PortfolioLogoMaterial). */
		logoAccent: {
			targetColor: [1, 0.35, 0],
			tolerance: 0.8,
			channelBoost: [5.7, 2, 0],
		},
	},
	{
		id: "05",
		slug: "05",
		name: "RE-EVOLUTION",
		path: "/portfolio/05",
		hubLogo: "/images/portfolio/case5.webp",
		hubTagline: "Креативное агентство полного цикла",
		hubKind: "Креативное агентство полного цикла",
		hubPlateSignal: "BRAND · MOTION",
		hubPlateLabel: {
			secondary: "Креативное агентство полного цикла",
		},
		logoAccent: {
			targetColor: [0.898, 0.075, 0.525],
			tolerance: 0.45,
			channelBoost: [4, 0.1, 3],
		},
	},
	{
		id: "06",
		slug: "06",
		name: "Belka Production",
		path: "/portfolio/06",
		hubLogo: "/images/portfolio/case4.webp",
		hubTagline: "Продакшн-студия полного цикла",
		hubKind: "Продакшн-студия полного цикла",
		hubPlateSignal: "SHOW · REEL",
		hubPlateLabel: {
			secondary: "Продакшн-студия полного цикла",
		},
		logoAccent: {
			targetColor: [0, 0.722, 0.898],
			tolerance: 0.5,
			channelBoost: [0, 7.5, 10],
		},
	},
	{
		id: "07",
		slug: "07",
		name: "Hubarch",
		path: "/portfolio/07",
		hubLogo: "/images/portfolio/case7.webp",
		hubTagline: "Архитектурное портфолио",
		hubKind: "Архитектурное портфолио",
		hubPlateSignal: "ARCH · GRID",
		hubPlateLabel: {
			secondary: "Архитектурное портфолио",
		},
	},
];

/** @typedef {{ secondary?: string, primary?: string }} HubPlateLabelCopy */

/**
 * Сегменты подписи плиты: secondary — белый тонкий, primary — голубой со свечением.
 * @param {typeof projectsData[number]} project
 * @param {import('@/utils/siteLocale.js').SiteLocale} [locale]
 * @returns {Array<{ text: string, role: 'secondary' | 'primary' }>}
 */
export function getHubPlateLabelSegments(project, locale = getPortfolioLocale()) {
	const custom = project.hubPlateLabel;
	const localizedName = getPortfolioProjectName(project.id, locale);

	if (custom?.primary || custom?.secondary) {
		const segments = [];
		const localizedSecondary =
			getPortfolioProjectPlateSecondary(project.id, locale) || custom.secondary;
		if (localizedSecondary) {
			segments.push({ text: String(localizedSecondary).trim(), role: "secondary" });
		}
		segments.push({ text: localizedName, role: "primary" });
		if (segments.length > 0) {
			return segments;
		}
	}

	const legacyText = project.hubPlateText ?? project.hubTagline ?? project.hubKind ?? "Проект";
	return parseHubPlateLabelSegments(String(legacyText));
}

/** Legacy: строка с «·» — до последней точки белое, последняя часть — акцент. */
export function parseHubPlateLabelSegments(text) {
	const raw = String(text).trim();
	if (raw.includes("·")) {
		const parts = raw.split("·").map((part) => part.trim()).filter(Boolean);
		if (parts.length >= 2) {
			return [
				{ text: parts.slice(0, -1).join(" · "), role: "secondary" },
				{ text: parts[parts.length - 1], role: "primary" },
			];
		}
	}

	return [{ text: raw, role: "primary" }];
}

/** Нет accent — bloom только через общий emissiveBoost слоя. */
export const DEFAULT_LOGO_ACCENT = {
	enabled: false,
	targetColor: [1, 1, 1],
	tolerance: 0.35,
	channelBoost: [1, 1, 1],
};

/**
 * Accent bloom для кейса из projectsData.logoAccent.
 * @param {number} projectIndex
 */
export function getLogoAccent(projectIndex) {
	if (projectIndex < 0) {
		return DEFAULT_LOGO_ACCENT;
	}

	const accent = projectsData[projectIndex]?.logoAccent;
	if (!accent) {
		return DEFAULT_LOGO_ACCENT;
	}

	return {
		enabled: true,
		targetColor: accent.targetColor ?? [1, 1, 1],
		tolerance: accent.tolerance ?? 0.35,
		channelBoost: accent.channelBoost ?? [1, 1, 1],
	};
}

/** Dev-панель: гарантирует объект logoAccent на кейсе. */
export function ensureLogoAccent(projectIndex) {
	const project = projectsData[projectIndex];
	if (!project) {
		return null;
	}
	if (!project.logoAccent) {
		project.logoAccent = {
			targetColor: [1, 1, 1],
			tolerance: 0.35,
			channelBoost: [1, 1, 1],
		};
	}
	return project.logoAccent;
}

/** @deprecated */
export function getLogoChannelBoost(projectIndex) {
	return getLogoAccent(projectIndex).channelBoost;
}

/** @deprecated */
export function ensureLogoChannelBoost(projectIndex) {
	const accent = ensureLogoAccent(projectIndex);
	return accent?.channelBoost ?? DEFAULT_LOGO_ACCENT.channelBoost;
}

export function getPortfolioProjectByPath(pathname) {
	return projectsData.find((p) => p.path === pathname) ?? null;
}

/** id сцены SceneManager → pathname (карусель + кейсы). */
export function sceneIdToPage(sceneId) {
	if (sceneId === "home") {
		return "/";
	}
	if (sceneId === "portfolioHub") {
		return "/portfolio";
	}
	if (sceneId === "about") {
		return "/about";
	}
	if (sceneId === "contacts") {
		return "/contacts";
	}

	const caseProject = projectsData.find((p) => `case${p.slug}` === sceneId);
	return caseProject?.path ?? null;
}

export function isPortfolioSectionPath(pathname) {
	return pathname.startsWith("/portfolio");
}

export function isPortfolioHubPath(pathname) {
	const normalized = String(pathname ?? "/").replace(/\/+$/, "") || "/";
	return normalized === "/portfolio";
}

export function isPortfolioCasePath(pathname) {
	return projectsData.some((p) => p.path === pathname);
}

/**
 * Какой звук ухода играть при смене роута портфолио.
 * @returns {'portfolio_leave' | null}
 */
export function resolvePortfolioLeaveSound(displayPathname, targetPathname) {
	if (
		isPortfolioHubPath(displayPathname) &&
		!isPortfolioHubPath(targetPathname)
	) {
		return "portfolio_leave";
	}
	return null;
}
