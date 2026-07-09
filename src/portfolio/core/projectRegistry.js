import nipigas from "../projects/nipigas/index.js";
import troof from "../projects/troof/index.js";
import mmk1 from "../projects/mmk1/index.js";
import belkaProduction from "../projects/belkaProduction/index.js";
import { createPlaceholderProject } from "./createPlaceholderProject.js";

const reEvolution = createPlaceholderProject({
	id: "05",
	slug: "reEvolution",
	route: "/portfolio/05",
	title: "RE-EVOLUTION",
	summary: "Сайт креативного агентства — контент в подготовке",
	hubLogo: "/images/portfolio/case5.webp",
});

const ostankino = createPlaceholderProject({
	id: "06",
	slug: "ostankino",
	route: "/portfolio/06",
	title: "Ostankino",
	summary: "Сайт-визитка — контент в подготовке",
	hubLogo: "/images/portfolio/case6.webp",
});

const hubarch = createPlaceholderProject({
	id: "07",
	slug: "hubarch",
	route: "/portfolio/07",
	title: "Hubarch",
	summary: "Архитектурное портфолио — контент в подготовке",
	hubLogo: "/images/portfolio/case7.webp",
});

/** @type {import('./types.js').PortfolioProjectModule[]} */
const ALL_PROJECTS = [nipigas, troof, mmk1, belkaProduction, reEvolution, ostankino, hubarch];

/** @type {Map<string, import('./types.js').PortfolioProjectModule>} */
const bySlug = new Map(ALL_PROJECTS.map((p) => [p.config.slug, p]));

/** @type {Map<string, import('./types.js').PortfolioProjectModule>} */
const byRoute = new Map(ALL_PROJECTS.map((p) => [p.config.route, p]));

/**
 * @param {string} slug
 * @returns {import('./types.js').PortfolioProjectModule | null}
 */
export function getProjectBySlug(slug) {
	return bySlug.get(slug) ?? null;
}

/**
 * @param {string} pathname
 * @returns {import('./types.js').PortfolioProjectModule | null}
 */
export function getProjectByRoute(pathname) {
	const normalized = String(pathname ?? "/").replace(/\/+$/, "") || "/";
	return byRoute.get(normalized) ?? null;
}

/** @returns {import('./types.js').PortfolioProjectModule[]} */
export function getAllPortfolioProjects() {
	return ALL_PROJECTS.slice();
}

/**
 * Hotspots активного state.
 * @param {import('./types.js').PortfolioProjectModule} project
 * @param {string} stateId
 * @returns {import('./types.js').PortfolioHotspot[]}
 */
export function getHotspotsForState(project, stateId) {
	return project.hotspots[stateId] ?? [];
}
