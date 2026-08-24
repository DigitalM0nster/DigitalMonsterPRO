/**
 * Preloader warm for case panel HUD (target model):
 * paint stage 0/1 canvases for every renderTextInScene project × locale,
 * upload GPU textures onto each case scene’s panelHud, keep them for the session.
 */
import { getAllPortfolioProjects } from "@/pages/portfolio/core/projectRegistry.js";
import { getAllCapabilityHudProjects } from "@/pages/capabilities/data/capabilityHudProjects.js";
import { buildCaseStudyFrameData } from "@/pages/portfolio/core/caseStudyFrameData.js";
import { resolveSceneId } from "@/three/scenes/resolveSceneId.js";
import { SITE_LOCALES, normalizeSiteLocale } from "@/functions/siteLocale.js";
import { store } from "@/app/store.jsx";
import { requestSharedAnimationFrame } from "@/functions/sharedAnimationFrame.js";
import { ensureCaseStudyCanvasFonts } from "./caseStudyCanvasText.js";
import {
	paintCaseStudyPanelHudFrame,
	paintCaseStudyPanelHudChrome,
} from "./paintCaseStudyPanelHud.js";
import {
	resolveCaseProjectCanvasNavigationData,
	resolveCaseProjectCanvasNavigationLayout,
} from "./caseProjectCanvasNavigation.js";
import { resolveLeftPanelDrawConfig } from "./caseStudyLeftPanelConfig.js";
import { readIsMobileViewport } from "@/pages/portfolio/core/useCaseStudyMobileViewport.js";
import { syncCasePanelHudDisplayedLocale } from "@/pages/portfolio/core/casePanelHudLocaleMix.js";

/** @type {Map<string, WarmHudEntry>} */
const cache = new Map();

/** @type {import('@/three/scenes/SceneManager.js').SceneManager | null} */
let warmSceneManager = null;
/** @type {import('three').WebGLRenderer | null} */
let warmRenderer = null;

function getAllWarmHudProjects() {
	const unique = new Map();
	for (const project of [
		...getAllPortfolioProjects(),
		...getAllCapabilityHudProjects(),
	]) {
		if (!project?.config?.caseStudy?.renderTextInScene) {
			continue;
		}
		const key = project.config.slug ?? project.config.id ?? project.config.route;
		unique.set(key, project);
	}
	return [...unique.values()];
}

/**
 * @typedef {{
 *   route: string,
 *   locale: string,
 *   viewportW: number,
 *   viewportH: number,
 *   fromCanvas: HTMLCanvasElement,
 *   toCanvas: HTMLCanvasElement,
 *   mosaicBounds: object | null,
 *   hitRegions: any[],
 *   mosaic: object,
 *   contentKey: string,
 *   chromeCanvas: HTMLCanvasElement | null,
 *   chromeHitRegions: any[],
 *   chromeBounds: object | null,
 * }} WarmHudEntry
 */

function yieldToNextPaint() {
	return new Promise((resolve) => requestSharedAnimationFrame(() => resolve()));
}

function cacheKey(route, locale, viewportW, viewportH) {
	return `${route}|${normalizeSiteLocale(locale)}|${viewportW}x${viewportH}`;
}

function getProjectPanelHudRoutes(project) {
	return Array.from(new Set([
		project.config.route,
		...(project.config.caseStudy?.panelHudRoutes ?? []),
	].map((route) => String(route ?? "/").replace(/\/+$/, "") || "/")));
}

function cacheProjectEntry(project, locale, viewportW, viewportH, entry) {
	for (const route of getProjectPanelHudRoutes(project)) {
		cache.set(cacheKey(route, locale, viewportW, viewportH), entry);
	}
}

function buildMosaic(fromCanvas, mosaicBounds, viewportW) {
	const drawCfg = resolveLeftPanelDrawConfig(viewportW);
	const vw = Math.max(1, mosaicBounds?.viewportW ?? fromCanvas.width);
	const vh = Math.max(1, mosaicBounds?.viewportH ?? fromCanvas.height);
	const contentRectUv = mosaicBounds
		? {
			minX: mosaicBounds.x / vw,
			maxX: (mosaicBounds.x + mosaicBounds.width) / vw,
			minY: 1 - (mosaicBounds.y + mosaicBounds.height) / vh,
			maxY: 1 - mosaicBounds.y / vh,
		}
		: { minX: 0, maxX: 1, minY: 0, maxY: 1 };

	return {
		columns: Math.max(1, Math.round(drawCfg.mosaicColumns ?? 28)),
		rows: Math.max(1, Math.round(drawCfg.mosaicRows ?? 24)),
		liftStrength: drawCfg.mosaicLiftStrength ?? 0.005,
		randomLift: drawCfg.mosaicRandomLift ?? 150,
		scatterX: drawCfg.mosaicScatterX ?? 0,
		delay: drawCfg.mosaicDelay ?? 0.75,
		canvasWidth: fromCanvas.width,
		canvasHeight: fromCanvas.height,
		rectUv: contentRectUv,
		contentRectUv,
	};
}

