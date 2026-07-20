/**
 * About story → left HUD mix / content.
 *
 * Binding contract: `ABOUT_PANEL_HUD.md`
 * — only story → (from, to, mixProgress); no enter-appear for text1/2/3.
 *
 * Uploads only on locale / viewport change — mixProgress is a uniform every frame.
 */
import { store } from "@/store.jsx";
import { normalizeSiteLocale } from "@/utils/siteLocale.js";
import { ensureCaseStudyCanvasFonts } from "@/portfolio/ui/CaseStudyCanvas/caseStudyCanvasText.js";
import { paintCaseStudyPanelHudFrame } from "@/portfolio/ui/CaseStudyCanvas/paintCaseStudyPanelHud.js";
import { resolveLeftPanelDrawConfig } from "@/portfolio/ui/CaseStudyCanvas/caseStudyLeftPanelConfig.js";
import { resolveCaseProjectCanvasNavigationLayout } from "@/portfolio/ui/CaseStudyCanvas/caseProjectCanvasNavigation.js";
import { readIsMobileViewport } from "@/portfolio/core/useCaseStudyMobileViewport.js";
import { getAboutPanelCopy } from "./aboutPanelCopy.js";
import {
	getAboutPanelHudState,
	setAboutPanelHudEnterProgress,
	setAboutPanelHudMixProgress,
	setAboutPanelHudState,
} from "@/about/aboutPanelHudBridge.js";
import {
	cancelAboutPanelHudReveal,
	isAboutPanelHudRevealBusy,
} from "@/about/aboutPanelHudReveal.js";
import { isAboutPanelHudLocaleMixBusy } from "@/about/aboutPanelHudBridge.js";

/** @typedef {'text1' | 'text2' | 'text3' | 'empty'} AboutHudLayerId */

const ABOUT_HUD_PROJECT = {
	config: {
		id: "about",
		route: "/about",
		title: "About",
		caseStudy: {
			hideCategoryLabel: true,
			hideTags: true,
			useSectionBadge: true,
			chapterBase: 1,
			metricsLayout: "verticalList",
			contentTopPx: 176,
			panelWidth: { min: 460, max: 560, ratio: 0.27 },
		},
	},
	states: [
		{ id: "text1" },
		{ id: "text2" },
		{ id: "text3" },
	],
};

/** @type {HTMLCanvasElement | null} */
let text1Canvas = null;
/** @type {HTMLCanvasElement | null} */
let text2Canvas = null;
/** @type {HTMLCanvasElement | null} */
let text3Canvas = null;
/** @type {HTMLCanvasElement | null} */
let emptyCanvas = null;
/** @type {object | null} */
let mosaic = null;
/** @type {string} */
let paintKey = "";
/** @type {string} */
let contentPairKey = "none";
/** @type {number} */
let lastStoryVisual = 0;

function clamp01(value) {
	return Math.max(0, Math.min(1, Number(value) || 0));
}

function clampStoryVisual(story) {
	return Math.max(0, Math.min(4, Number(story) || 0));
}

/**
 * @param {'text1' | 'text2' | 'text3'} blockId
 * @param {string} locale
 * @param {number} index
 */
function buildFrame(blockId, locale, index) {
	const copy = getAboutPanelCopy(blockId, locale);
	const chapterNum = String(index + 1).padStart(2, "0");
	const pathTitle = (copy.pathTitle ?? "").toUpperCase();
	const features = (copy.listItems ?? []).map((title) => ({ title }));

	return {
		categoryLabel: "",
		sectionBadge: `${chapterNum} / ${pathTitle}`,
		title: copy.title,
		description: copy.descriptionParagraphs.join("\n\n"),
		descriptionParagraphs: copy.descriptionParagraphs,
		tags: [],
		metrics: [],
		features,
		chapterNum,
		chapterBase: 1,
		pathTitle,
		footerLabel: "",
		statsValueFirst: false,
		metricsLayout: "verticalList",
		anchorFooterBlock: false,
		arcNavigationEvenSpacing: false,
		leftPanelOverrides: {
			maxFeatures: Math.max(5, features.length),
			// Match case reference panel: muted description (not white @ 0.78).
			descriptionUseThemeMuted: true,
		},
		contentTopPx: 176,
		states: ABOUT_HUD_PROJECT.states,
		activeStateId: blockId,
		activeStateIndex: index,
		activeProjectId: "about",
		locale: normalizeSiteLocale(locale),
		contentAlpha: 1,
		scrollProgress: 0,
	};
}

