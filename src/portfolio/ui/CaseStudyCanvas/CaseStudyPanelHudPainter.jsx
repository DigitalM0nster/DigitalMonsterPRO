import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { wakeCaseStudyAnimationFrame } from "@/portfolio/core/caseStudyAnimationFrame.js";
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
import {
	cancelCasePanelHudEnter,
	getCasePanelHudRevealMosaicScope,
	isCasePanelHudRevealBusy,
	isCasePanelHudRevealExiting,
	playCasePanelHudEnter,
	playCasePanelHudExit,
	releaseCasePanelHud,
} from "@/portfolio/core/casePanelHudReveal.js";
import {
	getCaseStageClickMosaicFromIndex,
	getCaseStageClickMosaicTargetIndex,
	isCaseStageClickMosaicActive,
	registerCaseStageClickMosaicPrepare,
} from "@/portfolio/core/caseStageClickMosaic.js";
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
import { useRouteTransitionContext } from "@/context/RouteTransitionContext.jsx";
import { store } from "@/store.jsx";
import { normalizeSiteLocale } from "@/utils/siteLocale.js";
import { isCaseEnterFromAnotherCase } from "@/utils/hexNavigation.js";
import { LEFT_MENU_SELECTOR } from "@/three/scenes/home/heroText/heroTextLayout.js";
import { subscribeLeftMenuContentAnchor } from "@/components/HTML/components/leftMenu/leftMenuContentAnchor.js";
import styles from "./CaseStudyPanelHudPainter.module.scss";

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
	const lastPublishMetaRef = useRef({ hitRegions: [], mosaicBounds: null });
	const coalesceRef = useRef({ scheduled: false, force: false });
	const introFinishedRef = useRef(Boolean(skipPanelIntro));
	const projectIdRef = useRef(null);
	const hoveredProjectNavIdRef = useRef(null);
	/** case→case: paint new prev/next names from click so snake can disappear→appear during hex. */
	const pendingNavRef = useRef(null);
	const [hitRegions, setHitRegions] = useState([]);
	const [panelConfigRevision, setPanelConfigRevision] = useState(0);
	const [siteLocale, setSiteLocale] = useState(() => normalizeSiteLocale(store.siteLocale));
	const [hudReady, setHudReady] = useState(false);
	const [chromeRevealLocked, setChromeRevealLocked] = useState(false);
	const { project, activeState, activeStateIndex, activeStateId, isInvestigating } = usePortfolioProject();

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
	}, [activeState, activeStateId, activeStateIndex, project, siteLocale]);

	const publishHud = useCallback((fromCanvas, toCanvas, meta, dirtyCanvases) => {
		const bounds = meta.mosaicBounds;
		const vw = Math.max(1, bounds?.viewportW ?? fromCanvas.width);
		const vh = Math.max(1, bounds?.viewportH ?? fromCanvas.height);
		const drawCfg = {
			...resolveLeftPanelDrawConfig(bounds?.viewportW ?? hostRef.current?.clientWidth ?? window.innerWidth),
			...(project.config.caseStudy?.leftPanel ?? {}),
		};
		const hitsLocked = !introFinishedRef.current || isCasePanelHudRevealBusy();
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
	}, [project]);

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
		const navData = pendingNavRef.current?.data ?? projectNavigationData;
		const chromeKey = [
			siteLocale,
			viewportW,
			viewportH,
			hideProjectNavigation ? 1 : 0,
			navData?.previousName ?? "",
			navData?.nextName ?? "",
			navData?.previousProject?.config?.id ?? "",
			navData?.nextProject?.config?.id ?? "",
			pendingNavRef.current?.projectId ?? pathname,
		].join("|");
		const chromeChanged = chromeKey !== lastChromeKeyRef.current;

		const paintChromeLive = () => {
			if (hideProjectNavigation) {
				publishChromeHits(null);
				const chromeCanvas = chromeCanvasRef.current;
				if (chromeCanvas) {
					const ctx = chromeCanvas.getContext("2d");
					ctx?.setTransform(1, 0, 0, 1, 0, 0);
					ctx?.clearRect(0, 0, chromeCanvas.width, chromeCanvas.height);
				}
				lastChromeKeyRef.current = chromeKey;
				chromeMosaicFrozenKeyRef.current = "";
				return;
			}
			const chromeCanvas = chromeCanvasRef.current;
			if (!chromeCanvas) {
				return;
			}

			const dpr = resolveCaseStudyPanelHudPixelRatio(store.graphicsTier);
			const paintProject = pendingNavRef.current
				? (getProjectByRoute(pendingNavRef.current.route) ?? project)
				: project;
			const paintPath = pendingNavRef.current?.route ?? pathname;
			const fullReveal = getCasePanelHudRevealMosaicScope() === "full";
			const enterProgress = getCasePanelHudEnterProgress();
			const mosaicActive = fullReveal && enterProgress != null;

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
							canvas: source,
							viewportW,
							viewportH,
							project: paintProject,
							pathname: paintPath,
							projectNavigationData: navData,
							hideProjectNavigation,
						});
						chromeBoundsRef.current = painted?.chromeBounds ?? null;
					}
					chromeMosaicFrozenKeyRef.current = chromeKey;
				}

				const bounds = chromeBoundsRef.current ?? {
					x: 0,
					y: Math.round(viewportH * 0.72),
					width: viewportW,
					height: Math.max(1, Math.round(viewportH * 0.28)),
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
				publishChromeHits(null);
				lastChromeKeyRef.current = chromeKey;
				return;
			}

			chromeMosaicFrozenKeyRef.current = "";
			const painted = paintCaseStudyPanelHudChrome({
				canvas: chromeCanvas,
				viewportW,
				viewportH,
				project: paintProject,
				pathname: paintPath,
				projectNavigationData: navData,
				hideProjectNavigation,
			});
			chromeBoundsRef.current = painted?.chromeBounds ?? null;
			publishChromeHits(painted);
			lastChromeKeyRef.current = chromeKey;
		};

		// Content exit owns from/to textures — never republish content mid-exit.
		// DOM chrome stays live (hover snake paints straight to the visible canvas).
		const contentPaintBlocked = isCasePanelHudRevealExiting()
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
		if (!force && !contentChanged && !complementPending && !chromeChanged) {
			return;
		}

		if (!force && !contentChanged && !complementPending && chromeChanged) {
			paintChromeLive();
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
		const complement = isCaseStageClickMosaicActive() ? false : consumeCasePanelHudComplementPaint();
		const canRecycleForward =
			!force
			&& !complement
			&& !isCaseStageClickMosaicActive()
			&& prevIndex != null
			&& paintIndex === prevIndex + 1
			&& next
			&& lastPublishMetaRef.current.mosaicBounds;
		const canRecycleBackward =
			!force
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
		publishHud(fromCanvas, next ? toCanvas : fromCanvas, meta, dirtyCanvases);
		paintChromeLive();

		if (!hudReady && meta.mosaicBounds) {
			setHudReady(true);
		}
		if (
			!introFinishedRef.current
			&& !skipPanelIntro
			&& !isCasePanelHudRevealBusy()
		) {
			// Keep HUD hidden until enter animation starts (buffers already valid).
			setCasePanelHudEnterProgress(0);
		}
	}, [
		hideProjectNavigation,
		hudReady,
		panelConfigRevision,
		pathname,
		project,
		projectNavigationData,
		publishChromeHits,
		publishHud,
		resolvePaintFrames,
		routePhase,
		siteLocale,
		skipPanelIntro,
	]);

	const paintNowRef = useRef(paintNow);
	paintNowRef.current = paintNow;

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

	// Drive DOM chrome mosaic from the same enterProgress owner as the WebGL left band.
	useEffect(() => {
		return registerCasePanelHudSyncListener(() => {
			const fullReveal = getCasePanelHudRevealMosaicScope() === "full";
			const progress = getCasePanelHudEnterProgress();
			const locked = fullReveal && progress != null;
			setChromeRevealLocked(locked);

			if (locked) {
				// Force a chrome mosaic frame every progress tick (source is frozen).
				requestPaintRef.current(true);
				return;
			}

			chromeMosaicFrozenKeyRef.current = "";
			if (introFinishedRef.current) {
				requestPaintRef.current(true);
			}
		});
	}, []);

	// Drop any legacy WebGL chrome canvas from the bridge — nav is DOM-only now.
	useEffect(() => {
		setCasePanelHudChromeState({ canvas: null, hitRegions: [], bumpTexture: true });
	}, []);

	// case→case: same overlay instance — refresh content + band enter; keep chrome/snake alive.
	// Prev/next names transition via disappear→appear snake (see caseProjectNavSnake).
	useEffect(() => {
		const nextId = project.config.id;
		const prevId = projectIdRef.current;
		projectIdRef.current = nextId;
		if (pendingNavRef.current?.projectId === nextId) {
			pendingNavRef.current = null;
		}
		if (prevId == null || prevId === nextId) {
			return;
		}
		lastContentKeyRef.current = "";
		lastChromeKeyRef.current = "";
		lastPaintIndexRef.current = null;
		lastPublishMetaRef.current = { hitRegions: [], mosaicBounds: null };
		chromeMosaicFrozenKeyRef.current = "";
		chromeBoundsRef.current = null;
		introFinishedRef.current = false;
		hoveredProjectNavIdRef.current = null;
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

	// Enter: mosaic roll-up + scroll text sound.
	useEffect(() => {
		if (skipPanelIntro) {
			introFinishedRef.current = true;
			setCasePanelHudEnterProgress(null);
			return undefined;
		}
		if (
			introFinishedRef.current
			|| isCasePanelHudRevealBusy()
			|| routePhase !== "idle"
			|| !hudReady
		) {
			return undefined;
		}

		playCasePanelHudEnter({
			delayMs: Math.max(0, project.config.caseStudy?.panelIntroDelayMs ?? 500),
			// case→case: left band only; chrome stays live (no mosaic).
			// non-case→case: full — DOM chrome mosaics in with enterProgress.
			mosaicScope: isCaseEnterFromAnotherCase() ? "band" : "full",
			onComplete: () => {
				introFinishedRef.current = true;
				chromeMosaicFrozenKeyRef.current = "";
				lastContentKeyRef.current = "";
				lastChromeKeyRef.current = "";
				paintNowRef.current(true);
			},
		});

		return () => {
			// Strict/remount: cancel enter so the effect can restart; do not mark finished.
			if (!introFinishedRef.current) {
				cancelCasePanelHudEnter();
			}
		};
	}, [hudReady, project.config.id, project.config.caseStudy?.panelIntroDelayMs, routePhase, skipPanelIntro]);

	// Exit (non-hex HTML route leave). Hex leave-site uses playCasePanelHudExit in hexNavigation.
	useEffect(() => {
		if (skipPanelIntro || routePhase !== "exiting" || isCasePanelHudRevealExiting()) {
			return undefined;
		}
		introFinishedRef.current = true;
		playCasePanelHudExit({ mosaicScope: "full" });
		return undefined;
	}, [routePhase, skipPanelIntro]);

	useEffect(() => {
		const stopConfig = subscribeCaseStudyLeftPanelConfig(() => {
			setPanelConfigRevision((value) => value + 1);
		});
		const stopLocale = subscribeKey(store, "siteLocale", (value) => {
			setSiteLocale(normalizeSiteLocale(value));
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
			window.removeEventListener("resize", onResize);
			resizeObserver?.disconnect();
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
						const targetPath = region.targetPath;
						const targetProject = targetPath ? getProjectByRoute(targetPath) : null;
						if (
							targetProject
							&& targetProject.config.id !== project.config.id
							&& (region.id === "previous" || region.id === "next")
						) {
							pendingNavRef.current = {
								projectId: targetProject.config.id,
								route: targetProject.config.route,
								data: resolveCaseProjectCanvasNavigationData(targetProject, siteLocale),
							};
							lastChromeKeyRef.current = "";
							requestPaintRef.current(true);
						}
						activateCaseProjectCanvasNavigation(region, pathname);
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
