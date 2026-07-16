import nipigas from "../projects/nipigas/index.js";
import troof from "../projects/troof/index.js";
import mmk1 from "../projects/mmk1/index.js";
import belkaProduction from "../projects/belkaProduction/index.js";
import reEvolution from "../projects/reEvolution/index.js";
import ostankino from "../projects/ostankino/index.js";
import hubarch from "../projects/hubarch/index.js";

/** @type {import('./types.js').PortfolioProjectModule[]} */
const ALL_PROJECTS = [nipigas, troof, mmk1, reEvolution, ostankino, belkaProduction, hubarch];

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
