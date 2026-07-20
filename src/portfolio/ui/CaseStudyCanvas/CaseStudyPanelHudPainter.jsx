import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import { useLocation } from "react-router-dom";
import { subscribeKey } from "valtio/utils";
import { getProjectByRoute } from "@/portfolio/core/projectRegistry.js";
import { usePortfolioProject } from "@/portfolio/core/PortfolioProjectContext.jsx";
import { buildCaseStudyFrameData } from "@/portfolio/core/caseStudyFrameData.js";
import { ensureCaseStudyCanvasFonts } from "./caseStudyCanvasText.js";
import { subscribeCaseStudyLeftPanelConfig } from "./caseStudyLeftPanelConfig.js";
import {
	resolveCaseProjectCanvasNavigationData,
	activateCaseProjectCanvasNavigation,
} from "./caseProjectCanvasNavigation.js";
import {
	paintCaseStudyPanelHudFrame,
	paintCaseStudyPanelHudChrome,
	hitRegionsSignature,
} from "./paintCaseStudyPanelHud.js";
import { resolveLeftPanelDrawConfig } from "./caseStudyLeftPanelConfig.js";
import {
	registerCaseStudyChromeStagePaint,
	wakeCaseStudyAnimationFrame,
} from "@/portfolio/core/caseStudyAnimationFrame.js";
import {
	setCasePanelHudState,
	registerCasePanelHudPromoteListener,
	registerCasePanelHudSyncListener,
	consumeCasePanelHudComplementPaint,
	getCasePanelHudState,
	getCasePanelHudEnterProgress,
	getCasePanelHudEnterTravelSign,
	setCasePanelHudEnterProgress,
	setCasePanelHudChromeState,
} from "@/portfolio/core/casePanelHudBridge.js";
import { adoptWarmCasePanelHud } from "./warmCasePanelHudUnderCurtain.js";
import { caseChromeOwnsHexHitAtClientY } from "@/three/render/overlay/hexHitOwnership.js";
import {
	cancelCasePanelHudReveal,
	getCasePanelHudRevealMosaicScope,
	isCasePanelHudRevealBusy,
	isCasePanelHudRevealExiting,
	playCasePanelHudEnter,
	releaseCasePanelHud,
} from "@/portfolio/core/casePanelHudReveal.js";
import {
	getCaseStageClickMosaicFromIndex,
	getCaseStageClickMosaicTargetIndex,
	isCaseStageClickMosaicActive,
	registerCaseStageClickMosaicPrepare,
} from "@/portfolio/core/caseStageClickMosaic.js";
import {
	cancelCasePanelHudLocaleMix,
	isCasePanelHudLocaleMixBusy,
	playCasePanelHudLocaleMixTowardStore,
	syncCasePanelHudDisplayedLocale,
} from "@/portfolio/core/casePanelHudLocaleMix.js";
import { shouldAnimateSiteLocaleForCaseChrome } from "@/utils/siteLocaleSwitch.js";
import {
	clearCaseProjectNavSnakeHover,
	disposeCaseProjectNavSnake,
	playCaseProjectNavSnakeHover,
	registerCaseProjectNavSnakeRepaint,
} from "./caseProjectNavSnake.js";
import {
	composeCaseChromeMosaicReveal,
	freezeCaseChromeMosaicSource,
	prepareCaseChromeMosaicSurfaces,
} from "./caseChromeMosaicReveal.js";
import { resolveCaseStudyPanelHudPixelRatio } from "./caseStudyCanvasSurface.js";
import {
	clearPendingCaseChromeNavIfMatch,
	getPendingCaseChromeNav,
	subscribePendingCaseChromeNav,
} from "@/portfolio/core/caseChromePendingNav.js";
import { useRouteTransitionContext } from "@/context/RouteTransitionContext.jsx";
import { store } from "@/store.jsx";
import { normalizeSiteLocale } from "@/utils/siteLocale.js";
import { isCaseEnterFromAnotherCase } from "@/utils/hexNavigation.js";
import { LEFT_MENU_SELECTOR } from "@/three/scenes/home/heroText/heroTextLayout.js";
import { subscribeLeftMenuContentAnchor } from "@/components/HTML/components/leftMenu/leftMenuContentAnchor.js";
import styles from "./CaseStudyPanelHudPainter.module.scss";

/** Stage rail is outside chrome mosaic bounds — fade with full enter/exit only. */
function resolveStageRailOpacity() {
	const enterProgress = getCasePanelHudEnterProgress();
	if (enterProgress == null) {
		return 1;
	}
	if (getCasePanelHudRevealMosaicScope() !== "full") {
		return 1;
	}
	return Math.max(0, Math.min(1, enterProgress));
}

/**
 * Paints case panel HUD into offscreen canvases → WebGL bridge.
 * Hosted once via CaseStudyPanelHudOverlay (site chrome) — survives case→case.
 * Stage mix is shader-only. Canvas/GPU work is coalesced and canvas buffers are recycled on ±1 stage steps.
 * Case entry/exit: GPU enterProgress reveal (buffers stay idle-safe) + scroll text sound.
 */
