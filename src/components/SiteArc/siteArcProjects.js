/**
 * Right-arc nav items = portfolio projects (cyclic ring).
 */
import { getAllPortfolioProjects } from "@/pages/portfolio/core/projectRegistry.js";
import { getPortfolioProjectName } from "@/pages/portfolio/data/portfolioProjectsCopy.js";
import { normalizeSiteLocale } from "@/functions/siteLocale.js";
import { siteArcInternals } from "./siteArcConfig.js";
import { getSiteArcNavigationSource } from "./siteArcNavigationSource.js";
import { store } from "@/app/store.jsx";
import { getSceneCarousel } from "@/three/render/transition/carouselPage.js";

const CAROUSEL_SCENE_TO_SITE_ARC_ID = {
	home: "main",
	portfolioHub: "portfolio",
	capabilities: "capabilities",
	about: "about",
	contacts: "contacts",
};

/** Click preview before route commit — glow/labels move immediately. */
let previewActiveProjectId = null;
/** True from click until hex/boundary drive is observed (covers the pre-nav frame gap). */
let previewAwaitingNavigation = false;
/** True once a live hex/boundary drive was seen while preview is set. */
let previewSawNavigation = false;
/** Navigation drive ended; resolver decides whether it committed or cancelled. */
let previewNavigationFinished = false;

/**
 * @param {string | null | undefined} projectId
 */
export function setSiteArcPreviewProjectId(projectId) {
	previewActiveProjectId = projectId ?? null;
	previewAwaitingNavigation = Boolean(projectId);
	previewSawNavigation = false;
	previewNavigationFinished = false;
}

export function getSiteArcPreviewProjectId() {
	return previewActiveProjectId;
}

export function clearSiteArcPreviewProjectId() {
	previewActiveProjectId = null;
	previewAwaitingNavigation = false;
	previewSawNavigation = false;
	previewNavigationFinished = false;
}

/**
 * Keep preview during click→hex gap; drop it if leave/hex was cancelled.
 * @param {boolean} navigating
 */
export function syncSiteArcPreviewNavigation(navigating) {
	if (!previewActiveProjectId) {
		return;
	}
	if (navigating) {
		previewAwaitingNavigation = false;
		previewSawNavigation = true;
		previewNavigationFinished = false;
		return;
	}
	if (previewAwaitingNavigation) {
		// Click just happened; hex may not have armed yet — keep preview.
		return;
	}
	if (previewSawNavigation) {
		// SceneCarousel commits synchronously; the Valtio mirror may still lag by
		// one paint. Let the resolver compare against carousel.currentId first.
		previewNavigationFinished = true;
	}
}

/**
 * Even gap used for the cyclic project ring (deg between neighbours).
 * @param {number} count
 */
export function resolveSiteArcRingGapDeg(count) {
	const internal = siteArcInternals;
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
export function resolveSiteArcProjectItems(locale, activeProjectId = null) {
	const siteSource = getSiteArcNavigationSource();
	if (siteSource?.items?.length) {
		const items = siteSource.items.map((item, index) => ({
			...item,
			registryIndex: index,
			routeNumber: item.routeNumber ?? String(index + 1).padStart(2, "0"),
			scrollAnchor: siteSource.items.length <= 1 ? 0 : index / (siteSource.items.length - 1),
		}));
		// The carousel commit is the visual ownership hand-off. React's
		// displayPathname intentionally lags during the transition, so using only
		// source.activeId would start the focus spin late. Read the committed scene
		// directly for the site ring; capabilities keep their nested-route id.
		const carousel = getSceneCarousel();
		const committedSiteId = siteSource.key === "site"
			? CAROUSEL_SCENE_TO_SITE_ARC_ID[carousel?.currentId ?? store.sceneCarouselCurrentId]
			: null;
		const targetSiteId = siteSource.key === "site" && carousel?.isHexNavigationActive?.()
			? CAROUSEL_SCENE_TO_SITE_ARC_ID[carousel.getHexTargetSceneId?.()]
			: null;
		const hasItem = (id) => Boolean(id && items.some((item) => item.id === id));
		const previewConfirmed = Boolean(
			previewActiveProjectId && (
				previewActiveProjectId === committedSiteId ||
				previewActiveProjectId === siteSource.activeId
			)
		);
		const previewCancelled = Boolean(
			previewActiveProjectId && previewNavigationFinished && !previewConfirmed
		);
		const previewId = !previewCancelled && hasItem(previewActiveProjectId)
			? previewActiveProjectId
			: null;
		const targetId = hasItem(targetSiteId) ? targetSiteId : null;
		const committedId = hasItem(committedSiteId) ? committedSiteId : null;
		const activeId = previewId ?? targetId ?? committedId ?? siteSource.activeId;
		const activeNavIndex = Math.max(0, items.findIndex((item) => item.id === activeId));

		if (previewActiveProjectId) {
			if (previewConfirmed || previewNavigationFinished) {
				clearSiteArcPreviewProjectId();
			}
		}
		const ringGapDeg = resolveSiteArcRingGapDeg(items.length);
		return {
			items,
			activeNavIndex,
			ringGapDeg,
			ringPeriodDeg: items.length * ringGapDeg,
		};
	}
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
	let effectiveId = previewActiveProjectId ?? activeProjectId;
	// Route caught up — drop click preview.
	if (previewActiveProjectId && previewActiveProjectId === activeProjectId) {
		clearSiteArcPreviewProjectId();
	} else if (previewActiveProjectId && previewNavigationFinished) {
		clearSiteArcPreviewProjectId();
		effectiveId = activeProjectId;
	}
	const activeNavIndex = items.findIndex((item) => item.id === effectiveId);
	const ringGapDeg = resolveSiteArcRingGapDeg(items.length);
	const ringPeriodDeg = items.length * ringGapDeg;
	return {
		items,
		activeNavIndex,
		ringGapDeg,
		ringPeriodDeg,
	};
}