/**
 * Case default mosaicDelay (~0.75) hides tile motion until late mix.
 * About often receives overflow handoff that auto-chases story 0→1 on enter —
 * with a high delay that looks like a freeze, then only the wipe tail.
 * Keep stagger, but start tiles early enough for the first segment chase.
 */
const ABOUT_MOSAIC_DELAY = 0.38;

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
		delay: ABOUT_MOSAIC_DELAY,
		canvasWidth: fromCanvas.width,
		canvasHeight: fromCanvas.height,
		rectUv: contentRectUv,
		contentRectUv,
		chromeFollowEnter: false,
	};
}

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
 * Front-half wipe: mosaic finishes in the first 0.5 of each story segment,
 * second half holds the settled band while 3D keeps chasing the soft About spring.
 * @param {number} local 0…1 inside a story segment
 */
export function stageLocalToHudMix(local) {
	const t = clamp01(local);
	return t < 0.5 ? clamp01(t * 2) : 1;
}

/**
 * Strict story → pair map (ABOUT_PANEL_HUD.md).
 * @param {number} story
 * @returns {{ from: AboutHudLayerId, to: AboutHudLayerId, mix: number }}
 */
export function resolveAboutPanelHudStoryPair(story) {
	const s = clampStoryVisual(story);
	if (s < 1) {
		return { from: "text1", to: "text2", mix: stageLocalToHudMix(s) };
	}
	if (s < 2) {
		return { from: "text2", to: "text3", mix: stageLocalToHudMix(s - 1) };
	}
	if (s < 3) {
		return { from: "text3", to: "empty", mix: stageLocalToHudMix(s - 2) };
	}
	return { from: "empty", to: "empty", mix: 1 };
}

/**
 * Idle enterProgress for story content — never starts an appear animation.
 * Skips while route-leave reveal is running.
 * @param {AboutHudLayerId} from
 * @param {number} mix
 */
function applyIdleEnterForStoryPair(from, mix) {
	if (isAboutPanelHudRevealBusy()) {
		return;
	}
	const fullyEmpty = from === "empty" && mix >= 0.999;
	// null = full show (shader idle path). 0 = hidden. No 0→1 appear on About.
	setAboutPanelHudEnterProgress(fullyEmpty ? 0 : null);
}

/**
 * Paint text1 / text2 / text3 / empty buffers when locale or viewport changes.
 * @param {{ locale?: string, viewportW?: number, viewportH?: number, force?: boolean }} [opts]
 */
export async function ensureAboutPanelHudCanvases(opts = {}) {
	if (typeof document === "undefined" || readIsMobileViewport()) {
		return false;
	}

	const locale = normalizeSiteLocale(opts.locale ?? store.siteLocale);
	const viewportW = Math.max(1, opts.viewportW ?? window.innerWidth);
	const viewportH = Math.max(1, opts.viewportH ?? window.innerHeight);
	const nextKey = `${locale}|${viewportW}x${viewportH}`;
	if (
		!opts.force
		&& paintKey === nextKey
		&& text1Canvas?.width
		&& text2Canvas?.width
		&& text3Canvas?.width
		&& emptyCanvas?.width
	) {
		return true;
	}

	await ensureCaseStudyCanvasFonts();

	const cachedZoneRef = { current: null };
	const navLayout = resolveCaseProjectCanvasNavigationLayout(viewportW, viewportH, null);
	const estimated = estimateVerticalZone(viewportH, navLayout);
	if (estimated) {
		cachedZoneRef.current = {
			key: `${locale}|${viewportW}|${viewportH}|0`,
			zone: estimated,
		};
	}

	const paintArgs = {
		viewportW,
		viewportH,
		project: ABOUT_HUD_PROJECT,
		siteLocale: locale,
		panelConfigRevision: 0,
		hideProjectNavigation: true,
		cachedZoneRef,
	};

	const c1 = document.createElement("canvas");
	const c2 = document.createElement("canvas");
	const c3 = document.createElement("canvas");
	const empty = document.createElement("canvas");

	const fromResult = paintCaseStudyPanelHudFrame({
		...paintArgs,
		canvas: c1,
		frame: buildFrame("text1", locale, 0),
	});
	if (!fromResult) {
		return false;
	}

	paintCaseStudyPanelHudFrame({
		...paintArgs,
		canvas: c2,
		frame: buildFrame("text2", locale, 1),
	});
	paintCaseStudyPanelHudFrame({
		...paintArgs,
		canvas: c3,
		frame: buildFrame("text3", locale, 2),
	});

	empty.width = c1.width;
	empty.height = c1.height;
	const emptyCtx = empty.getContext("2d");
	emptyCtx?.clearRect(0, 0, empty.width, empty.height);

	text1Canvas = c1;
	text2Canvas = c2;
	text3Canvas = c3;
	emptyCanvas = empty;
	mosaic = buildMosaic(c1, fromResult.mosaicBounds ?? null, viewportW);
	paintKey = nextKey;
	return true;
}

