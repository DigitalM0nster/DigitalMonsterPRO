import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import PropTypes from "prop-types";
import { subscribeKey } from "valtio/utils";
import styles from "./CaseStudyCanvasUI.module.scss";
import { usePortfolioProject } from "@/portfolio/core/PortfolioProjectContext.jsx";
import { buildCaseStudyFrameData } from "@/portfolio/core/caseStudyFrameData.js";
import { resolveCaseStudyLayout } from "./caseStudyCanvasLayout.js";
import { drawArcNavigation, drawLeftPanel } from "./caseStudyCanvasDraw.js";
import { pickCaseStudyHitRegion } from "./caseStudyCanvasHitTest.js";
import { resolveLeftPanelDrawConfig, subscribeCaseStudyLeftPanelConfig } from "./caseStudyLeftPanelConfig.js";
import { caseStudyArcInternals, caseStudyArcRuntime, CASE_STUDY_ARC_INTRO_MS, CASE_STUDY_ARC_INTRO_START_DEG } from "./caseStudyArcConfig.js";
import {
	prepareCaseStudyCanvasContext,
	readCaseStudyCanvasViewport,
	resolveCaseStudyCanvasBleedRight,
	resolveCaseStudyCanvasOriginPx,
	resolveCaseStudyCanvasPixelRatio,
} from "./caseStudyCanvasSurface.js";
import {
	markCaseStudyArcDirty,
	registerCaseStudyArcPaint,
	registerCaseStudyPanelScrollPaint,
	registerCaseStudyPanelStagePaint,
	stopCaseStudyAnimationFrame,
	wakeCaseStudyAnimationFrame,
} from "@/portfolio/core/caseStudyAnimationFrame.js";
import { syncArcGlowTargetFromScroll } from "./caseStudyArcGlowMotion.js";
import {
	clearCaseStudyArcPreviewProjectId,
	setCaseStudyArcPreviewProjectId,
} from "./caseStudyArcProjects.js";
import { getStageProgress } from "@/portfolio/core/stageProgress.js";
import { ensureCaseStudyCanvasFonts } from "./caseStudyCanvasText.js";
import { resolveAnchoredBottomLayout } from "./caseStudyLeftPanelFlow.js";
import { resolveCaseProjectNavigationReservePx } from "../CaseProjectNavigation/caseProjectNavigationLayout.js";
import {
	activateCaseProjectCanvasNavigation,
	drawCaseProjectCanvasNavigation,
	resolveCaseProjectCanvasNavigationData,
	resolveCaseProjectCanvasNavigationLayout,
} from "./caseProjectCanvasNavigation.js";
import { resetArcNavLabelColorMotion } from "./caseStudyArcNavLabelMotion.js";
import { store } from "@/store.jsx";
import { LEFT_MENU_SELECTOR } from "@/three/scenes/home/heroText/heroTextLayout.js";
import { subscribeLeftMenuContentAnchor } from "@/components/HTML/components/leftMenu/leftMenuContentAnchor.js";
import {
	captureCaseStudyPanelRegion,
	createCanvasSnapshot,
	drawCaseStudyPanelMosaicMix,
	playCaseStudyPanelMosaicEnter,
	playCaseStudyPanelMosaicTransition,
} from "./caseStudyPanelGlitchTransition.js";
import { caseStudyLeftPanelConfig } from "./caseStudyLeftPanelConfig.js";
import CaseStudySelectableText from "./CaseStudySelectableText.jsx";
import { normalizeSiteLocale } from "@/utils/siteLocale.js";
import { useRouteTransitionContext } from "@/context/RouteTransitionContext.jsx";
import {
	clearCaseProjectNavSnakeHover,
	disposeCaseProjectNavSnake,
	playCaseProjectNavSnakeHover,
	registerCaseProjectNavSnakeRepaint,
} from "./caseProjectNavSnake.js";
import {
	clearCaseStudyArcNavSnakeHover,
	disposeCaseStudyArcNavSnake,
	disposeCaseStudyArcNavSnakeIfOrphaned,
	playCaseStudyArcNavSnakeHover,
	registerCaseStudyArcNavSnakeRepaint,
} from "./caseStudyArcNavSnake.js";
import { resetCaseStudyArcShiftMotion } from "./caseStudyArcPositionMotion.js";
import { resetCaseStudyArcFocusMotion } from "./caseStudyArcFocusMotion.js";
import { resetCaseStudyArcSelectSequence } from "./caseStudyArcSelectSequence.js";
import { resetArcLabelHover } from "./caseStudyArcLabelHover.js";
import { setArcGlowPulseGate } from "./caseStudyArcNodeHighlight.js";
import { isCaseEnterFromAnotherCase, isCaseLeavingToNonCase } from "@/utils/hexNavigation.js";

function getCanvasMosaicIntroConfig() {
	return {
		mosaicColumns: Math.max(1, Math.round(caseStudyLeftPanelConfig.mosaicColumns * 3)),
		mosaicRows: Math.max(1, Math.round(caseStudyLeftPanelConfig.mosaicRows * 2)),
		mosaicLiftStrength: caseStudyLeftPanelConfig.mosaicLiftStrength,
		mosaicRandomLift: caseStudyLeftPanelConfig.mosaicRandomLift,
		mosaicScatterX: caseStudyLeftPanelConfig.mosaicScatterX,
		mosaicDelay: caseStudyLeftPanelConfig.mosaicDelay,
	};
}

function fullCanvasBounds(canvas) {
	return {
		x: 0,
		y: 0,
		width: canvas.width,
		height: canvas.height,
	};
}

function clearCanvasPixels(canvas) {
	const ctx = canvas?.getContext("2d");
	if (!ctx || !canvas) {
		return;
	}
	ctx.save();
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	ctx.restore();
}

/**
 * Content band under the fixed header (contentTopPx). Header is never re-centered.
 * @returns {{ zoneTop: number, zoneBottom: number, zoneHeight: number } | null}
 */