/**
 * Approximate brand→nav band when SiteTopHud is not mounted yet.
 * @param {number} viewportH
 * @param {{ allProjects?: { y: number } } | null} projectNavLayout
 */
function estimateVerticalZone(viewportH, projectNavLayout) {
	const headerTop = projectNavLayout?.headerTop
		?? ((projectNavLayout?.allProjects?.y ?? 136) + (projectNavLayout?.allProjects?.h ?? 28) + 14);
	const zoneTop = Math.round(headerTop);
	const zoneBottom = Math.round(Math.max(zoneTop + 120, viewportH - 48));
	const zoneHeight = zoneBottom - zoneTop;
	if (zoneHeight <= 0) {
		return null;
	}
	return { zoneTop, zoneBottom, zoneHeight };
}

/**
 * @param {import('@/pages/portfolio/core/types.js').PortfolioProjectModule} project
 * @param {string} locale
 * @param {number} viewportW
 * @param {number} viewportH
 * @returns {WarmHudEntry | null}
 */
function paintProjectEntry(project, locale, viewportW, viewportH) {
	const siteLocale = normalizeSiteLocale(locale);
	const state0 = project.states[0];
	if (!state0) {
		return null;
	}

	const fromCanvas = document.createElement("canvas");
	const toCanvas = document.createElement("canvas");
	const projectNavigationData = resolveCaseProjectCanvasNavigationData(project, siteLocale);
	const cachedZoneRef = { current: null };
	const current = buildCaseStudyFrameData(project, state0, 0, state0.id, {
		isInvestigating: false,
		locale: siteLocale,
	});
	const state1 = project.states[1];
	const next = state1
		? buildCaseStudyFrameData(project, state1, 1, state1.id, {
			isInvestigating: false,
			locale: siteLocale,
		})
		: null;

	const paintArgs = {
		viewportW,
		viewportH,
		project,
		siteLocale,
		pathname: project.config.route,
		projectNavigationData,
		panelConfigRevision: 0,
		hideProjectNavigation: false,
		cachedZoneRef,
	};

	// Seed zone estimate so warm layout matches runtime band before SiteTopHud exists.
	const navLayout = resolveCaseProjectCanvasNavigationLayout(viewportW, viewportH, null);
	const estimated = estimateVerticalZone(viewportH, navLayout);
	if (estimated) {
		cachedZoneRef.current = {
			key: `${siteLocale}|${viewportW}|${viewportH}|0`,
			zone: estimated,
		};
	}

	const fromResult = paintCaseStudyPanelHudFrame({
		...paintArgs,
		canvas: fromCanvas,
		frame: { ...current, scrollProgress: 0 },
	});
	if (!fromResult) {
		return null;
	}

	if (next) {
		paintCaseStudyPanelHudFrame({
			...paintArgs,
			canvas: toCanvas,
			frame: { ...next, scrollProgress: 0 },
		});
	} else {
		const ctx = toCanvas.getContext("2d");
		if (ctx) {
			toCanvas.width = fromCanvas.width;
			toCanvas.height = fromCanvas.height;
			ctx.drawImage(fromCanvas, 0, 0);
		}
	}

	const mosaicBounds = fromResult.mosaicBounds ?? null;
	const mosaic = buildMosaic(fromCanvas, mosaicBounds, viewportW);
	const contentKey = [
		current.activeStateId,
		next?.activeStateId ?? "",
		siteLocale,
		viewportW,
		viewportH,
		0,
		0,
		0,
		project.config.route,
	].join("|");

	const chromeCanvas = document.createElement("canvas");
	const chromePainted = paintCaseStudyPanelHudChrome({
		canvas: chromeCanvas,
		viewportW,
		viewportH,
		project,
		pathname: project.config.route,
		projectNavigationData,
		hideProjectNavigation: false,
	});

	return {
		route: project.config.route,
		locale: siteLocale,
		viewportW,
		viewportH,
		fromCanvas,
		toCanvas: next ? toCanvas : fromCanvas,
		mosaicBounds,
		hitRegions: fromResult.hitRegions ?? [],
		mosaic,
		contentKey,
		chromeCanvas,
		chromeHitRegions: chromePainted?.hitRegions ?? [],
		chromeBounds: chromePainted?.chromeBounds ?? null,
	};
}