export default function CaseStudyPanelHudPainter({
	hideProjectNavigation = false,
	skipPanelIntro = false,
}) {
	const { phase: routePhase } = useRouteTransitionContext();
	const { pathname } = useLocation();
	const fromCanvasRef = useRef(null);
	const toCanvasRef = useRef(null);
	const chromeCanvasRef = useRef(null);
	const chromeSourceRef = useRef(null);
	const chromeBoundsRef = useRef(null);
	const chromeMosaicFrozenKeyRef = useRef("");
	const hostRef = useRef(null);
	const fontsReadyRef = useRef(false);
	const cachedZoneRef = useRef(null);
	const lastContentKeyRef = useRef("");
	const lastChromeKeyRef = useRef("");
	const lastPaintIndexRef = useRef(null);
	const lastHitsSigRef = useRef("");
	const lastStageHitsSigRef = useRef("");
	const lastPublishMetaRef = useRef({ hitRegions: [], mosaicBounds: null });
	const coalesceRef = useRef({ scheduled: false, force: false });
	const introFinishedRef = useRef(Boolean(skipPanelIntro));
	const projectIdRef = useRef(null);
	const hoveredProjectNavIdRef = useRef(null);
	/** case→case: paint new prev/next names from click so snake can disappear→appear during hex. */
	const pendingNavRef = useRef(null);
	const [hitRegions, setHitRegions] = useState([]);
	const [stageHitRegions, setStageHitRegions] = useState([]);
	const [panelConfigRevision, setPanelConfigRevision] = useState(0);
	const [siteLocale, setSiteLocale] = useState(() => normalizeSiteLocale(store.siteLocale));
	/** Locale painted on the left HUD after the last completed wipe. */
	const displayedLocaleRef = useRef(normalizeSiteLocale(store.siteLocale));
	const [hudReady, setHudReady] = useState(false);
	const [chromeRevealLocked, setChromeRevealLocked] = useState(false);
	const { project, activeState, activeStateIndex, activeStateId, isInvestigating, goToState } = usePortfolioProject();

	const frameData = useMemo(() => {
		return buildCaseStudyFrameData(project, activeState, activeStateIndex, activeStateId, {
			isInvestigating,
			locale: siteLocale,
		});
	}, [project, activeState, activeStateIndex, activeStateId, isInvestigating, siteLocale]);

	const nextFrameData = useMemo(() => {
		const nextStateIndex = activeStateIndex + 1;
		const nextState = project.states[nextStateIndex];
		if (!nextState) {
			return null;
		}
		return buildCaseStudyFrameData(project, nextState, nextStateIndex, nextState.id, {
			isInvestigating: false,
			locale: siteLocale,
		});
	}, [activeStateIndex, project, siteLocale]);

	const projectNavigationData = useMemo(
		() => resolveCaseProjectCanvasNavigationData(project, siteLocale),
		[project, siteLocale],
	);

	const frameDataRef = useRef(frameData);
	const nextFrameDataRef = useRef(nextFrameData);
	frameDataRef.current = frameData;
	nextFrameDataRef.current = nextFrameData;
	/** Fresh each render — locale subscriber lives in a mount-only effect. */
	const localePaintContextRef = useRef({});

	const resolvePaintFrames = useCallback(() => {
		const clickFrom = getCaseStageClickMosaicFromIndex();
		const clickTo = getCaseStageClickMosaicTargetIndex();
		if (
			isCaseStageClickMosaicActive()
			&& Number.isInteger(clickFrom)
			&& Number.isInteger(clickTo)
			&& project.states[clickFrom]
			&& project.states[clickTo]
		) {
			const fromState = project.states[clickFrom];
			const toState = project.states[clickTo];
			return {
				current: buildCaseStudyFrameData(project, fromState, clickFrom, fromState.id, {
					isInvestigating: false,
					locale: siteLocale,
				}),
				next: buildCaseStudyFrameData(project, toState, clickTo, toState.id, {
					isInvestigating: false,
					locale: siteLocale,
				}),
				paintIndex: clickFrom,
			};
		}

		// Case enter: always stage 1 (index 0) until mosaic appear finishes.
		if (!skipPanelIntro && !introFinishedRef.current) {
			const paintIndex = 0;
			const paintState = project.states[0];
			if (paintState) {
				const current = buildCaseStudyFrameData(project, paintState, paintIndex, paintState.id, {
					isInvestigating: false,
					locale: siteLocale,
				});
				const nextState = project.states[1];
				const next = nextState
					? buildCaseStudyFrameData(project, nextState, 1, nextState.id, {
							isInvestigating: false,
							locale: siteLocale,
						})
					: null;
				return { current, next, paintIndex };
			}
		}

		const storeIndex = store.portfolioExperience.activeStateIndex;
		const storeIndexValid =
			Number.isInteger(storeIndex) &&
			storeIndex >= 0 &&
			storeIndex < project.states.length;
		const paintIndex = storeIndexValid ? storeIndex : activeStateIndex;
		const paintState = project.states[paintIndex] ?? activeState;
		const paintStateId = paintState?.id ?? activeStateId;

		if (paintIndex !== activeStateIndex || paintStateId !== frameDataRef.current?.activeStateId) {
			const current = buildCaseStudyFrameData(project, paintState, paintIndex, paintStateId, {
				isInvestigating: false,
				locale: siteLocale,
			});
			const nextState = project.states[paintIndex + 1];
			const next = nextState
				? buildCaseStudyFrameData(project, nextState, paintIndex + 1, nextState.id, {
						isInvestigating: false,
						locale: siteLocale,
					})
				: null;
			return { current, next, paintIndex };
		}

		return {
			current: frameDataRef.current,
			next: nextFrameDataRef.current,
			paintIndex: activeStateIndex,
		};
	}, [activeState, activeStateId, activeStateIndex, project, siteLocale, skipPanelIntro]);

	const publishHud = useCallback((fromCanvas, toCanvas, meta, dirtyCanvases) => {
		const bounds = meta.mosaicBounds;
		const vw = Math.max(1, bounds?.viewportW ?? fromCanvas.width);
		const vh = Math.max(1, bounds?.viewportH ?? fromCanvas.height);
		const drawCfg = {
			...resolveLeftPanelDrawConfig(bounds?.viewportW ?? hostRef.current?.clientWidth ?? window.innerWidth),
			...(project.config.caseStudy?.leftPanel ?? {}),
		};
		const hitsLocked = !introFinishedRef.current || isCasePanelHudRevealBusy();
		// Never publish left content while enter is idle-null — that flashes full text.
		if (!skipPanelIntro && !introFinishedRef.current && getCasePanelHudEnterProgress() == null) {
			setCasePanelHudEnterProgress(0);
		}
		const contentRectUv = bounds
			? {
				minX: bounds.x / vw,
				maxX: (bounds.x + bounds.width) / vw,
				minY: 1 - (bounds.y + bounds.height) / vh,
				maxY: 1 - bounds.y / vh,
			}
			: { minX: 0, maxX: 1, minY: 0, maxY: 1 };

		lastPublishMetaRef.current = meta;
		const baseColumns = Math.max(1, Math.round(drawCfg.mosaicColumns ?? 28));
		const baseRows = Math.max(1, Math.round(drawCfg.mosaicRows ?? 24));
		setCasePanelHudState({
			fromCanvas,
			toCanvas,
			hitRegions: [],
			mosaic: {
				columns: hitsLocked ? baseColumns * 3 : baseColumns,
				rows: hitsLocked ? baseRows * 2 : baseRows,
				liftStrength: drawCfg.mosaicLiftStrength ?? 0.005,
				randomLift: drawCfg.mosaicRandomLift ?? 150,
				scatterX: drawCfg.mosaicScatterX ?? 0,
				delay: drawCfg.mosaicDelay ?? 0.75,
				canvasWidth: fromCanvas.width,
				canvasHeight: fromCanvas.height,
				rectUv: contentRectUv,
				contentRectUv,
			},
			dirtyCanvases,
			bumpTexture: true,
		});
	}, [project, skipPanelIntro]);

	localePaintContextRef.current = {
		project,
		activeState,
		activeStateIndex,
		pathname,
		projectNavigationData,
		panelConfigRevision,
		hideProjectNavigation,
		publishHud,
	};

	const publishChromeHits = useCallback((chromeMeta) => {
		if (hideProjectNavigation) {
			setHitRegions([]);
			return;
		}
		const hits = chromeMeta?.hitRegions ?? [];
		const hitsSig = hitRegionsSignature(hits);
		if (hitsSig !== lastHitsSigRef.current) {
			lastHitsSigRef.current = hitsSig;
			setHitRegions(hits);
		}
	}, [hideProjectNavigation]);

	const publishStageHits = useCallback((hits) => {
		const next = Array.isArray(hits) ? hits : [];
		const hitsSig = hitRegionsSignature(next);
		if (hitsSig !== lastStageHitsSigRef.current) {
			lastStageHitsSigRef.current = hitsSig;
			setStageHitRegions(next);
		}
	}, []);

	// Adopt preloader-warmed canvases on case enter only — never on locale change
	// (locale rebind of stage-0 warm over the live stage flashes / skips paint).
	const adoptedRouteRef = useRef("");
	useLayoutEffect(() => {
		const route = project.config.route;
		if (adoptedRouteRef.current === route) {
			return;
		}
		const host = hostRef.current;
		const viewportW = host?.clientWidth || window.innerWidth;
		const viewportH = host?.clientHeight || window.innerHeight;
		const locale = normalizeSiteLocale(store.siteLocale);
		const warm = adoptWarmCasePanelHud(route, locale, viewportW, viewportH);
		adoptedRouteRef.current = route;
		if (!warm) {
			return;
		}
		// Hide left band before first publish — null enterProgress = full idle show (flash).
		if (!skipPanelIntro) {
			setCasePanelHudEnterProgress(0);
		}
		fromCanvasRef.current = warm.fromCanvas;
		toCanvasRef.current = warm.toCanvas;
		displayedLocaleRef.current = locale;
		syncCasePanelHudDisplayedLocale(locale);
		// Warm chrome is an offscreen buffer — blit onto the live DOM chrome canvas.
		// Never rebind chromeCanvasRef away from the mounted <canvas> (that blanks the nav).
		if (warm.chromeCanvas && !hideProjectNavigation) {
			const domChrome = chromeCanvasRef.current;
			if (domChrome) {
				domChrome.style.width = `${viewportW}px`;
				domChrome.style.height = `${viewportH}px`;
				domChrome.width = warm.chromeCanvas.width;
				domChrome.height = warm.chromeCanvas.height;
				const ctx = domChrome.getContext("2d");
				if (ctx) {
					ctx.setTransform(1, 0, 0, 1, 0, 0);
					ctx.clearRect(0, 0, domChrome.width, domChrome.height);
					ctx.drawImage(warm.chromeCanvas, 0, 0);
				}
				chromeBoundsRef.current = warm.chromeBounds;
				lastChromeKeyRef.current = [
					locale,
					viewportW,
					viewportH,
					0,
					projectNavigationData?.previousName ?? "",
					projectNavigationData?.nextName ?? "",
					projectNavigationData?.previousProject?.config?.id ?? "",
					projectNavigationData?.nextProject?.config?.id ?? "",
					route,
				].join("|");
				publishChromeHits({ hitRegions: warm.chromeHitRegions });
			} else {
				lastChromeKeyRef.current = "";
			}
		}
		lastPublishMetaRef.current = {
			hitRegions: warm.hitRegions,
			mosaicBounds: warm.mosaicBounds,
		};
		lastPaintIndexRef.current = 0;
		lastContentKeyRef.current = warm.contentKey;
		publishHud(warm.fromCanvas, warm.toCanvas, lastPublishMetaRef.current, []);
		setHudReady(true);
	}, [
		hideProjectNavigation,
		project.config.route,
		projectNavigationData,
		publishChromeHits,
		publishHud,
		skipPanelIntro,
	]);

	const paintNow = useCallback((force = false) => {
		if (!fontsReadyRef.current) {
			return;
		}
		const host = hostRef.current;
		if (!host) {
			return;
		}

		const viewportW = host.clientWidth || window.innerWidth;
		const viewportH = host.clientHeight || window.innerHeight;
		const pendingChrome = pendingNavRef.current ?? getPendingCaseChromeNav();
		// Chrome follows store locale immediately; left content lags until mosaic wipe finishes.
		const chromeLocale = normalizeSiteLocale(store.siteLocale);
		const navData = pendingChrome?.data
			?? (
				chromeLocale !== siteLocale
					? resolveCaseProjectCanvasNavigationData(project, chromeLocale)
					: projectNavigationData
			);
		const chromeKey = [
			chromeLocale,
			viewportW,
			viewportH,
			hideProjectNavigation ? 1 : 0,
			activeStateId,
			navData?.previousName ?? "",
			navData?.nextName ?? "",
			navData?.previousProject?.config?.id ?? "",
			navData?.nextProject?.config?.id ?? "",
			pendingChrome?.projectId ?? pathname,
		].join("|");
		const chromeChanged = chromeKey !== lastChromeKeyRef.current;
		const chromeFrame = {
			states: frameData.states,
			activeStateId,
			activeStateIndex: store.portfolioExperience.activeStateIndex ?? activeStateIndex,
			chapterBase: frameData.chapterBase ?? project.config.caseStudy?.chapterBase ?? 0,
		};

		const paintChromeLive = () => {
			const chromeCanvas = chromeCanvasRef.current;
			if (!chromeCanvas) {
				return;
			}

			const dpr = resolveCaseStudyPanelHudPixelRatio(store.graphicsTier);
			const livePending = pendingNavRef.current ?? getPendingCaseChromeNav();
			const paintProject = livePending
				? (getProjectByRoute(livePending.route) ?? project)
				: project;
			const paintPath = livePending?.route ?? pathname;
			const chromeArgs = {
				canvas: chromeCanvas,
				viewportW,
				viewportH,
				project: paintProject,
				pathname: paintPath,
				projectNavigationData: navData,
				hideProjectNavigation,
				frame: chromeFrame,
			};
			const fullReveal = getCasePanelHudRevealMosaicScope() === "full";
			const enterProgress = getCasePanelHudEnterProgress();
			const mosaicActive = fullReveal && enterProgress != null && !hideProjectNavigation;

			if (mosaicActive) {
				const source = prepareCaseChromeMosaicSurfaces(
					chromeCanvas,
					chromeSourceRef.current,
					viewportW,
					viewportH,
					dpr,
				);
				chromeSourceRef.current = source;
				const travelSign = getCasePanelHudEnterTravelSign();
				const needSourcePaint = chromeMosaicFrozenKeyRef.current !== chromeKey
					|| !chromeBoundsRef.current;

				if (needSourcePaint) {
					if (
						travelSign < 0
						&& chromeMosaicFrozenKeyRef.current === ""
						&& chromeBoundsRef.current
						&& chromeCanvas.width > 0
					) {
						freezeCaseChromeMosaicSource(source, chromeCanvas);
					} else {
						const painted = paintCaseStudyPanelHudChrome({
							...chromeArgs,
							canvas: source,
						});
						chromeBoundsRef.current = painted?.chromeBounds ?? null;
					}
					chromeMosaicFrozenKeyRef.current = chromeKey;
				}

				const bounds = chromeBoundsRef.current ?? {
					x: 0,
					y: Math.round(viewportH * 0.12),
					width: viewportW,
					height: 36,
				};
				chromeBoundsRef.current = bounds;

				composeCaseChromeMosaicReveal({
					destCanvas: chromeCanvas,
					sourceCanvas: source,
					boundsCss: bounds,
					progress: enterProgress,
					travelSign,
					dpr,
				});
				// Rail is outside enter-mosaic bounds — fade with enterProgress.
				const railPainted = paintCaseStudyPanelHudChrome({
					...chromeArgs,
					skipClear: true,
					stageRailOnly: true,
					stageRailOpacity: resolveStageRailOpacity(),
				});
				publishChromeHits(null);
				publishStageHits(railPainted?.stageHitRegions);
				lastChromeKeyRef.current = chromeKey;
				return;
			}

			chromeMosaicFrozenKeyRef.current = "";
			const painted = paintCaseStudyPanelHudChrome({
				...chromeArgs,
				stageRailOpacity: resolveStageRailOpacity(),
			});
			chromeBoundsRef.current = painted?.chromeBounds ?? null;
			publishChromeHits(hideProjectNavigation ? null : painted);
			publishStageHits(painted?.stageHitRegions);
			lastChromeKeyRef.current = chromeKey;
		};

		// Content exit owns from/to textures — never republish content mid-exit.
		// DOM chrome stays live (hover snake paints straight to the visible canvas).
		// Locale mosaic owns from/to until wipe settles — chrome may still refresh.
		const contentPaintBlocked = isCasePanelHudRevealExiting()
			|| isCasePanelHudLocaleMixBusy()
			|| (
				!getCasePanelHudState().fromCanvas
				&& (store.sceneCarouselClickTransitionActive || routePhase === "exiting")
			);
		if (contentPaintBlocked) {
			if (force || chromeChanged) {
				paintChromeLive();
			}
			return;
		}

		let fromCanvas = fromCanvasRef.current;
		let toCanvas = toCanvasRef.current;
		if (!fromCanvas || !toCanvas) {
			if (force || chromeChanged) {
				paintChromeLive();
			}
			return;
		}

		const { current, next, paintIndex } = resolvePaintFrames();
		if (!current) {
			if (force || chromeChanged) {
				paintChromeLive();
			}
			return;
		}

		const contentKey = [
			current.activeStateId,
			next?.activeStateId ?? "",
			siteLocale,
			viewportW,
			viewportH,
			panelConfigRevision,
			paintIndex,
			hideProjectNavigation ? 1 : 0,
			pathname,
		].join("|");
		const contentChanged = contentKey !== lastContentKeyRef.current;
		const complementPending = getCasePanelHudState().needsComplementPaint;
		// Same content: refresh chrome when needed / on force; never re-upload left textures.
		if (!contentChanged && !complementPending) {
			if (force || chromeChanged) {
				paintChromeLive();
			}
			return;
		}

		const paintArgs = {
			viewportW,
			viewportH,
			project,
			siteLocale,
			pathname,
			projectNavigationData,
			panelConfigRevision,
			hideProjectNavigation,
			cachedZoneRef,
		};

		const prevIndex = lastPaintIndexRef.current;
		// case→case / first appear: never steal the paint with a stale stage-promote complement
		// (that path can publish without mosaicBounds and leave hudReady stuck false → invisible text).
		const mustFullContentPaint = !hudReady || !introFinishedRef.current || force;
		let complement = false;
		if (mustFullContentPaint || isCaseStageClickMosaicActive()) {
			if (getCasePanelHudState().needsComplementPaint) {
				consumeCasePanelHudComplementPaint();
			}
		} else {
			complement = consumeCasePanelHudComplementPaint();
		}
		const canRecycleForward =
			!force
			&& !mustFullContentPaint
			&& !complement
			&& !isCaseStageClickMosaicActive()
			&& prevIndex != null
			&& paintIndex === prevIndex + 1
			&& next
			&& lastPublishMetaRef.current.mosaicBounds;
		const canRecycleBackward =
			!force
			&& !mustFullContentPaint
			&& !complement
			&& !isCaseStageClickMosaicActive()
			&& prevIndex != null
			&& paintIndex === prevIndex - 1
			&& lastPublishMetaRef.current.mosaicBounds;

		/** @type {HTMLCanvasElement[]} */
		let dirtyCanvases = [];
		let meta = lastPublishMetaRef.current;

		if (complement) {
			// Forward commit: from already has new current; paint next into `to`.
			// Backward commit: to already has old current (new next); paint new current into `from`.
			fromCanvas = fromCanvasRef.current;
			toCanvas = toCanvasRef.current;
			if (complement.direction === "backward") {
				const painted = paintCaseStudyPanelHudFrame({
					...paintArgs,
					canvas: fromCanvas,
					frame: { ...current, scrollProgress: store.scroll },
				});
				if (!painted) {
					return;
				}
				dirtyCanvases = [fromCanvas];
				meta = {
					hitRegions: painted.hitRegions,
					mosaicBounds: painted.mosaicBounds ?? meta.mosaicBounds,
				};
			} else if (next) {
				paintCaseStudyPanelHudFrame({
					...paintArgs,
					canvas: toCanvas,
					frame: { ...next, scrollProgress: store.scroll },
				});
				dirtyCanvases = [toCanvas];
				meta = {
					hitRegions: meta.hitRegions ?? [],
					mosaicBounds: meta.mosaicBounds,
				};
			} else {
				toCanvas = fromCanvas;
				toCanvasRef.current = fromCanvas;
				dirtyCanvases = [];
			}
		} else if (canRecycleForward) {
			// Old `to` (prev next) becomes `from`; only paint the new next into the freed buffer.
			const scratch = fromCanvas;
			fromCanvas = toCanvas;
			toCanvas = scratch;
			fromCanvasRef.current = fromCanvas;
			toCanvasRef.current = toCanvas;

			paintCaseStudyPanelHudFrame({
				...paintArgs,
				canvas: toCanvas,
				frame: { ...next, scrollProgress: store.scroll },
			});
			dirtyCanvases = [toCanvas];
			meta = {
				hitRegions: meta.hitRegions,
				mosaicBounds: meta.mosaicBounds,
			};
		} else if (canRecycleBackward) {
			// Paint new current into `to`, then swap so it becomes `from`; old `from` becomes `to`.
			const painted = paintCaseStudyPanelHudFrame({
				...paintArgs,
				canvas: toCanvas,
				frame: { ...current, scrollProgress: store.scroll },
			});
			if (!painted) {
				return;
			}
			const scratch = fromCanvas;
			fromCanvas = toCanvas;
			toCanvas = scratch;
			fromCanvasRef.current = fromCanvas;
			toCanvasRef.current = toCanvas;
			dirtyCanvases = [fromCanvas];
			meta = {
				hitRegions: painted.hitRegions,
				mosaicBounds: painted.mosaicBounds ?? meta.mosaicBounds,
			};
		} else {
			const fromResult = paintCaseStudyPanelHudFrame({
				...paintArgs,
				canvas: fromCanvas,
				frame: { ...current, scrollProgress: store.scroll },
			});
			if (!fromResult) {
				return;
			}
			dirtyCanvases = [fromCanvas];
			if (next) {
				paintCaseStudyPanelHudFrame({
					...paintArgs,
					canvas: toCanvas,
					frame: { ...next, scrollProgress: store.scroll },
				});
				dirtyCanvases.push(toCanvas);
			}
			meta = {
				hitRegions: fromResult.hitRegions,
				mosaicBounds: fromResult.mosaicBounds,
			};
		}

		lastContentKeyRef.current = contentKey;
		lastPaintIndexRef.current = paintIndex;
		if (
			!introFinishedRef.current
			&& !skipPanelIntro
			&& !isCasePanelHudRevealBusy()
		) {
			// Hide before publish — null enterProgress = full idle show (flash).
			setCasePanelHudEnterProgress(0);
		}
		publishHud(fromCanvas, next ? toCanvas : fromCanvas, meta, dirtyCanvases);
		paintChromeLive();

		// Appear can start once content is published — do not require mosaicBounds
		// (warm/complement edge cases previously skipped this and stuck enterProgress at 0).
		if (!hudReady) {
			setHudReady(true);
		}
	}, [
		activeStateId,
		activeStateIndex,
		frameData.chapterBase,
		frameData.states,
		hideProjectNavigation,
		hudReady,
		panelConfigRevision,
		pathname,
		project,
		projectNavigationData,
		publishStageHits,
		publishChromeHits,
		publishHud,
		resolvePaintFrames,
		routePhase,
		siteLocale,
		skipPanelIntro,
	]);

	const paintNowRef = useRef(paintNow);
	paintNowRef.current = paintNow;

	/** Chrome-only path for enter mosaic ticks — never touches left from/to textures. */
	const paintChromeOnly = useCallback(() => {
		if (!fontsReadyRef.current) {
			return;
		}
		const host = hostRef.current;
		if (!host) {
			return;
		}
		const viewportW = host.clientWidth || window.innerWidth;
		const viewportH = host.clientHeight || window.innerHeight;
		const pendingChrome = pendingNavRef.current ?? getPendingCaseChromeNav();
		const chromeLocale = normalizeSiteLocale(store.siteLocale);
		const navData = pendingChrome?.data
			?? (
				chromeLocale !== siteLocale
					? resolveCaseProjectCanvasNavigationData(project, chromeLocale)
					: projectNavigationData
			);
		const chromeKey = [
			chromeLocale,
			viewportW,
			viewportH,
			hideProjectNavigation ? 1 : 0,
			activeStateId,
			navData?.previousName ?? "",
			navData?.nextName ?? "",
			navData?.previousProject?.config?.id ?? "",
			navData?.nextProject?.config?.id ?? "",
			pendingChrome?.projectId ?? pathname,
		].join("|");
		const chromeFrame = {
			states: frameData.states,
			activeStateId,
			activeStateIndex: store.portfolioExperience.activeStateIndex ?? activeStateIndex,
			chapterBase: frameData.chapterBase ?? project.config.caseStudy?.chapterBase ?? 0,
		};

		const chromeCanvas = chromeCanvasRef.current;
		if (!chromeCanvas) {
			return;
		}

		const dpr = resolveCaseStudyPanelHudPixelRatio(store.graphicsTier);
		const livePending = pendingNavRef.current ?? getPendingCaseChromeNav();
		const paintProject = livePending
			? (getProjectByRoute(livePending.route) ?? project)
			: project;
		const paintPath = livePending?.route ?? pathname;
		const chromeArgs = {
			canvas: chromeCanvas,
			viewportW,
			viewportH,
			project: paintProject,
			pathname: paintPath,
			projectNavigationData: navData,
			hideProjectNavigation,
			frame: chromeFrame,
		};
		const fullReveal = getCasePanelHudRevealMosaicScope() === "full";
		const enterProgress = getCasePanelHudEnterProgress();
		const mosaicActive = fullReveal && enterProgress != null && !hideProjectNavigation;

		if (mosaicActive) {
			const source = prepareCaseChromeMosaicSurfaces(
				chromeCanvas,
				chromeSourceRef.current,
				viewportW,
				viewportH,
				dpr,
			);
			chromeSourceRef.current = source;
			const travelSign = getCasePanelHudEnterTravelSign();
			const needSourcePaint = chromeMosaicFrozenKeyRef.current !== chromeKey
				|| !chromeBoundsRef.current;

			if (needSourcePaint) {
				if (
					travelSign < 0
					&& chromeMosaicFrozenKeyRef.current === ""
					&& chromeBoundsRef.current
					&& chromeCanvas.width > 0
				) {
					freezeCaseChromeMosaicSource(source, chromeCanvas);
				} else {
					const painted = paintCaseStudyPanelHudChrome({
						...chromeArgs,
						canvas: source,
					});
					chromeBoundsRef.current = painted?.chromeBounds ?? null;
				}
				chromeMosaicFrozenKeyRef.current = chromeKey;
			}

			const bounds = chromeBoundsRef.current ?? {
				x: 0,
				y: Math.round(viewportH * 0.12),
				width: viewportW,
				height: 36,
			};
			chromeBoundsRef.current = bounds;

			composeCaseChromeMosaicReveal({
				destCanvas: chromeCanvas,
				sourceCanvas: source,
				boundsCss: bounds,
				progress: enterProgress,
				travelSign,
				dpr,
			});
			const railPainted = paintCaseStudyPanelHudChrome({
				...chromeArgs,
				skipClear: true,
				stageRailOnly: true,
				stageRailOpacity: resolveStageRailOpacity(),
			});
			publishChromeHits(null);
			publishStageHits(railPainted?.stageHitRegions);
			lastChromeKeyRef.current = chromeKey;
			return;
		}

		chromeMosaicFrozenKeyRef.current = "";
		const painted = paintCaseStudyPanelHudChrome({
			...chromeArgs,
			stageRailOpacity: resolveStageRailOpacity(),
		});
		chromeBoundsRef.current = painted?.chromeBounds ?? null;
		publishChromeHits(hideProjectNavigation ? null : painted);
		publishStageHits(painted?.stageHitRegions);
		lastChromeKeyRef.current = chromeKey;
	}, [
		activeStateId,
		activeStateIndex,
		frameData.chapterBase,
		frameData.states,
		hideProjectNavigation,
		pathname,
		project,
		projectNavigationData,
		publishChromeHits,
		publishStageHits,
		siteLocale,
	]);

	const paintChromeOnlyRef = useRef(paintChromeOnly);
	paintChromeOnlyRef.current = paintChromeOnly;
	const chromePaintRafRef = useRef(0);

	/** Stage-progress rail only — no «all projects» redraw, no left textures. */
	const paintChromeStageRail = useCallback(() => {
		if (!fontsReadyRef.current) {
			return;
		}
		const host = hostRef.current;
		const chromeCanvas = chromeCanvasRef.current;
		if (!host || !chromeCanvas) {
			return;
		}
		const viewportW = host.clientWidth || window.innerWidth;
		const viewportH = host.clientHeight || window.innerHeight;
		const pendingChrome = pendingNavRef.current ?? getPendingCaseChromeNav();
		const navData = pendingChrome?.data ?? projectNavigationData;
		const livePending = pendingNavRef.current ?? getPendingCaseChromeNav();
		const paintProject = livePending
			? (getProjectByRoute(livePending.route) ?? project)
			: project;
		const paintPath = livePending?.route ?? pathname;
		const activeIndex = store.portfolioExperience.activeStateIndex ?? 0;
		const painted = paintCaseStudyPanelHudChrome({
			canvas: chromeCanvas,
			viewportW,
			viewportH,
			project: paintProject,
			pathname: paintPath,
			projectNavigationData: navData,
			hideProjectNavigation,
			frame: {
				states: frameData.states,
				activeStateId: frameData.states[activeIndex]?.id ?? activeStateId,
				activeStateIndex: activeIndex,
				chapterBase: frameData.chapterBase ?? project.config.caseStudy?.chapterBase ?? 0,
			},
			stageRailOnly: true,
			stageRailOpacity: resolveStageRailOpacity(),
		});
		publishStageHits(painted?.stageHitRegions);
	}, [
		activeStateId,
		frameData.chapterBase,
		frameData.states,
		hideProjectNavigation,
		pathname,
		project,
		projectNavigationData,
		publishStageHits,
	]);

	const paintChromeStageRailRef = useRef(paintChromeStageRail);
	paintChromeStageRailRef.current = paintChromeStageRail;

	const requestChromePaint = useCallback(() => {
		if (chromePaintRafRef.current) {
			return;
		}
		chromePaintRafRef.current = requestAnimationFrame(() => {
			chromePaintRafRef.current = 0;
			paintChromeOnlyRef.current();
		});
	}, []);

	const requestPaint = useCallback((force = false) => {
		coalesceRef.current.force = coalesceRef.current.force || force;
		if (coalesceRef.current.scheduled) {
			return;
		}
		coalesceRef.current.scheduled = true;
		requestAnimationFrame(() => {
			coalesceRef.current.scheduled = false;
			const nextForce = coalesceRef.current.force;
			coalesceRef.current.force = false;
			paintNowRef.current(nextForce);
		});
	}, []);

	const requestPaintRef = useRef(requestPaint);
	requestPaintRef.current = requestPaint;

	useEffect(() => {
		return subscribePendingCaseChromeNav(() => {
			// Chrome names only — never force left-content re-upload.
			lastChromeKeyRef.current = "";
			requestChromePaint();
		});
	}, [requestChromePaint]);

	// Smooth rail follow of in-case stageProgress (chrome column only).
	useEffect(() => {
		registerCaseStudyChromeStagePaint(() => {
			paintChromeStageRailRef.current();
		});
		wakeCaseStudyAnimationFrame();
		return () => registerCaseStudyChromeStagePaint(null);
	}, []);

	// Full chrome mosaic enter: compose DOM chrome each enterProgress tick.
	// Band enter (case→case) leaves chrome idle — no listener work.
	const chromeRevealLockedRef = useRef(false);
	useEffect(() => {
		return registerCasePanelHudSyncListener(() => {
			const fullReveal = getCasePanelHudRevealMosaicScope() === "full";
			const progress = getCasePanelHudEnterProgress();
			const locked = fullReveal && progress != null;
			const wasLocked = chromeRevealLockedRef.current;
			if (locked !== wasLocked) {
				chromeRevealLockedRef.current = locked;
				setChromeRevealLocked(locked);
			}

			if (locked) {
				requestChromePaint();
				return;
			}

			if (wasLocked && !locked) {
				chromeMosaicFrozenKeyRef.current = "";
				requestChromePaint();
			}
		});
	}, [requestChromePaint]);

	// Drop any legacy WebGL chrome canvas from the bridge — nav is DOM-only now.
	useEffect(() => {
		setCasePanelHudChromeState({ canvas: null, hitRegions: [], bumpTexture: true });
	}, []);

	// Every case open (first mount + case→case): hide left band, stage 1, arm appear.
	// Prev/next names transition via disappear→appear snake (see caseProjectNavSnake).
	useEffect(() => {
		const nextId = project.config.id;
		const prevId = projectIdRef.current;
		projectIdRef.current = nextId;
		if (pendingNavRef.current?.projectId === nextId) {
			pendingNavRef.current = null;
		}
		clearPendingCaseChromeNavIfMatch(nextId);
		if (prevId === nextId) {
			return;
		}
		// Discard stage-promote leftover from the previous case before the first paint.
		if (getCasePanelHudState().needsComplementPaint) {
			consumeCasePanelHudComplementPaint();
		}
		if (isCasePanelHudRevealBusy()) {
			cancelCasePanelHudReveal();
		}
		lastContentKeyRef.current = "";
		lastChromeKeyRef.current = "";
		lastPaintIndexRef.current = null;
		lastPublishMetaRef.current = { hitRegions: [], mosaicBounds: null };
		chromeMosaicFrozenKeyRef.current = "";
		chromeBoundsRef.current = null;
		introFinishedRef.current = false;
		hoveredProjectNavIdRef.current = null;
		adoptedRouteRef.current = "";
		setHudReady(false);
		setCasePanelHudEnterProgress(0);
		requestPaintRef.current(true);
	}, [project.config.id]);

	useEffect(() => {
		let cancelled = false;
		if (!skipPanelIntro) {
			setCasePanelHudEnterProgress(0);
		} else {
			setCasePanelHudEnterProgress(null);
			introFinishedRef.current = true;
		}
		ensureCaseStudyCanvasFonts().then(() => {
			if (cancelled) {
				return;
			}
			fontsReadyRef.current = true;
			requestPaintRef.current(true);
		});
		return () => {
			cancelled = true;
		};
	}, [skipPanelIntro]);

	// Enter: mosaic roll-up + scroll text sound. Always from hidden (0) → appear.
	// Must run on every case land (hub→case, case→case, menu). Do not require routePhase
	// "idle" — hex sets displayPath while phase is still "entering" for ENTER_MS.
	useEffect(() => {
		if (skipPanelIntro) {
			introFinishedRef.current = true;
			setCasePanelHudEnterProgress(null);
			return undefined;
		}
		// Only block while the previous HTML route is still exiting.
		if (introFinishedRef.current || routePhase === "exiting" || !hudReady) {
			return undefined;
		}
		const enterProjectId = project.config.id;
		// Stuck exit/enter from a prior leave must not block the appear.
		if (isCasePanelHudRevealBusy()) {
			cancelCasePanelHudReveal();
		}
		setCasePanelHudEnterProgress(0);

		playCasePanelHudEnter({
			delayMs: Math.max(0, project.config.caseStudy?.panelIntroDelayMs ?? 500),
			// case→case: left band only; chrome stays live (no mosaic).
			// non-case→case: full — DOM chrome mosaics in with enterProgress.
			mosaicScope: isCaseEnterFromAnotherCase() ? "band" : "full",
			onComplete: () => {
				if (projectIdRef.current !== enterProjectId) {
					return;
				}
				introFinishedRef.current = true;
				// Idle full show — belt against finishEnter races leaving 0 (hidden).
				if (getCasePanelHudEnterProgress() === 0) {
					setCasePanelHudEnterProgress(null);
				}
				// Chrome only — do not invalidate content textures (re-upload flash/jump).
				chromeMosaicFrozenKeyRef.current = "";
				lastChromeKeyRef.current = "";
				requestPaintRef.current(true);
			},
		});

		return () => {
			// Do NOT cancel on hudReady flicker (adopt→project-id reset). That left
			// enterProgress stuck at 0 with no restart. Project-id effect already calls
			// cancelCasePanelHudReveal() when the case actually changes.
		};
	}, [hudReady, project.config.id, project.config.caseStudy?.panelIntroDelayMs, routePhase, skipPanelIntro]);

	// Leave chrome is owned by publishSiteRouteTransition — do NOT latch introFinished
	// on routePhase==="exiting". That blocked playCasePanelHudEnter after case→case
	// (project-id reset introFinished=false, then this effect set it true again).
	// Enter is already gated on routePhase === "exiting" below / in the enter effect.

	useEffect(() => {
		const stopConfig = subscribeCaseStudyLeftPanelConfig(() => {
			setPanelConfigRevision((value) => value + 1);
		});
		const forceLocaleRepaint = (locale) => {
			displayedLocaleRef.current = locale;
			setSiteLocale(locale);
			lastContentKeyRef.current = "";
			lastChromeKeyRef.current = "";
			chromeMosaicFrozenKeyRef.current = "";
			requestPaintRef.current(true);
			wakeCaseStudyAnimationFrame();
		};

		const runCaseLocaleMixTowardStore = () => {
			const canAnimateLocale =
				shouldAnimateSiteLocaleForCaseChrome()
				&& !isCaseStageClickMosaicActive()
				&& !isCasePanelHudRevealBusy()
				&& !isCasePanelHudRevealExiting();

			// Off-case / reveal busy: drop in-flight mosaic and swap instantly.
			if (!canAnimateLocale) {
				cancelCasePanelHudLocaleMix();
			}

			// Mid-settle / mid-wipe: store already holds the latest desired — chain after finish.
			if (isCasePanelHudLocaleMixBusy()) {
				return;
			}

			void playCasePanelHudLocaleMixTowardStore({
				shouldAnimate: () => canAnimateLocale,
				onInstantSwap: (desiredLocale) => {
					forceLocaleRepaint(desiredLocale);
					return true;
				},
				prepareWipe: async (targetLocale) => {
					const liveFrom = fromCanvasRef.current;
					const liveTo = toCanvasRef.current;
					const liveHost = hostRef.current;
					const liveCtx = localePaintContextRef.current;
					if (!liveFrom || !liveTo || !liveHost || !fontsReadyRef.current || !liveCtx?.project) {
						return { skipWipe: true, forceRepaint: true };
					}

					const storeIndex = store.portfolioExperience.activeStateIndex;
					const paintIndex = Number.isInteger(storeIndex) ? storeIndex : liveCtx.activeStateIndex;
					const paintState = liveCtx.project.states[paintIndex] ?? liveCtx.activeState;
					if (!paintState) {
						return { skipWipe: true, forceRepaint: true };
					}

					const viewportW = liveHost.clientWidth || window.innerWidth;
					const viewportH = liveHost.clientHeight || window.innerHeight;
					const navData = resolveCaseProjectCanvasNavigationData(liveCtx.project, targetLocale);
					const currentFrame = buildCaseStudyFrameData(
						liveCtx.project,
						paintState,
						paintIndex,
						paintState.id,
						{ isInvestigating: false, locale: targetLocale },
					);
					const painted = paintCaseStudyPanelHudFrame({
						viewportW,
						viewportH,
						project: liveCtx.project,
						siteLocale: targetLocale,
						pathname: liveCtx.pathname,
						projectNavigationData: navData,
						panelConfigRevision: liveCtx.panelConfigRevision,
						hideProjectNavigation: liveCtx.hideProjectNavigation,
						cachedZoneRef,
						canvas: liveTo,
						frame: { ...currentFrame, scrollProgress: store.scroll },
					});
					if (!painted) {
						return { skipWipe: true, forceRepaint: true };
					}

					liveCtx.publishHud(liveFrom, liveTo, {
						hitRegions: painted.hitRegions,
						mosaicBounds: painted.mosaicBounds ?? lastPublishMetaRef.current.mosaicBounds,
					}, [liveTo]);
					lastPublishMetaRef.current = {
						hitRegions: painted.hitRegions,
						mosaicBounds: painted.mosaicBounds ?? lastPublishMetaRef.current.mosaicBounds,
					};

					const nextState = liveCtx.project.states[paintIndex + 1];
					const contentKey = [
						paintState.id,
						nextState?.id ?? "",
						targetLocale,
						viewportW,
						viewportH,
						liveCtx.panelConfigRevision,
						paintIndex,
						liveCtx.hideProjectNavigation ? 1 : 0,
						liveCtx.pathname,
					].join("|");

					// Refresh chrome with store locale while content mosaics.
					lastChromeKeyRef.current = "";
					chromeMosaicFrozenKeyRef.current = "";
					requestPaintRef.current(true);

					return { contentKey, paintIndex };
				},
				onAfterDisplayed: (locale, prepared) => {
					displayedLocaleRef.current = locale;
					const mosaicComplete = Boolean(
						prepared
						&& typeof prepared === "object"
						&& prepared.contentKey
						&& !prepared.skipWipe
						&& !prepared.instant
						&& !prepared.forceRepaint,
					);
					if (prepared && typeof prepared === "object") {
						if (prepared.contentKey) {
							lastContentKeyRef.current = prepared.contentKey;
						}
						if (Number.isInteger(prepared.paintIndex)) {
							lastPaintIndexRef.current = prepared.paintIndex;
						}
						if (prepared.forceRepaint || prepared.instant || prepared.skipWipe) {
							lastContentKeyRef.current = prepared.contentKey || "";
							lastChromeKeyRef.current = "";
							chromeMosaicFrozenKeyRef.current = "";
						}
					}
					setSiteLocale(locale);
					// Mosaic wipe: wait for React siteLocale commit + paintNow rebuild so
					// contentKey matches — an immediate paint would re-upload the old locale.
					if (!mosaicComplete) {
						requestPaintRef.current(true);
					}
					wakeCaseStudyAnimationFrame();
				},
			});
		};

		const stopLocale = subscribeKey(store, "siteLocale", () => {
			runCaseLocaleMixTowardStore();
		});
		const stopTier = subscribeKey(store, "graphicsTier", () => {
			requestPaintRef.current(true);
		});
		const stopMenu = subscribeLeftMenuContentAnchor(() => {
			requestPaintRef.current(true);
		});
		const stopPromote = registerCasePanelHudPromoteListener((direction) => {
			const state = getCasePanelHudState();
			if (state.fromCanvas) {
				fromCanvasRef.current = state.fromCanvas;
			}
			if (state.toCanvas) {
				toCanvasRef.current = state.toCanvas;
			}
			lastPaintIndexRef.current = store.portfolioExperience.activeStateIndex;
			// Locale wipe owns content keys / textures through promote + displayed sync.
			if (isCasePanelHudLocaleMixBusy()) {
				return;
			}
			lastContentKeyRef.current = "";
			// Backward must fill `from` in the same frame; forward can coalesce.
			if (direction === "backward") {
				paintNowRef.current(false);
			} else {
				requestPaintRef.current(false);
			}
		});
		wakeCaseStudyAnimationFrame();

		const onResize = () => requestPaintRef.current(true);
		window.addEventListener("resize", onResize);

		const menu = document.querySelector(LEFT_MENU_SELECTOR);
		const resizeObserver = typeof ResizeObserver !== "undefined" && menu
			? new ResizeObserver(onResize)
			: null;
		resizeObserver?.observe(menu);

		requestPaintRef.current(true);

		return () => {
			stopConfig();
			stopLocale();
			stopTier();
			stopMenu();
			stopPromote();
			cancelCasePanelHudLocaleMix();
			window.removeEventListener("resize", onResize);
			resizeObserver?.disconnect();
			if (chromePaintRafRef.current) {
				cancelAnimationFrame(chromePaintRafRef.current);
				chromePaintRafRef.current = 0;
			}
			// Overlay only unmounts when leaving all cases — full release.
			if (isCasePanelHudRevealBusy()) {
				return;
			}
			releaseCasePanelHud();
		};
	}, []);

	useEffect(() => {
		// Content-driven; do not force — allows ±1 stage canvas recycle.
		requestPaint(false);
	}, [requestPaint, paintNow]);

	useEffect(() => {
		return registerCaseStageClickMosaicPrepare(() => {
			lastContentKeyRef.current = "";
			lastPaintIndexRef.current = null;
			requestPaintRef.current(true);
			wakeCaseStudyAnimationFrame();
		});
	}, []);

	const clearNavCursor = useCallback(() => {
		document.body.classList.remove("caseNavPointerActive");
		store.cursor.caseNavHovered = false;
		store.cursor.hovered = false;
	}, []);

	const handleHitPointerEnter = useCallback((event) => {
		if (!caseChromeOwnsHexHitAtClientY(event.clientY)) {
			return;
		}
		document.body.classList.add("caseNavPointerActive");
		store.cursor.caseNavHovered = true;
		store.cursor.hovered = true;
		const id = event.currentTarget?.getAttribute("aria-label");
		if (id === "previous" || id === "next" || id === "all") {
			if (hoveredProjectNavIdRef.current !== id) {
				clearCaseProjectNavSnakeHover(hoveredProjectNavIdRef.current);
				hoveredProjectNavIdRef.current = id;
				playCaseProjectNavSnakeHover(id);
			}
		}
	}, []);

	const handleHitPointerLeave = useCallback((event) => {
		clearNavCursor();
		const id = event.currentTarget?.getAttribute("aria-label");
		if (id === hoveredProjectNavIdRef.current) {
			clearCaseProjectNavSnakeHover(id);
			hoveredProjectNavIdRef.current = null;
			requestPaintRef.current(true);
		}
	}, [clearNavCursor]);

	const guardCaseChromeHit = useCallback((event, action) => {
		if (!caseChromeOwnsHexHitAtClientY(event.clientY)) {
			return;
		}
		action();
	}, []);

	useEffect(() => {
		const unregister = registerCaseProjectNavSnakeRepaint(() => {
			requestPaintRef.current(true);
		});
		return () => {
			unregister();
			clearCaseProjectNavSnakeHover(hoveredProjectNavIdRef.current);
			hoveredProjectNavIdRef.current = null;
			disposeCaseProjectNavSnake();
		};
	}, []);

	return (
		<div ref={hostRef} className={styles.caseStudyPanelHudHost} aria-hidden="true">
			<canvas ref={fromCanvasRef} className={styles.caseStudyPanelHudCanvas} />
			<canvas ref={toCanvasRef} className={styles.caseStudyPanelHudCanvas} />
			<canvas
				ref={chromeCanvasRef}
				className={styles.caseStudyPanelHudChromeCanvas}
			/>
			{!hideProjectNavigation && !chromeRevealLocked && hitRegions.map((region) => (
				<button
					key={region.id}
					type="button"
					className={styles.caseStudyPanelHudHit}
					style={{
						left: region.x,
						top: region.y,
						width: region.w,
						height: region.h,
					}}
					tabIndex={-1}
					aria-label={region.id}
					onPointerEnter={handleHitPointerEnter}
					onPointerLeave={handleHitPointerLeave}
					onClick={(event) => {
						event.preventDefault();
						event.stopPropagation();
						guardCaseChromeHit(event, () => {
							activateCaseProjectCanvasNavigation(region, pathname);
						});
					}}
				/>
			))}
			{!chromeRevealLocked && stageHitRegions.map((region) => (
				<button
					key={region.id}
					type="button"
					className={styles.caseStudyPanelHudHit}
					style={{
						left: region.x,
						top: region.y,
						width: region.w,
						height: region.h,
					}}
					tabIndex={-1}
					aria-label={region.id}
					onClick={(event) => {
						event.preventDefault();
						event.stopPropagation();
						guardCaseChromeHit(event, () => {
							if (region.stateId && region.stateId !== activeStateId) {
								goToState(region.stateId);
							}
						});
					}}
				/>
			))}
		</div>
	);
}

CaseStudyPanelHudPainter.propTypes = {
	hideProjectNavigation: PropTypes.bool,
	skipPanelIntro: PropTypes.bool,
};