function resolveLeftPanelVerticalZone(caseNavigationLayout, canvasOriginY = 0, cachedZoneRef = null, zoneKey = "", viewportH = 0) {
	if (cachedZoneRef?.current && cachedZoneRef.current.key === zoneKey) {
		return cachedZoneRef.current.zone;
	}

	let headerTop = null;
	if (caseNavigationLayout?.headerTop != null && Number.isFinite(caseNavigationLayout.headerTop)) {
		headerTop = caseNavigationLayout.headerTop;
	} else if (caseNavigationLayout?.allProjects) {
		headerTop = caseNavigationLayout.allProjects.y + caseNavigationLayout.allProjects.h + 14;
	}
	if (headerTop == null || !Number.isFinite(headerTop)) {
		return null;
	}

	const zoneTop = headerTop - canvasOriginY;
	const zoneBottom = Math.max(zoneTop + 120, (viewportH || window.innerHeight || 900) - 48);
	const zoneHeight = zoneBottom - zoneTop;
	if (zoneHeight <= 0) {
		return null;
	}

	const zone = { zoneTop, zoneBottom, zoneHeight };
	if (cachedZoneRef) {
		cachedZoneRef.current = { key: zoneKey, zone };
	}
	return zone;
}

const CASE_NAV_CURSOR_SOURCE = "caseNav";

function setCaseNavCursorAnchor(hit, canvasRect) {
	document.body.classList.add("caseNavPointerActive");
	const anchorKey = `${CASE_NAV_CURSOR_SOURCE}:${hit.stateId}`;
	if (store.cursor.menuAnchorKey !== anchorKey) {
		store.cursor.menuAnchorKey = anchorKey;
		store.cursor.menuAnchorRevision += 1;
	}
	store.cursor.caseNavHovered = true;
	store.cursor.menuAnchorActive = true;
	store.cursor.menuAnchorX = canvasRect.left + (hit.anchorX ?? hit.x);
	store.cursor.menuAnchorY = canvasRect.top + (hit.anchorY ?? hit.y);
	store.cursor.menuAnchorDiameter = hit.anchorDiameter ?? Math.max(1, hit.r * 2);
	store.cursor.menuAnchorSource = CASE_NAV_CURSOR_SOURCE;
	store.cursor.hovered = true;
}

function clearCaseNavCursorAnchor() {
	document.body.classList.remove("caseNavPointerActive");
	store.cursor.caseNavHovered = false;
	if (store.cursor.menuAnchorSource !== CASE_NAV_CURSOR_SOURCE) {
		return;
	}
	store.cursor.menuAnchorActive = false;
	store.cursor.menuAnchorDiameter = 0;
	store.cursor.menuAnchorSource = null;
	store.cursor.menuAnchorKey = null;
	store.cursor.hovered = false;
}

function setCaseProjectNavCursor() {
	document.body.classList.add("caseNavPointerActive");
	store.cursor.caseNavHovered = true;
	if (store.cursor.menuAnchorSource === CASE_NAV_CURSOR_SOURCE) {
		store.cursor.menuAnchorActive = false;
		store.cursor.menuAnchorDiameter = 0;
		store.cursor.menuAnchorSource = null;
		store.cursor.menuAnchorKey = null;
	}
	store.cursor.hovered = true;
}

/**
 * 2D HUD кейса: canvas — левая панель (desktop) + дуга навигации.
 * На mobile с horizontal swipe панель скрыта — см. CaseStudyMobileShell.
 */
