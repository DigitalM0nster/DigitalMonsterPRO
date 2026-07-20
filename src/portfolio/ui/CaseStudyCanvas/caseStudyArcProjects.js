/**
 * Right-arc nav items = portfolio projects (cyclic ring).
 */
import { getAllPortfolioProjects } from "@/portfolio/core/projectRegistry.js";
import { getPortfolioProjectName } from "@/i18n/portfolioProjectsCopy.js";
import { normalizeSiteLocale } from "@/utils/siteLocale.js";
import { caseStudyArcInternals } from "./caseStudyArcConfig.js";

/** Click preview before route commit — glow/labels move immediately. */
let previewActiveProjectId = null;
/** True from click until hex/boundary drive is observed (covers the pre-nav frame gap). */
let previewAwaitingNavigation = false;
/** True once a live hex/boundary drive was seen while preview is set. */
let previewSawNavigation = false;

/**
 * @param {string | null | undefined} projectId
 */
export function setCaseStudyArcPreviewProjectId(projectId) {
	previewActiveProjectId = projectId ?? null;
	previewAwaitingNavigation = Boolean(projectId);
	previewSawNavigation = false;
}

export function getCaseStudyArcPreviewProjectId() {
	return previewActiveProjectId;
}

export function clearCaseStudyArcPreviewProjectId() {
	previewActiveProjectId = null;
	previewAwaitingNavigation = false;
	previewSawNavigation = false;
}

/**
 * Keep preview during click→hex gap; drop it if leave/hex was cancelled.
 * @param {boolean} navigating
 */
export function syncCaseStudyArcPreviewNavigation(navigating) {
	if (!previewActiveProjectId) {
		return;
	}
	if (navigating) {
		previewAwaitingNavigation = false;
		previewSawNavigation = true;
		return;
	}
	if (previewAwaitingNavigation) {
		// Click just happened; hex may not have armed yet — keep preview.
		return;
	}
	if (previewSawNavigation) {
		// Drive ended without route matching preview → cancelled leave.
		clearCaseStudyArcPreviewProjectId();
	}
}

/**
 * Even gap used for the cyclic project ring (deg between neighbours).
 * @param {number} count
 */
export function resolveCaseStudyArcRingGapDeg(count) {
	const internal = caseStudyArcInternals;
	if (count <= 1) {
		return 0;
	}
	const arcSpanDeg = internal.fadeEndDeg * 2 - internal.fadeInsetDeg * 2;
	// Keep the design gap when it fits; otherwise compress so a full window stays inside the wedge.
	const windowSlots = Math.min(count, internal.maxNavItems ?? 5);
	const maxGapForWindow = windowSlots <= 1 ? internal.itemGapDeg : arcSpanDeg / (windowSlots - 1);
	return Math.min(internal.itemGapDeg, maxGapForWindow);
}

/**
 * Project display number from route (`/portfolio/05` → `05`).
 * @param {string | undefined} route
 * @param {number} fallbackIndex — 0-based
 */
export function resolvePortfolioRouteNumber(route, fallbackIndex = 0) {
	const match = String(route ?? "").match(/\/portfolio\/(\d+)/i);
	if (match) {
		return match[1].padStart(2, "0");
	}
	return String(fallbackIndex + 1).padStart(2, "0");
}

/**
 * @param {string} [locale]
 * @param {string | null} [activeProjectId]
 * @returns {{
 *   items: Array<{
 *     id: string,
 *     pathTitle: string,
 *     title: string,
 *     route: string,
 *     routeNumber: string,
 *     registryIndex: number,
 *     scrollAnchor: number,
 *   }>,
 *   activeNavIndex: number,
 *   ringGapDeg: number,
 *   ringPeriodDeg: number,
 * }}
 */
export function resolveCaseStudyArcProjectItems(locale, activeProjectId = null) {
	const siteLocale = normalizeSiteLocale(locale);
	const projects = getAllPortfolioProjects()
		.map((project, registryIndex) => ({ project, registryIndex }))
		.sort((a, b) => {
			const aNum = Number.parseInt(resolvePortfolioRouteNumber(a.project.config.route, a.registryIndex), 10);
			const bNum = Number.parseInt(resolvePortfolioRouteNumber(b.project.config.route, b.registryIndex), 10);
			return aNum - bNum;
		});
	const items = projects.map(({ project, registryIndex }, index) => {
		const name = (
			getPortfolioProjectName(project.config.id, siteLocale) || project.config.title || ""
		).toUpperCase();
		return {
			id: project.config.id,
			pathTitle: name,
			title: name,
			route: project.config.route,
			routeNumber: resolvePortfolioRouteNumber(project.config.route, registryIndex),
			registryIndex,
			scrollAnchor: projects.length <= 1 ? 0 : index / (projects.length - 1),
		};
	});
	const effectiveId = previewActiveProjectId ?? activeProjectId;
	// Route caught up — drop click preview.
	if (previewActiveProjectId && previewActiveProjectId === activeProjectId) {
		previewActiveProjectId = null;
	}
	const activeNavIndex = items.findIndex((item) => item.id === effectiveId);
	const ringGapDeg = resolveCaseStudyArcRingGapDeg(items.length);
	const ringPeriodDeg = items.length * ringGapDeg;
	return {
		items,
		activeNavIndex,
		ringGapDeg,
		ringPeriodDeg,
	};
}