/** Session paint buffers for warm upload / diagnostics. */
export function getAboutPanelHudSessionBuffers() {
	if (
		!text1Canvas?.width
		|| !text2Canvas?.width
		|| !text3Canvas?.width
		|| !emptyCanvas?.width
		|| !mosaic
	) {
		return null;
	}
	return {
		text1Canvas,
		text2Canvas,
		text3Canvas,
		emptyCanvas,
		mosaic,
		paintKey,
	};
}

/**
 * @param {AboutHudLayerId} layerId
 * @param {NonNullable<ReturnType<typeof getAboutPanelHudSessionBuffers>>} buffers
 */
function canvasForLayer(layerId, buffers) {
	if (layerId === "text1") return buffers.text1Canvas;
	if (layerId === "text2") return buffers.text2Canvas;
	if (layerId === "text3") return buffers.text3Canvas;
	return buffers.emptyCanvas;
}

/**
 * Publish from/to canvases for a stage pair.
 * Default: rebind only (no GPU upload) — pixels live in the warm pool.
 * Pass `{ upload: true }` after locale/viewport repaint.
 * @param {AboutHudLayerId} fromId
 * @param {AboutHudLayerId} toId
 * @param {{ upload?: boolean }} [opts]
 */
export function publishAboutPanelHudPair(fromId, toId, opts = {}) {
	const buffers = getAboutPanelHudSessionBuffers();
	if (!buffers) {
		return false;
	}

	const from = canvasForLayer(fromId, buffers);
	const to = canvasForLayer(toId, buffers);
	const upload = opts.upload === true;
	contentPairKey = `${fromId}->${toId}`;
	setAboutPanelHudState({
		fromCanvas: from,
		toCanvas: to,
		hitRegions: [],
		mosaic: buffers.mosaic,
		// Empty WeakSet ⇒ nothing dirty (null would mean “all dirty”).
		dirtyCanvases: upload ? [from, to] : [],
		bumpTexture: true,
	});
	return Boolean(getAboutPanelHudState().fromCanvas?.width);
}

/**
 * Warm / legacy helper — maps a single layer id to its idle pair.
 * @param {'text1' | 'text2' | 'text3' | 'empty'} mode
 * @param {{ upload?: boolean }} [opts]
 */
export function publishAboutPanelHudContentMode(mode, opts = {}) {
	if (mode === "empty") {
		return publishAboutPanelHudPair("empty", "empty", opts);
	}
	if (mode === "text1") {
		return publishAboutPanelHudPair("text1", "text2", opts);
	}
	if (mode === "text2") {
		return publishAboutPanelHudPair("text2", "text3", opts);
	}
	if (mode === "text3") {
		return publishAboutPanelHudPair("text3", "empty", opts);
	}
	return false;
}

/**
 * Map story → from/to + mixProgress. Never starts enter-appear.
 * @param {number} storyProgress
 */