export default function CaseStudyCanvasUI({
	hideLeftPanel = false,
	hideArcNavigation = false,
	hideProjectNavigation = false,
	skipPanelIntro = false,
}) {
	const { phase: routePhase } = useRouteTransitionContext();
	const { pathname } = useLocation();
	const hostRef = useRef(null);
	const panelCanvasRef = useRef(null);
	const selectableTextRef = useRef(null);
	const arcCanvasRef = useRef(null);
	const hitRegionsRef = useRef([]);
	const projectNavigationHitRegionsRef = useRef([]);
	const hoveredArcStateIdRef = useRef(null);
	const hoveredProjectNavIdRef = useRef(null);
	const fontsReadyRef = useRef(false);
	const panelGlitchActiveRef = useRef(false);
	const cancelPanelGlitchRef = useRef(null);
	const lastAnimatedStateIdRef = useRef(null);
	const lastAnimatedStateIndexRef = useRef(null);
	const lastAnimatedLocaleRef = useRef(null);
	const panelNavigationClickRef = useRef(false);
	const panelHexTransitionActiveRef = useRef(false);
	const uiIntroPlayedRef = useRef(false);
	const uiIntroDelayRef = useRef(0);
	const panelIntroTargetRef = useRef(null);
	const arcIntroFrameRef = useRef(0);
	const arcIntroPlayedRef = useRef(false);
	const arcIntroDelayRef = useRef(0);
	/** Snapshot at mount: case→case skips orbit; hub/about/… → case plays orbit. */
	const enterFromAnotherCaseRef = useRef(isCaseEnterFromAnotherCase());
	const panelStageBoundsRef = useRef(null);
	const panelStageConfigRef = useRef(null);
	const panelMosaicFromRef = useRef(null);
	const panelMosaicToRef = useRef(null);
	const panelMosaicCacheKeyRef = useRef("");
	const cachedPanelZoneRef = useRef(null);
	const selectableTextLayoutKeyRef = useRef("");
	const [panelConfigRevision, setPanelConfigRevision] = useState(0);
	const [uiIntroPrepared, setUiIntroPrepared] = useState(false);
	const [fontsReady, setFontsReady] = useState(false);
	const [siteLocale, setSiteLocale] = useState(() => normalizeSiteLocale(store.siteLocale));
	const displayedLocaleRef = useRef(siteLocale);
	const desiredLocaleRef = useRef(siteLocale);
	const localeGlitchRunningRef = useRef(false);

	const { project, activeState, activeStateIndex, activeStateId, goToState, isInvestigating } = usePortfolioProject();

	const frameData = useMemo(() => {
		return buildCaseStudyFrameData(project, activeState, activeStateIndex, activeStateId, {
			isInvestigating,
			locale: siteLocale,
		});
	}, [project, activeState, activeStateIndex, activeStateId, isInvestigating, siteLocale]);
	const projectNavigationData = useMemo(() => resolveCaseProjectCanvasNavigationData(project, siteLocale), [project, siteLocale]);
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

	const frameDataRef = useRef(frameData);
	const nextFrameDataRef = useRef(nextFrameData);
	frameDataRef.current = frameData;
	nextFrameDataRef.current = nextFrameData;

	const resolvePaintFrames = useCallback(() => {
		const storeIndex = store.portfolioExperience.activeStateIndex;
		const storeIndexValid =
			Number.isInteger(storeIndex) &&
			storeIndex >= 0 &&
			storeIndex < project.states.length;
		const paintIndex = storeIndexValid ? storeIndex : activeStateIndex;
		const paintState = project.states[paintIndex] ?? activeState;
		const paintStateId = paintState?.id ?? activeStateId;

		// После commit stageProgress=0, а React ещё на старом index — берём store.
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
			paintIndex,
		};
	}, [activeState, activeStateId, activeStateIndex, project, siteLocale]);

	const readViewport = useCallback(() => {
		// When left panel is WebGL-only, panel canvas is unmounted — use arc canvas / host.
		const surface = panelCanvasRef.current ?? arcCanvasRef.current;
		if (surface) {
			return readCaseStudyCanvasViewport(surface);
		}
		const host = hostRef.current;
		return {
			viewportW: host?.clientWidth ?? (typeof window !== "undefined" ? window.innerWidth : 0),
			viewportH: host?.clientHeight ?? (typeof window !== "undefined" ? window.innerHeight : 0),
			host,
			canvas: null,
		};
	}, []);

	const buildDrawFrame = useCallback((baseFrame = frameDataRef.current) => {
		return {
			...baseFrame,
			scrollProgress: store.scroll,
			hoveredArcStateId: hoveredArcStateIdRef.current,
			activeProjectId: project.config.id,
			locale: siteLocale,
		};
	}, [project.config.id, siteLocale]);

	const paintPanel = useCallback(() => {
		if (hideLeftPanel || !fontsReadyRef.current || panelGlitchActiveRef.current || panelHexTransitionActiveRef.current) {
			projectNavigationHitRegionsRef.current.length = 0;
			return;
		}
		const canvas = panelCanvasRef.current;
		if (!canvas) {
			return;
		}

		const { viewportW, viewportH, canvas: panelCanvas } = readViewport();
		if (viewportW <= 0 || viewportH <= 0) {
			return;
		}

		const canvasOrigin = resolveCaseStudyCanvasOriginPx(panelCanvas);
		const dpr = resolveCaseStudyCanvasPixelRatio(store.graphicsTier);
		const ctx = prepareCaseStudyCanvasContext(canvas, viewportW, viewportH, dpr);
		if (!ctx) {
			return;
		}

		ctx.clearRect(0, 0, viewportW, viewportH);
		projectNavigationHitRegionsRef.current.length = 0;
		const panelWidth = project.config.caseStudy?.panelWidth;
		const navigationReserve = resolveCaseProjectNavigationReservePx(viewportW, viewportH);
		const configuredBottomInset = project.config.caseStudy?.contentBottomInsetPx ?? 0;
		const layoutOptions = {
			...(panelWidth ? { panelWidth } : {}),
			...(project.config.caseStudy?.contentTopPx != null ? { contentTopPx: project.config.caseStudy.contentTopPx } : {}),
			contentBottomInsetPx: Math.max(configuredBottomInset, navigationReserve - 32),
		};
		const layout = resolveCaseStudyLayout(viewportW, viewportH, project.states.length, canvasOrigin, canvas, layoutOptions);
		if (layout) {
			const projectNavLayout = resolveCaseProjectCanvasNavigationLayout(viewportW, viewportH, layout.leftPanel);
			projectNavLayout.headerTop = layout.leftPanel.y;
			const stageGlitchConfig = {
				...resolveLeftPanelDrawConfig(viewportW),
				...(project.config.caseStudy?.leftPanel ?? {}),
			};
			const { current: paintFrameData, next: paintNextFrameData } = resolvePaintFrames();
			const stageProgress = getStageProgress();
			const drawFrame = buildDrawFrame(paintFrameData);
			const layoutKey = `${drawFrame.activeStateId}|${siteLocale}|${viewportW}|${viewportH}|${panelConfigRevision}`;
			const verticalZone = resolveLeftPanelVerticalZone(
				projectNavLayout,
				canvasOrigin.y ?? 0,
				cachedPanelZoneRef,
				`${siteLocale}|${viewportW}|${viewportH}|${panelConfigRevision}`,
				viewportH,
			);
			if (verticalZone && layout.centerClear) {
				layout.centerClear.y = layout.leftPanel.y;
				layout.centerClear.height = Math.max(120, verticalZone.zoneBottom - layout.leftPanel.y);
			}

			const panel = layout.leftPanel;
			const padding = 20;
			const captureOverflowRight = Math.max(
				200,
				stageGlitchConfig.titleFontSize * 6,
				(stageGlitchConfig.mosaicScatterX ?? 0) + stageGlitchConfig.titleFontSize * 2,
			);
			const captureWidth = panel.width + padding + captureOverflowRight;
			const baseCaptureWidth = panel.width + padding * 2;
			const mosaicCaptureConfig = {
				...stageGlitchConfig,
				// Scroll mix used to reach 20x15 tiles (600 drawImage calls per frame).
				// A coarser grid preserves the mosaic while cutting the hot path substantially.
				mosaicColumns: Math.min(
					12,
					Math.max(1, Math.round((stageGlitchConfig.mosaicColumns * captureWidth) / baseCaptureWidth)),
				),
				mosaicRows: Math.min(10, Math.max(1, Math.round(stageGlitchConfig.mosaicRows ?? 10))),
			};

			// Capture bounds = вертикальная зона до «ВСЕ ПРОЕКТЫ» (без самой навигации).
			const mosaicBottomGap = 4;
			const captureTop = (verticalZone?.zoneTop ?? panel.y) - padding;
			const captureBottom = (verticalZone?.zoneBottom ?? panel.y + (layout.centerClear?.height ?? viewportH)) - mosaicBottomGap;
			panelStageBoundsRef.current = {
				x: (panel.x - padding) * dpr,
				y: captureTop * dpr,
				width: captureWidth * dpr,
				height: Math.max(1, (captureBottom - captureTop) * dpr),
			};
			panelStageConfigRef.current = mosaicCaptureConfig;

			const useMosaic = Boolean(paintNextFrameData) && stageProgress > 0.0001 && !panelGlitchActiveRef.current;
			if (useMosaic) {
				panelMosaicFromRef.current ??= document.createElement("canvas");
				panelMosaicToRef.current ??= document.createElement("canvas");
				const mosaicCacheKey = `${layoutKey}|${panel.x}|${captureTop}|${captureWidth}|${captureBottom - captureTop}`;
				let capturedBounds = null;

				if (panelMosaicCacheKeyRef.current !== mosaicCacheKey) {
					drawLeftPanel(ctx, layout, drawFrame, canvas);
					capturedBounds = captureCaseStudyPanelRegion(
						canvas,
						panelMosaicFromRef.current,
						panelStageBoundsRef.current,
					);

					ctx.clearRect(0, 0, viewportW, viewportH);
					const nextLayout = {
						...layout,
						leftPanel: { ...layout.leftPanel },
						centerClear: layout.centerClear ? { ...layout.centerClear } : null,
					};
					drawLeftPanel(ctx, nextLayout, { ...paintNextFrameData, scrollProgress: store.scroll }, canvas);
					captureCaseStudyPanelRegion(
						canvas,
						panelMosaicToRef.current,
						panelStageBoundsRef.current,
					);
					panelMosaicCacheKeyRef.current = mosaicCacheKey;
				} else {
					capturedBounds = {
						x: Math.max(0, Math.floor(panelStageBoundsRef.current.x)),
						y: Math.max(0, Math.floor(panelStageBoundsRef.current.y)),
						width: panelMosaicFromRef.current.width,
						height: panelMosaicFromRef.current.height,
					};
				}

				if (capturedBounds) {
					drawCaseStudyPanelMosaicMix(
						canvas,
						panelMosaicFromRef.current,
						panelMosaicToRef.current,
						capturedBounds,
						stageProgress,
						mosaicCaptureConfig,
					);
				}
			} else {
				panelMosaicCacheKeyRef.current = "";
				drawLeftPanel(ctx, layout, drawFrame, canvas);
			}

			if (!hideProjectNavigation) {
				drawCaseProjectCanvasNavigation(
					ctx,
					projectNavLayout,
					projectNavigationData,
					projectNavigationHitRegionsRef.current,
					pathname,
				);
			}

			const selectableText = selectableTextRef.current;
			if (selectableText) {
				const pad = panel.padding ?? 0;
				const innerW = Math.max(1, panel.width - pad * 2);
				const zoneHeight = Math.max(120, layout.centerClear?.height ?? viewportH);
				const anchored = resolveAnchoredBottomLayout(ctx, drawFrame, stageGlitchConfig, innerW, zoneHeight);
				const textLayoutKey = `${layoutKey}|${panel.x}|${panel.y}|${panel.width}|${zoneHeight}|${anchored?.bottomY ?? 0}`;
				if (textLayoutKey !== selectableTextLayoutKeyRef.current) {
					selectableTextLayoutKeyRef.current = textLayoutKey;
					selectableText.style.left = `${panel.x + pad}px`;
					selectableText.style.top = `${panel.y + pad}px`;
					selectableText.style.width = `${Math.max(1, panel.width - pad * 2)}px`;
					selectableText.style.height = `${Math.max(1, zoneHeight)}px`;
					selectableText.style.setProperty("--badge-size", `${stageGlitchConfig.categoryFontSize}px`);
					selectableText.style.setProperty("--badge-gap", `${stageGlitchConfig.gapAfterBadge}px`);
					selectableText.style.setProperty("--category-size", `${stageGlitchConfig.categoryFontSize}px`);
					selectableText.style.setProperty("--category-line", `${stageGlitchConfig.categoryLineHeight}px`);
					selectableText.style.setProperty("--category-gap", `${stageGlitchConfig.gapAfterCategory}px`);
					selectableText.style.setProperty("--title-size", `${stageGlitchConfig.titleFontSize}px`);
					selectableText.style.setProperty("--title-line", String(stageGlitchConfig.titleLineHeightMul));
					selectableText.style.setProperty("--title-spacing", `${stageGlitchConfig.titleFontSize * stageGlitchConfig.titleLetterSpacing}px`);
					selectableText.style.setProperty("--title-gap", `${stageGlitchConfig.gapAfterTitle}px`);
					selectableText.style.setProperty("--description-size", `${stageGlitchConfig.descriptionFontSize}px`);
					selectableText.style.setProperty("--description-line", `${stageGlitchConfig.descriptionLineHeight}px`);
					selectableText.style.setProperty("--description-gap", `${stageGlitchConfig.gapAfterDescription}px`);
					selectableText.style.setProperty("--bottom-top", `${anchored?.bottomY ?? 0}px`);
					selectableText.style.setProperty("--stats-gap", `${stageGlitchConfig.gapBeforeStatsRail}px`);
					selectableText.style.setProperty("--trait-glyph-size", `${stageGlitchConfig.traitListGlyphSize}px`);
					selectableText.style.setProperty("--trait-glyph-col", `${stageGlitchConfig.traitListGlyphColW}px`);
					selectableText.style.setProperty("--trait-number-align", `${stageGlitchConfig.traitListNumberAlignX}px`);
					selectableText.style.setProperty("--trait-top-size", `${stageGlitchConfig.traitListTopSize}px`);
					selectableText.style.setProperty("--trait-bottom-size", `${stageGlitchConfig.traitListBottomSize}px`);
					selectableText.style.setProperty("--trait-row-pad", `${stageGlitchConfig.traitListRowPadY}px`);
					selectableText.style.setProperty("--trait-text-gap", `${stageGlitchConfig.traitListTextGap}px`);
				}
			}
		}
	}, [
		buildDrawFrame,
		hideLeftPanel,
		pathname,
		project,
		project.config.caseStudy?.contentBottomInsetPx,
		project.config.caseStudy?.contentTopPx,
		project.config.caseStudy?.leftPanel,
		project.config.caseStudy?.panelWidth,
		project.states.length,
		projectNavigationData,
		panelConfigRevision,
		readViewport,
		resolvePaintFrames,
		siteLocale,
		hideProjectNavigation,
	]);

	const paintArc = useCallback(() => {
		if (hideArcNavigation) {
			hitRegionsRef.current.length = 0;
			return;
		}
		if (!fontsReadyRef.current) {
			return;
		}
		const canvas = arcCanvasRef.current;
		if (!canvas) {
			return;
		}

		const { viewportW, viewportH, canvas: arcCanvasEl } = readViewport();
		if (viewportW <= 0 || viewportH <= 0) {
			return;
		}

		const canvasOrigin = resolveCaseStudyCanvasOriginPx(arcCanvasEl ?? canvas, hostRef.current);
		const bleed = resolveCaseStudyCanvasBleedRight(store.graphicsTier, caseStudyArcInternals.canvasBleedRight ?? 0);
		const canvasCssW = viewportW + bleed;
		const dpr = resolveCaseStudyCanvasPixelRatio(store.graphicsTier);
		const ctx = prepareCaseStudyCanvasContext(canvas, canvasCssW, viewportH, dpr);
		if (!ctx) {
			return;
		}

		ctx.clearRect(0, 0, canvasCssW, viewportH);
		hitRegionsRef.current.length = 0;

		const panelWidth = project.config.caseStudy?.panelWidth;
		// Arc is full-viewport; left-panel bottom reserve must not shrink it.
		const layoutOptions = {
			...(panelWidth ? { panelWidth } : {}),
			...(project.config.caseStudy?.contentTopPx != null ? { contentTopPx: project.config.caseStudy.contentTopPx } : {}),
			arcViewportTopPx: project.config.caseStudy?.arcViewportTopPx ?? 0,
			arcViewportBottomPx: project.config.caseStudy?.arcViewportBottomPx ?? viewportH,
		};
		const layout = resolveCaseStudyLayout(
			viewportW,
			viewportH,
			project.states.length,
			canvasOrigin,
			arcCanvasEl ?? canvas,
			layoutOptions,
		);
		if (!layout) {
			return;
		}
		drawArcNavigation(ctx, layout, buildDrawFrame(resolvePaintFrames().current), hitRegionsRef.current, viewportW, viewportH, canvasCssW);
	}, [
		buildDrawFrame,
		project.config.caseStudy?.arcViewportBottomPx,
		project.config.caseStudy?.arcViewportTopPx,
		project.config.caseStudy?.contentTopPx,
		project.config.caseStudy?.panelWidth,
		project.config.id,
		project.states.length,
		readViewport,
		resolvePaintFrames,
		siteLocale,
		hideArcNavigation,
	]);

	const paintAll = useCallback(() => {
		paintPanel();
		paintArc();
	}, [paintPanel, paintArc]);

	const paintPanelRef = useRef(paintPanel);
	const paintArcRef = useRef(paintArc);
	const paintAllRef = useRef(paintAll);
	paintPanelRef.current = paintPanel;
	paintArcRef.current = paintArc;
	paintAllRef.current = paintAll;

	useEffect(() => {
		registerCaseStudyArcPaint(() => paintArcRef.current());
		if (!hideLeftPanel) {
			registerCaseStudyPanelScrollPaint(() => paintPanelRef.current());
			// CPU mosaic mix — only when left panel is Canvas2D (not WebGL HUD).
			registerCaseStudyPanelStagePaint(() => paintPanelRef.current());
		}
		const unregisterProjectNavSnakeRepaint = hideLeftPanel
			? null
			: registerCaseProjectNavSnakeRepaint(() => paintPanelRef.current());
		const unregisterArcNavSnakeRepaint = hideArcNavigation
			? null
			: registerCaseStudyArcNavSnakeRepaint(() => paintArcRef.current());
		return () => {
			unregisterProjectNavSnakeRepaint?.();
			unregisterArcNavSnakeRepaint?.();
			if (!hideLeftPanel) {
				disposeCaseProjectNavSnake();
			}
			// Keep arc snake glyph caches across case→case remount; dispose if orphaned.
			if (!hideArcNavigation) {
				disposeCaseStudyArcNavSnakeIfOrphaned();
			}
			clearCaseStudyArcPreviewProjectId();
			setArcGlowPulseGate(0);
			registerCaseStudyArcPaint(null);
			registerCaseStudyPanelScrollPaint(null);
			registerCaseStudyPanelStagePaint(null);
			stopCaseStudyAnimationFrame();
		};
	}, [hideArcNavigation, hideLeftPanel]);

	useEffect(() => {
		// Kill leftover orbit debug from removed Case Arc panel.
		caseStudyArcInternals.showDebug = false;
		if (hideArcNavigation) {
			// The pulse gate is module-global; clear it when /about hides the case arc.
			setArcGlowPulseGate(0);
			// Leaving case arc entirely — drop ring/glow sequence (case→case keeps module state).
			resetCaseStudyArcFocusMotion();
			resetCaseStudyArcSelectSequence();
			resetArcLabelHover();
			disposeCaseStudyArcNavSnake();
		}
	}, [hideArcNavigation]);

	useLayoutEffect(() => {
		if (!skipPanelIntro) {
			return;
		}

		uiIntroPlayedRef.current = true;
		arcIntroPlayedRef.current = true;
		panelGlitchActiveRef.current = false;
		caseStudyArcRuntime.introRotationDeg = 0;
		caseStudyArcRuntime.introOpacity = 1;

		// For page-scroll entry the panel must be visible on the first mounted frame.
		// Fonts may still settle; the async font pass below repaints with final metrics.
		fontsReadyRef.current = true;
		setFontsReady(true);
		setUiIntroPrepared(true);
		paintAllRef.current();
		wakeCaseStudyAnimationFrame();
	}, [skipPanelIntro]);

	useLayoutEffect(() => {
		if (skipPanelIntro) {
			return undefined;
		}
		// Hide left panel until mosaic snapshot.
		panelGlitchActiveRef.current = !hideLeftPanel;
		if (hideArcNavigation) {
			caseStudyArcRuntime.introRotationDeg = 0;
			caseStudyArcRuntime.introOpacity = 1;
			return () => {
				cancelPanelGlitchRef.current?.();
				cancelPanelGlitchRef.current = null;
				if (uiIntroDelayRef.current) {
					window.clearTimeout(uiIntroDelayRef.current);
					uiIntroDelayRef.current = 0;
				}
				if (arcIntroFrameRef.current) {
					cancelAnimationFrame(arcIntroFrameRef.current);
					arcIntroFrameRef.current = 0;
				}
				if (arcIntroDelayRef.current) {
					window.clearTimeout(arcIntroDelayRef.current);
					arcIntroDelayRef.current = 0;
				}
				panelGlitchActiveRef.current = false;
				panelIntroTargetRef.current = null;
				caseStudyArcRuntime.introRotationDeg = 0;
				caseStudyArcRuntime.introOpacity = 1;
			};
		}

		if (enterFromAnotherCaseRef.current) {
			// case→case: arc at rest (project labels are plain Canvas2D, no snake cache).
			caseStudyArcRuntime.introRotationDeg = 0;
			caseStudyArcRuntime.introOpacity = 1;
		} else {
			// hub/about/home/… → case: park arc off-orbit for slide-in appear.
			caseStudyArcRuntime.introRotationDeg = CASE_STUDY_ARC_INTRO_START_DEG;
			caseStudyArcRuntime.introOpacity = 0;
		}

		return () => {
			cancelPanelGlitchRef.current?.();
			cancelPanelGlitchRef.current = null;
			if (uiIntroDelayRef.current) {
				window.clearTimeout(uiIntroDelayRef.current);
				uiIntroDelayRef.current = 0;
			}
			if (arcIntroFrameRef.current) {
				cancelAnimationFrame(arcIntroFrameRef.current);
				arcIntroFrameRef.current = 0;
			}
			if (arcIntroDelayRef.current) {
				window.clearTimeout(arcIntroDelayRef.current);
				arcIntroDelayRef.current = 0;
			}
			panelGlitchActiveRef.current = false;
			panelIntroTargetRef.current = null;
			caseStudyArcRuntime.introRotationDeg = 0;
			caseStudyArcRuntime.introOpacity = 1;
		};
	}, [hideArcNavigation, hideLeftPanel, skipPanelIntro]);

	useEffect(() => {
		let cancelled = false;

		ensureCaseStudyCanvasFonts().then(() => {
			if (cancelled) {
				return;
			}
			fontsReadyRef.current = true;
			setFontsReady(true);

			if (skipPanelIntro) {
				uiIntroPlayedRef.current = true;
				arcIntroPlayedRef.current = true;
				panelGlitchActiveRef.current = false;
				caseStudyArcRuntime.introRotationDeg = 0;
				caseStudyArcRuntime.introOpacity = 1;
				paintAllRef.current();
				wakeCaseStudyAnimationFrame();
				return;
			}

			panelGlitchActiveRef.current = false;
			if (!hideArcNavigation) {
				if (enterFromAnotherCaseRef.current) {
					caseStudyArcRuntime.introRotationDeg = 0;
					caseStudyArcRuntime.introOpacity = 1;
				} else {
					caseStudyArcRuntime.introRotationDeg = CASE_STUDY_ARC_INTRO_START_DEG;
					caseStudyArcRuntime.introOpacity = 0;
				}
			}
			paintAllRef.current();
			if (!hideArcNavigation && enterFromAnotherCaseRef.current) {
				paintArcRef.current();
			}

			const panelCanvas = panelCanvasRef.current;
			if (panelCanvas && !hideLeftPanel && !uiIntroPlayedRef.current) {
				panelIntroTargetRef.current = createCanvasSnapshot(panelCanvas);
				clearCanvasPixels(panelCanvas);
				panelGlitchActiveRef.current = true;
			}

			setUiIntroPrepared(true);
			wakeCaseStudyAnimationFrame();
		});

		return () => {
			cancelled = true;
		};
	}, [hideArcNavigation, hideLeftPanel, skipPanelIntro]);

	/** Left HTML panel: mosaic enter. WebGL left HUD has its own reveal. */
	useEffect(() => {
		if (
			skipPanelIntro
			|| hideLeftPanel
			|| routePhase !== "idle"
			|| !fontsReady
			|| !uiIntroPrepared
			|| uiIntroPlayedRef.current
			|| uiIntroDelayRef.current
		) {
			return undefined;
		}

		const delayMs = Math.max(0, project.config.caseStudy?.panelIntroDelayMs ?? 500);
		uiIntroDelayRef.current = window.setTimeout(() => {
			uiIntroDelayRef.current = 0;

			const panelCanvas = panelCanvasRef.current;
			const panelTarget = panelIntroTargetRef.current;
			if (!panelCanvas || !panelTarget) {
				uiIntroPlayedRef.current = true;
				panelGlitchActiveRef.current = false;
				panelIntroTargetRef.current = null;
				paintPanelRef.current();
				return;
			}

			cancelPanelGlitchRef.current?.();
			cancelPanelGlitchRef.current = playCaseStudyPanelMosaicEnter(
				panelCanvas,
				panelTarget,
				fullCanvasBounds(panelCanvas),
				getCanvasMosaicIntroConfig(),
				() => {
					uiIntroPlayedRef.current = true;
					panelGlitchActiveRef.current = false;
					cancelPanelGlitchRef.current = null;
					panelIntroTargetRef.current = null;
					paintPanelRef.current();
				},
			);
			wakeCaseStudyAnimationFrame();
		}, delayMs);

		return () => {
			window.clearTimeout(uiIntroDelayRef.current);
			uiIntroDelayRef.current = 0;
			cancelPanelGlitchRef.current?.();
			cancelPanelGlitchRef.current = null;
			if (!uiIntroPlayedRef.current) {
				panelGlitchActiveRef.current = true;
			}
		};
	}, [
		fontsReady,
		hideLeftPanel,
		project.config.caseStudy?.panelIntroDelayMs,
		routePhase,
		skipPanelIntro,
		uiIntroPrepared,
	]);

	/**
	 * Right arc enter:
	 * - from non-case (hub/about/…): orbit slide-in appear
	 * - case→case: titles snake appear at rest position
	 */
	useEffect(() => {
		if (
			skipPanelIntro
			|| hideArcNavigation
			|| routePhase !== "idle"
			|| !fontsReady
			|| arcIntroPlayedRef.current
			|| arcIntroDelayRef.current
		) {
			return undefined;
		}

		const fromAnotherCase = enterFromAnotherCaseRef.current;
		const delayMs = Math.max(0, project.config.caseStudy?.panelIntroDelayMs ?? 500);
		arcIntroDelayRef.current = window.setTimeout(() => {
			arcIntroDelayRef.current = 0;

			if (fromAnotherCase) {
				caseStudyArcRuntime.introRotationDeg = 0;
				caseStudyArcRuntime.introOpacity = 1;
				arcIntroPlayedRef.current = true;
				paintArcRef.current();
				wakeCaseStudyAnimationFrame();
				return;
			}

			const arcStartedAt = performance.now();
			const animateArcIntro = (now) => {
				const progress = Math.min(1, (now - arcStartedAt) / CASE_STUDY_ARC_INTRO_MS);
				const eased = 1 - (1 - progress) ** 3;
				caseStudyArcRuntime.introRotationDeg = CASE_STUDY_ARC_INTRO_START_DEG * (1 - eased);
				caseStudyArcRuntime.introOpacity = eased;
				paintArcRef.current();
				if (progress < 1) {
					arcIntroFrameRef.current = requestAnimationFrame(animateArcIntro);
				} else {
					arcIntroFrameRef.current = 0;
					arcIntroPlayedRef.current = true;
					caseStudyArcRuntime.introRotationDeg = 0;
					caseStudyArcRuntime.introOpacity = 1;
					paintArcRef.current();
				}
			};
			arcIntroFrameRef.current = requestAnimationFrame(animateArcIntro);
			wakeCaseStudyAnimationFrame();
		}, delayMs);

		return () => {
			window.clearTimeout(arcIntroDelayRef.current);
			arcIntroDelayRef.current = 0;
			if (arcIntroFrameRef.current) {
				cancelAnimationFrame(arcIntroFrameRef.current);
				arcIntroFrameRef.current = 0;
			}
			if (!arcIntroPlayedRef.current) {
				if (fromAnotherCase) {
					caseStudyArcRuntime.introRotationDeg = 0;
					caseStudyArcRuntime.introOpacity = 1;
				} else {
					caseStudyArcRuntime.introRotationDeg = CASE_STUDY_ARC_INTRO_START_DEG;
					caseStudyArcRuntime.introOpacity = 0;
				}
			}
		};
	}, [fontsReady, hideArcNavigation, project.config.caseStudy?.panelIntroDelayMs, routePhase, skipPanelIntro]);

	useEffect(() => {
		const canvas = panelCanvasRef.current;
		const previousStateId = lastAnimatedStateIdRef.current;
		const previousLocale = lastAnimatedLocaleRef.current;
		const previousStateIndex = lastAnimatedStateIndexRef.current;
		const stateChanged = previousStateId !== null && previousStateId !== activeStateId;
		const localeChanged = previousLocale !== null && previousLocale !== siteLocale;
		// Locale glitch only while this case is the current page; otherwise instant paint.
		const shouldAnimateLocale = localeChanged && store.openedCase === true;
		const shouldAnimateContentChange = shouldAnimateLocale || (stateChanged && panelNavigationClickRef.current);
		lastAnimatedStateIdRef.current = activeStateId;
		lastAnimatedStateIndexRef.current = activeStateIndex;
		lastAnimatedLocaleRef.current = siteLocale;
		panelNavigationClickRef.current = false;

		if (!shouldAnimateContentChange || !fontsReadyRef.current || !canvas || hideLeftPanel) {
			localeGlitchRunningRef.current = false;
			if (localeChanged) {
				displayedLocaleRef.current = siteLocale;
			}
			paintAllRef.current();
			wakeCaseStudyAnimationFrame();
			return undefined;
		}

		// Mid locale wipe: ignore (desiredLocaleRef already updated by store subscribe).
		if (localeChanged && localeGlitchRunningRef.current) {
			return undefined;
		}

		if (localeChanged) {
			localeGlitchRunningRef.current = true;
		}
		cancelPanelGlitchRef.current?.();
		const fromCanvas = createCanvasSnapshot(canvas);
		panelGlitchActiveRef.current = false;
		paintPanelRef.current();
		const toCanvas = createCanvasSnapshot(canvas);
		panelGlitchActiveRef.current = true;

		const finishGlitch = () => {
			panelGlitchActiveRef.current = false;
			cancelPanelGlitchRef.current = null;
			paintPanelRef.current();

			if (localeChanged) {
				// This wipe landed on siteLocale; chain only if the user clicked again.
				displayedLocaleRef.current = siteLocale;
				localeGlitchRunningRef.current = false;
				const desiredLocale = desiredLocaleRef.current;
				if (desiredLocale !== displayedLocaleRef.current) {
					setSiteLocale(desiredLocale);
				}
			}
		};

		{
			const direction = activeStateIndex >= (previousStateIndex ?? activeStateIndex)
				? "forward"
				: "backward";
			const mosaicConfig = {
				...resolveLeftPanelDrawConfig(canvas.clientWidth || window.innerWidth),
				...(project.config.caseStudy?.leftPanel ?? {}),
			};
			// Locale + stage click: same mosaic wipe (leave old / appear new).
			cancelPanelGlitchRef.current = playCaseStudyPanelMosaicTransition(
				canvas,
				fromCanvas,
				toCanvas,
				fullCanvasBounds(canvas),
				mosaicConfig,
				direction,
				finishGlitch,
			);
		}
		paintArcRef.current();
		wakeCaseStudyAnimationFrame();

		return () => {
			cancelPanelGlitchRef.current?.();
			cancelPanelGlitchRef.current = null;
			panelGlitchActiveRef.current = false;
		};
	}, [activeStateId, activeStateIndex, frameData, hideLeftPanel, panelConfigRevision, project.config.slug, siteLocale]);

	useEffect(
		() => () => {
			localeGlitchRunningRef.current = false;
			window.clearTimeout(uiIntroDelayRef.current);
			window.clearTimeout(arcIntroDelayRef.current);
			cancelPanelGlitchRef.current?.();
			if (arcIntroFrameRef.current) {
				cancelAnimationFrame(arcIntroFrameRef.current);
			}
		},
		[],
	);

	useLayoutEffect(() => {
		if (hideArcNavigation) {
			return undefined;
		}

		let lastLeaving = null;

		// Observe only — arc/HUD leave starts in publishSiteRouteTransition (SITE_TRANSITION.md).
		const syncLeaveArc = () => {
			const leaving = store.sceneCarouselClickTransitionActive === true || routePhase === "exiting";
			if (leaving === lastLeaving) {
				return;
			}
			const wasLeaving = lastLeaving;
			lastLeaving = leaving;
			panelHexTransitionActiveRef.current = leaving;

			if (leaving) {
				paintArcRef.current();
				wakeCaseStudyAnimationFrame();
				return;
			}

			// Interrupted / reversed hex while still on this case: restore.
			if (wasLeaving === true && !isCaseLeavingToNonCase()) {
				caseStudyArcRuntime.introRotationDeg = 0;
				caseStudyArcRuntime.introOpacity = 1;
				paintArcRef.current();
				wakeCaseStudyAnimationFrame();
			}
		};

		const stopClickActive = subscribeKey(store, "sceneCarouselClickTransitionActive", syncLeaveArc);
		syncLeaveArc();

		return () => {
			stopClickActive();
			panelHexTransitionActiveRef.current = false;
		};
	}, [hideArcNavigation, routePhase]);

	useEffect(() => {
		resetArcNavLabelColorMotion();
		resetCaseStudyArcShiftMotion();
	}, [project.config.slug]);

	useEffect(() => {
		const stop = subscribeCaseStudyLeftPanelConfig(() => {
			setPanelConfigRevision((revision) => revision + 1);
		});
		return stop;
	}, []);

	useEffect(() => {
		return subscribeKey(store, "siteLocale", (locale) => {
			const desiredLocale = normalizeSiteLocale(locale);
			desiredLocaleRef.current = desiredLocale;
			if (!localeGlitchRunningRef.current && desiredLocale !== displayedLocaleRef.current) {
				setSiteLocale(desiredLocale);
			}
		});
	}, []);

	useEffect(() => {
		const stop = subscribeLeftMenuContentAnchor(() => {
			if (!store.openedCase) {
				return;
			}
			paintAllRef.current();
		});
		return stop;
	}, []);

	useEffect(() => {
		const onResize = () => paintAllRef.current();
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, []);

	// Перерисовка после layout меню и смещения canvas-хоста.
	useEffect(() => {
		const host = hostRef.current;
		const menu = document.querySelector(LEFT_MENU_SELECTOR);
		if (typeof ResizeObserver === "undefined") {
			return undefined;
		}

		const observer = new ResizeObserver(() => paintAllRef.current());
		if (menu) {
			observer.observe(menu);
		}
		if (host) {
			observer.observe(host);
		}

		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		return subscribeKey(store, "graphicsTier", () => paintAllRef.current());
	}, []);

	useEffect(() => {
		const onPointerDown = (event) => {
			if (isInvestigating) {
				return;
			}

			const arcCanvas = arcCanvasRef.current;
			const panelCanvas = panelCanvasRef.current;
			const canvas = panelCanvas || arcCanvas;
			if (!canvas || !arcCanvas) {
				return;
			}

			const rect = canvas.getBoundingClientRect();

			if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
				return;
			}

			const localX = event.clientX - rect.left;
			const localY = event.clientY - rect.top;
			const projectNavHit = hideProjectNavigation
				? null
				: pickCaseStudyHitRegion(localX, localY, projectNavigationHitRegionsRef.current, 1);

			if (projectNavHit?.type === "projectNavigation") {
				event.preventDefault();
				event.stopPropagation();
				activateCaseProjectCanvasNavigation(projectNavHit, pathname);
				return;
			}

			const hit = hideArcNavigation ? null : pickCaseStudyHitRegion(localX, localY, hitRegionsRef.current, 1);

			if (hit?.type === "arcProject" && hit.targetPath) {
				event.preventDefault();
				event.stopPropagation();
				const projectId = hit.projectId ?? hit.stateId;
				// Move glow/labels immediately — do not wait for route commit.
				if (projectId && projectId !== project.config.id) {
					setCaseStudyArcPreviewProjectId(projectId);
					if (Number.isFinite(hit.angle)) {
						syncArcGlowTargetFromScroll(hit.angle);
					}
					markCaseStudyArcDirty();
					paintArcRef.current();
				}
				activateCaseProjectCanvasNavigation(
					{ type: "projectNavigation", id: projectId, targetPath: hit.targetPath },
					pathname,
				);
				return;
			}

			if (hit?.type === "state") {
				event.preventDefault();
				event.stopPropagation();
				panelNavigationClickRef.current = hit.stateId !== activeStateId;
				goToState(hit.stateId);
			}
		};

		window.addEventListener("pointerdown", onPointerDown, { capture: true });
		return () => window.removeEventListener("pointerdown", onPointerDown, { capture: true });
	}, [activeStateId, goToState, hideArcNavigation, hideProjectNavigation, isInvestigating, pathname, project.config.id]);

	useEffect(() => {
		const arcCanvas = arcCanvasRef.current;
		const panelCanvas = panelCanvasRef.current;
		const onMove = (event) => {
			const canvas = arcCanvas;
			if (!canvas || isInvestigating) {
				hoveredArcStateIdRef.current = null;
				clearCaseNavCursorAnchor();
				return;
			}

			const rect = canvas.getBoundingClientRect();
			const localX = event.clientX - rect.left;
			const localY = event.clientY - rect.top;
			const projectNavHit = hideProjectNavigation
				? null
				: pickCaseStudyHitRegion(localX, localY, projectNavigationHitRegionsRef.current, 1);
			const hit = hideArcNavigation ? null : pickCaseStudyHitRegion(localX, localY, hitRegionsRef.current, 1);
			const hasHover = Boolean(projectNavHit || hit);
			canvas.style.cursor = hasHover ? "pointer" : "";
			if (panelCanvas) {
				panelCanvas.style.cursor = hasHover ? "pointer" : "";
			}
			if (hit?.type === "arcProject" || hit?.type === "state") {
				setCaseNavCursorAnchor(hit, rect);
			} else if (projectNavHit?.type === "projectNavigation") {
				setCaseProjectNavCursor();
			} else {
				clearCaseNavCursorAnchor();
			}

			const hoveredStateId = hit?.type === "arcProject"
				? hit.stateId
				: null;
			if (hoveredStateId !== hoveredArcStateIdRef.current) {
				clearCaseStudyArcNavSnakeHover(hoveredArcStateIdRef.current);
				hoveredArcStateIdRef.current = hoveredStateId;
				paintArcRef.current();
				if (hoveredStateId) {
					playCaseStudyArcNavSnakeHover(hoveredStateId);
				}
			}

			const hoveredProjectNavId =
				!hideLeftPanel
				&& projectNavHit?.type === "projectNavigation"
				&& (projectNavHit.id === "previous" || projectNavHit.id === "next" || projectNavHit.id === "all")
					? projectNavHit.id
					: null;
			if (hoveredProjectNavId !== hoveredProjectNavIdRef.current) {
				clearCaseProjectNavSnakeHover(hoveredProjectNavIdRef.current);
				hoveredProjectNavIdRef.current = hoveredProjectNavId;
				if (!hideLeftPanel) {
					paintPanelRef.current();
				}
				if (hoveredProjectNavId) {
					playCaseProjectNavSnakeHover(hoveredProjectNavId);
				}
			}
		};

		window.addEventListener("pointermove", onMove);
		return () => {
			clearCaseStudyArcNavSnakeHover(hoveredArcStateIdRef.current);
			hoveredArcStateIdRef.current = null;
			clearCaseProjectNavSnakeHover(hoveredProjectNavIdRef.current);
			hoveredProjectNavIdRef.current = null;
			if (arcCanvas) {
				arcCanvas.style.cursor = "";
			}
			if (panelCanvas) {
				panelCanvas.style.cursor = "";
			}
			clearCaseNavCursorAnchor();
			window.removeEventListener("pointermove", onMove);
		};
	}, [hideArcNavigation, hideLeftPanel, hideProjectNavigation, isInvestigating]);

	return (
		<div ref={hostRef} className={styles.caseStudyCanvasHost} data-case-study-canvas-host>
			{!hideLeftPanel && (
				<>
					<canvas ref={panelCanvasRef} className={styles.caseStudyPanelCanvas} aria-hidden="true" />
					<CaseStudySelectableText frame={frameData} layerRef={selectableTextRef} />
				</>
			)}
			{!hideArcNavigation && (
				<canvas ref={arcCanvasRef} className={styles.caseStudyArcCanvas} aria-hidden="true" />
			)}
		</div>
	);
}

CaseStudyCanvasUI.propTypes = {
	hideLeftPanel: PropTypes.bool,
	hideArcNavigation: PropTypes.bool,
	hideProjectNavigation: PropTypes.bool,
	skipPanelIntro: PropTypes.bool,
};