/**
 * @param {import('@/three/scenes/SceneManager.js').SceneManager} sceneManager
 * @param {import('three').WebGLRenderer} renderer
 * @param {import('@/pages/portfolio/core/types.js').PortfolioProjectModule} project
 * @param {WarmHudEntry} entry
 */
function uploadEntryToScene(sceneManager, renderer, project, entry) {
	const uploadedSceneIds = new Set();
	for (const route of getProjectPanelHudRoutes(project)) {
		const sceneId = resolveSceneId(route);
		if (uploadedSceneIds.has(sceneId)) {
			continue;
		}
		uploadedSceneIds.add(sceneId);
		const panelHud = sceneManager.getSceneById?.(sceneId)?.panelHud;
		panelHud?.applyWarmCanvases?.(entry.fromCanvas, entry.toCanvas, entry.mosaic, renderer);
	}
}

/**
 * @param {{ sceneManager: import('@/three/scenes/SceneManager.js').SceneManager, renderer: import('three').WebGLRenderer }} args
 */
export async function warmCasePanelHudUnderCurtain({ sceneManager, renderer }) {
	warmSceneManager = sceneManager;
	warmRenderer = renderer;

	if (typeof document === "undefined" || readIsMobileViewport()) {
		return;
	}

	await ensureCaseStudyCanvasFonts();
	await yieldToNextPaint();

	const viewportW = Math.max(1, window.innerWidth);
	const viewportH = Math.max(1, window.innerHeight);
	const projects = getAllWarmHudProjects();
	if (projects.length === 0) {
		return;
	}

	const activeLocale = normalizeSiteLocale(store.siteLocale);

	for (const locale of SITE_LOCALES) {
		for (const project of projects) {
			if (sceneManager.disposed) {
				return;
			}
			await yieldToNextPaint();
			const entry = paintProjectEntry(project, locale, viewportW, viewportH);
			if (!entry) {
				throw new Error(`[casePanelHud] warm paint produced no entry for ${project?.config?.route} (${locale})`);
			}
			cacheProjectEntry(project, locale, viewportW, viewportH, entry);
			if (locale === activeLocale) {
				uploadEntryToScene(sceneManager, renderer, project, entry);
			}
		}
	}

	syncCasePanelHudDisplayedLocale(activeLocale);
}

/**
 * After loader locale pick — swap GPU textures to the chosen locale before Start.
 * @param {string} locale
 */
export async function rewarmCasePanelHudGpuForLocale(locale) {
	if (!warmSceneManager || !warmRenderer || readIsMobileViewport()) {
		return;
	}

	const siteLocale = normalizeSiteLocale(locale);
	const viewportW = Math.max(1, window.innerWidth);
	const viewportH = Math.max(1, window.innerHeight);
	const projects = getAllWarmHudProjects();

	await ensureCaseStudyCanvasFonts();

	for (const project of projects) {
		if (warmSceneManager.disposed) {
			return;
		}
		await yieldToNextPaint();
		const key = cacheKey(project.config.route, siteLocale, viewportW, viewportH);
		let entry = cache.get(key);
		if (!entry) {
			entry = paintProjectEntry(project, siteLocale, viewportW, viewportH);
			if (!entry) {
				throw new Error(`[casePanelHud] locale rewarm produced no entry for ${project?.config?.route}`);
			}
			cacheProjectEntry(project, siteLocale, viewportW, viewportH, entry);
		}
		if (entry) {
			uploadEntryToScene(warmSceneManager, warmRenderer, project, entry);
		}
	}
}

/**
 * Painter adopts pre-painted canvases so first publish does not allocate new GPU textures.
 * @returns {WarmHudEntry | null}
 */
export function adoptWarmCasePanelHud(route, locale, viewportW, viewportH) {
	const exact = cache.get(cacheKey(route, locale, viewportW, viewportH));
	if (exact) {
		return exact;
	}

	// Allow minor CSS size drift: prefer same route+locale at any cached viewport.
	const prefix = `${route}|${normalizeSiteLocale(locale)}|`;
	for (const [key, entry] of cache) {
		if (key.startsWith(prefix)) {
			return entry;
		}
	}
	return null;
}

/**
 * Read-only lookup for capability hex composition. These canvases are painted
 * and GPU-warmed under the preloader; internal scene wipes only rebind them.
 */
export function getWarmCasePanelHud(route, locale, viewportW, viewportH) {
	return adoptWarmCasePanelHud(route, locale, viewportW, viewportH);
}

export function clearWarmCasePanelHudCache() {
	cache.clear();
	warmSceneManager = null;
	warmRenderer = null;
}