export function syncAboutPanelHudFromStory(storyProgress) {
	if (readIsMobileViewport()) {
		return;
	}

	const story = clampStoryVisual(storyProgress);
	lastStoryVisual = story;
	// Locale mosaic owns from/to + mixProgress until settle.
	if (isAboutPanelHudLocaleMixBusy()) {
		return;
	}
	const { from, to, mix } = resolveAboutPanelHudStoryPair(story);
	const pairKey = `${from}->${to}`;

	if (contentPairKey !== pairKey || !getAboutPanelHudState().fromCanvas) {
		publishAboutPanelHudPair(from, to);
	}

	setAboutPanelHudMixProgress(mix);
	applyIdleEnterForStoryPair(from, mix);
}

/**
 * Ensure buffers + publish current pair. Prefer warm session canvases — do not
 * force-repaint on ordinary route enter (that raced the first stage mosaic).
 * @param {number} entryStory
 * @param {{ forcePaint?: boolean }} [opts]
 */
export async function prepareAboutPanelHudForEnter(entryStory = 0, opts = {}) {
	if (readIsMobileViewport()) {
		return false;
	}

	const ok = await ensureAboutPanelHudCanvases({ force: opts.forcePaint === true });
	if (!ok) {
		return false;
	}

	// Story/rAF may have advanced during await — always re-read live story.
	const live = Number(store.aboutExperience?.storyProgress) || 0;
	const story = clampStoryVisual(Math.max(Number(entryStory) || 0, lastStoryVisual, live));
	lastStoryVisual = story;
	const { from, to, mix } = resolveAboutPanelHudStoryPair(story);
	const published = publishAboutPanelHudPair(from, to, {
		upload: opts.forcePaint === true,
	});
	setAboutPanelHudMixProgress(mix);

	cancelAboutPanelHudReveal();
	applyIdleEnterForStoryPair(from, mix);
	return published;
}

/** True after this visit has shown left HUD from warm/publish. */
let visitArmed = false;
/** @type {Promise<boolean> | null} */
let visitArmPromise = null;

export function isAboutPanelHudVisitArmed() {
	return visitArmed;
}

/**
 * Arm left HUD when About is the visual route.
 * Warm canvases are already on the GPU — show text1 immediately (enterProgress=null).
 * Never hide until async prepare finishes.
 *
 * Once visitArmed / chase is live, arm must NOT own mixProgress — story publish does.
 * Rewinding mix to a stale arm argument freezes the first stage wipe.
 * @param {number} [storyProgress]
 */
export function armAboutPanelHudForRoute(storyProgress = 0) {
	if (!store.appStarted || readIsMobileViewport()) {
		return Promise.resolve(false);
	}

	const requested = clampStoryVisual(storyProgress);
	// Never rewind — hex bake / commit may arm with 0 while story already advanced.
	lastStoryVisual = Math.max(lastStoryVisual, requested);

	if (visitArmed) {
		const { from, mix } = resolveAboutPanelHudStoryPair(lastStoryVisual);
		applyIdleEnterForStoryPair(from, mix);
		return Promise.resolve(true);
	}

	if (visitArmPromise) {
		return visitArmPromise;
	}

	// Sync path: reuse preloader warm buffers so text is already present on enter.
	const buffers = getAboutPanelHudSessionBuffers();
	if (buffers) {
		cancelAboutPanelHudReveal();
		const { from, to, mix } = resolveAboutPanelHudStoryPair(lastStoryVisual);
		publishAboutPanelHudPair(from, to);
		setAboutPanelHudMixProgress(mix);
		applyIdleEnterForStoryPair(from, mix);
		visitArmed = true;
		return Promise.resolve(true);
	}

	// Cold path only (warm failed) — paint then show.
	const entryStory = lastStoryVisual;
	visitArmPromise = prepareAboutPanelHudForEnter(entryStory)
		.then((ok) => {
			visitArmed = ok !== false;
			visitArmPromise = null;
			if (visitArmed) {
				const live = Number(store.aboutExperience?.storyProgress) || 0;
				syncAboutPanelHudFromStory(Math.max(lastStoryVisual, live));
			}
			return visitArmed;
		})
		.catch((error) => {
			visitArmPromise = null;
			console.warn("[aboutPanelHud] arm for route failed", error);
			return false;
		});

	return visitArmPromise;
}

/** Reset visit flags when About runtime stops (leave completed). */
export function resetAboutPanelHudStorySession() {
	contentPairKey = "none";
	lastStoryVisual = 0;
	visitArmed = false;
	visitArmPromise = null;
}
