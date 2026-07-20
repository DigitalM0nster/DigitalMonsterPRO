/**
 * Preloader warm for About left-panel HUD.
 * Paint text1/text2/text3 × locales, upload onto AboutScene.panelHud, keep for session.
 */
import { SITE_LOCALES, normalizeSiteLocale } from "@/utils/siteLocale.js";
import { store } from "@/store.jsx";
import { requestSharedAnimationFrame } from "@/utils/sharedAnimationFrame.js";
import { ensureCaseStudyCanvasFonts } from "@/portfolio/ui/CaseStudyCanvas/caseStudyCanvasText.js";
import { readIsMobileViewport } from "@/portfolio/core/useCaseStudyMobileViewport.js";
import {
	ensureAboutPanelHudCanvases,
	getAboutPanelHudSessionBuffers,
	publishAboutPanelHudContentMode,
	resetAboutPanelHudStorySession,
} from "@/about/aboutPanelHudStory.js";
import {
	setAboutPanelHudEnterProgress,
	setAboutPanelHudMixProgress,
} from "@/about/aboutPanelHudBridge.js";
import { syncAboutPanelHudDisplayedLocale } from "@/about/aboutPanelHudLocaleMix.js";

/** @type {import('@/three/scenes/SceneManager.js').SceneManager | null} */
let warmSceneManager = null;
/** @type {import('three').WebGLRenderer | null} */
let warmRenderer = null;

function yieldToNextPaint() {
	return new Promise((resolve) => requestSharedAnimationFrame(() => resolve()));
}

/**
 * @param {import('@/three/scenes/SceneManager.js').SceneManager} sceneManager
 * @param {import('three').WebGLRenderer} renderer
 */
function uploadAboutWarm(sceneManager, renderer) {
	const scene = sceneManager.getSceneById?.("about");
	const panelHud = scene?.panelHud;
	const buffers = getAboutPanelHudSessionBuffers();
	if (!panelHud?.applyWarmCanvases || !buffers) {
		return;
	}
	publishAboutPanelHudContentMode("text1");
	setAboutPanelHudMixProgress(0);
	// Hidden until Start appear — never count as a live visit arm.
	setAboutPanelHudEnterProgress(0);
	resetAboutPanelHudStorySession();
	syncAboutPanelHudDisplayedLocale(store.siteLocale);
	// Warm all story layers so continuous scroll never first-uploads text3/empty.
	panelHud.applyWarmCanvases(
		buffers.text1Canvas,
		buffers.text2Canvas,
		buffers.mosaic,
		renderer,
		[buffers.text3Canvas, buffers.emptyCanvas],
	);
}

/**
 * @param {{ sceneManager: import('@/three/scenes/SceneManager.js').SceneManager, renderer: import('three').WebGLRenderer }} args
 */
export async function warmAboutPanelHudUnderCurtain({ sceneManager, renderer }) {
	warmSceneManager = sceneManager;
	warmRenderer = renderer;

	if (typeof document === "undefined" || readIsMobileViewport()) {
		return;
	}

	await ensureCaseStudyCanvasFonts();
	await yieldToNextPaint();

	const viewportW = Math.max(1, window.innerWidth);
	const viewportH = Math.max(1, window.innerHeight);
	const activeLocale = normalizeSiteLocale(store.siteLocale);

	for (const locale of SITE_LOCALES) {
		if (sceneManager.disposed) {
			return;
		}
		await yieldToNextPaint();
		try {
			const ok = await ensureAboutPanelHudCanvases({
				locale,
				viewportW,
				viewportH,
				force: true,
			});
			if (!ok) {
				continue;
			}
			if (locale === activeLocale) {
				uploadAboutWarm(sceneManager, renderer);
			}
		} catch (error) {
			console.warn("[aboutPanelHud] warm paint failed", locale, error);
		}
	}

	await ensureAboutPanelHudCanvases({
		locale: activeLocale,
		viewportW,
		viewportH,
		force: false,
	});
	uploadAboutWarm(sceneManager, renderer);
}

/**
 * After loader locale pick — swap About GPU textures before Start.
 * @param {string} locale
 */
/**
 * Re-upload current session canvases into the About HUD keepAlive pool
 * without resetting visit arm / enterProgress / visibility (locale or resize while live).
 */
export function reuploadAboutPanelHudWarmPool() {
	if (!warmSceneManager || !warmRenderer || readIsMobileViewport()) {
		return;
	}
	const scene = warmSceneManager.getSceneById?.("about");
	const panelHud = scene?.panelHud;
	const buffers = getAboutPanelHudSessionBuffers();
	if (!panelHud?.warmTexturePool || !buffers) {
		return;
	}
	panelHud.warmTexturePool(
		[
			buffers.text1Canvas,
			buffers.text2Canvas,
			buffers.text3Canvas,
			buffers.emptyCanvas,
		],
		warmRenderer,
	);
}

export async function rewarmAboutPanelHudGpuForLocale(locale) {
	if (!warmSceneManager || !warmRenderer || readIsMobileViewport()) {
		return;
	}

	const siteLocale = normalizeSiteLocale(locale);
	const viewportW = Math.max(1, window.innerWidth);
	const viewportH = Math.max(1, window.innerHeight);

	await ensureCaseStudyCanvasFonts();
	await yieldToNextPaint();

	const ok = await ensureAboutPanelHudCanvases({
		locale: siteLocale,
		viewportW,
		viewportH,
		force: true,
	});
	if (!ok) {
		return;
	}

	uploadAboutWarm(warmSceneManager, warmRenderer);
}

export function clearWarmAboutPanelHud() {
	warmSceneManager = null;
	warmRenderer = null;
}
