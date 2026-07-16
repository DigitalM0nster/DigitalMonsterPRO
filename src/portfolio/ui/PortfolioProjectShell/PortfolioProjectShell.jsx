import { useCallback, useEffect, useMemo, useRef } from "react";
import PropTypes from "prop-types";
import { subscribeKey } from "valtio/utils";
import { getProjectBySlug } from "@/portfolio/core/projectRegistry.js";
import { PortfolioProjectProvider } from "@/portfolio/core/PortfolioProjectContext.jsx";
import { useProjectState, useInvestigationMode } from "@/portfolio/core/useProjectState.js";
import { useStageProgress } from "@/portfolio/core/useStageProgress.js";
import { usePortfolioStoreBridge } from "@/portfolio/core/usePortfolioStoreBridge.js";
import { useProjectLifecycle } from "@/portfolio/core/useProjectLifecycle.js";
import { useCaseStudyMobileViewport } from "@/portfolio/core/useCaseStudyMobileViewport.js";
import { useSmoothCaseScroll } from "@/components/HTML/components/portfolio/useSmoothCaseScroll.js";
import { buildCaseScrollSnapAnchors } from "@/portfolio/core/caseScrollSnap.js";
import {
	addCarouselWheelDelta,
	CAROUSEL_WHEEL_PROGRESS_FACTOR,
} from "@/three/render/transition/carouselScroll.js";
import { getSceneCarousel } from "@/three/render/transition/carouselPage.js";
import { getStageProgressTarget } from "@/portfolio/core/stageProgress.js";
import {
	isCasePanelHudRevealBusy,
} from "@/portfolio/core/casePanelHudReveal.js";
import {
	cancelCaseStageClickMosaic,
	isCaseStageClickMosaicActive,
	requestCaseStageClickMosaic,
	syncCaseStageClickMosaicDisplayedIndex,
} from "@/portfolio/core/caseStageClickMosaic.js";
import { logAboutScrollTrace } from "@/three/dev/carouselProgressTargetLogger.js";
import { store } from "@/store.jsx";
import CaseStudyCanvasUI from "../CaseStudyCanvas/CaseStudyCanvasUI.jsx";
import CaseStudyMobileShell from "../CaseStudyMobile/CaseStudyMobileShell.jsx";
import StateContentOverlay from "../StateContentOverlay/StateContentOverlay.jsx";
import HotspotLayer from "../HotspotLayer/HotspotLayer.jsx";
import styles from "./PortfolioProjectShell.module.scss";

/**
 * @param {{
 *   slug?: string,
 *   project?: import('@/portfolio/core/types.js').PortfolioProjectModule,
 *   hideArcNavigation?: boolean,
 *   hideProjectNavigation?: boolean,
 *   skipPanelIntro?: boolean,
 * }} props
 */
export default function PortfolioProjectShell({
	slug,
	project: providedProject,
	hideArcNavigation = false,
	hideProjectNavigation = false,
	skipPanelIntro = false,
}) {
	const project = providedProject ?? getProjectBySlug(slug);
	if (!project) {
		return null;
	}
	return (
		<PortfolioProjectShellInner
			project={project}
			hideArcNavigation={hideArcNavigation}
			hideProjectNavigation={hideProjectNavigation}
			skipPanelIntro={skipPanelIntro}
		/>
	);
}

PortfolioProjectShell.propTypes = {
	slug: PropTypes.string,
	project: PropTypes.object,
	hideArcNavigation: PropTypes.bool,
	hideProjectNavigation: PropTypes.bool,
	skipPanelIntro: PropTypes.bool,
};

function PortfolioProjectShellInner({ project, hideArcNavigation, hideProjectNavigation, skipPanelIntro }) {
	const scrollRef = useRef(null);
	const carouselBoundaryHandoff = Boolean(project.config.caseStudy?.carouselBoundaryHandoff);
	const isClickingIntoAbout = store.sceneCarouselClickTargetId === "about"
		&& store.sceneCarouselClickPhase !== "idle";
	const enteredFromNextSceneRef = useRef(
		carouselBoundaryHandoff &&
			!isClickingIntoAbout &&
			(store.sceneCarouselCurrentId === "contacts" ||
				(store.sceneCarouselLastCommitFromId === "contacts" &&
					store.sceneCarouselLastCommitDirection === "backward")),
	);
	const enteredFromNextScene = enteredFromNextSceneRef.current;
	const boundaryOverflowRef = useRef(
		carouselBoundaryHandoff && !isClickingIntoAbout
			? Number(store.sceneCarouselLastCommitBoundaryOverflow ?? 0)
			: 0,
	);
	const boundaryOverflowProgress = Number.isFinite(boundaryOverflowRef.current)
		? boundaryOverflowRef.current
		: 0;
	const initialTargetDeltaPx = boundaryOverflowProgress / CAROUSEL_WHEEL_PROGRESS_FACTOR;
	const hasBoundaryContinuation = Math.abs(initialTargetDeltaPx) > 0.01;
	const initialStateIndex = enteredFromNextScene ? Math.max(0, project.states.length - 2) : 0;
	const initialScrollProgress = enteredFromNextScene ? 1 : 0;
	const initialStageProgress = enteredFromNextScene ? 1 : 0;
	const stateApi = useProjectState(project, {
		initialStateIndex,
		initialScrollProgress,
		initialStageProgress,
	});
	const stageApi = useStageProgress(
		project,
		stateApi.activeStateIndex,
		stateApi.commitStageStep,
		initialStageProgress,
	);
	const investigationApi = useInvestigationMode(project, stateApi.activeStateId);
	const lifecycle = useProjectLifecycle(project);
	const onScrollProgressRef = useRef(stateApi.onScrollProgress);
	onScrollProgressRef.current = stateApi.onScrollProgress;

	const mobileSwipeEnabled = Boolean(project.config.caseStudy?.mobileHorizontalSwipe);
	const renderTextInScene = Boolean(project.config.caseStudy?.renderTextInScene);
	const isMobileLayout = useCaseStudyMobileViewport(mobileSwipeEnabled);

	const snapAnchors = useMemo(() => buildCaseScrollSnapAnchors(project.states), [project.states]);
	const isBoundaryStageReady = useCallback((direction) => {
		const stateIndex = store.portfolioExperience.activeStateIndex ?? 0;
		const stageTargetPosition = stateIndex + getStageProgressTarget();
		const lastStagePosition = Math.max(0, project.states.length - 1);
		const epsilon = 0.002;

		if (direction === "forward") {
			return stageTargetPosition >= lastStagePosition - epsilon;
		}

		return stageTargetPosition <= epsilon;
	}, [project.states.length]);
	const isBoundaryHandoffActive = useCallback(() => {
		if (!carouselBoundaryHandoff) {
			return false;
		}

		const carousel = getSceneCarousel();
		const interactionLocked = carousel.isInteractionLocked();
		const hasDirectedHandoff = carousel.scrollIntent !== null;
		return carousel.currentId === project.config.id
			&& (interactionLocked || hasDirectedHandoff);
	}, [carouselBoundaryHandoff, project.config.id]);
	const traceAboutScroll = useCallback((trace) => {
		if (!import.meta.env.DEV || !carouselBoundaryHandoff) {
			return;
		}
		store.aboutScrollDebug.lastEvent = trace?.type ?? null;
		if (trace?.internal) {
			store.aboutScrollDebug.dom = trace.internal.dom ?? 0;
			store.aboutScrollDebug.current = trace.internal.current ?? 0;
			store.aboutScrollDebug.target = trace.internal.target ?? 0;
			store.aboutScrollDebug.boundedTarget = trace.internal.boundedTarget ?? 0;
			store.aboutScrollDebug.overflow = trace.internal.overflow ?? 0;
			store.aboutScrollDebug.maxPx = trace.internal.maxPx ?? 0;
			store.aboutScrollDebug.scrollIntent = trace.internal.scrollIntent ?? null;
		}
		logAboutScrollTrace(getSceneCarousel(), trace);
	}, [carouselBoundaryHandoff]);
	const onBoundaryScroll = useCallback(
		({ delta, direction, handoffActive }) => {
			traceAboutScroll({ type: "boundary-callback", delta, direction, handoffActive });
			if (!carouselBoundaryHandoff) {
				traceAboutScroll({ type: "boundary-rejected", reason: "handoff-disabled", direction });
				return false;
			}
			if (handoffActive) {
				const carousel = getSceneCarousel();
				// A passive 1 -> 0 settle after entering About is not an active handoff.
				// A null intent here therefore means a locked click transition only.
				if (carousel.scrollIntent === null) {
					traceAboutScroll({
						type: "boundary-consumed",
						reason: "carousel-settling-without-intent",
						direction,
					});
					return true;
				}

				const boundarySide = Math.sign(
					Math.abs(carousel.progressTarget) > 0.0001
						? carousel.progressTarget
						: carousel.progress,
				);
				const deltaSide = Math.sign(delta);
				if (boundarySide !== 0 && deltaSide !== 0 && boundarySide !== deltaSide) {
					// A reversal cancels only the global handoff. It must not cross the
					// resting point and skip the internal About stages in the other direction.
					carousel.setProgressTarget(0);
					traceAboutScroll({
						type: "boundary-consumed",
						reason: "direction-reversal",
						direction,
						boundarySide,
						deltaSide,
					});
					return true;
				}
			}
			if (!handoffActive && !isBoundaryStageReady(direction)) {
				traceAboutScroll({ type: "boundary-rejected", reason: "stage-not-ready", direction });
				return false;
			}

			traceAboutScroll({ type: "carousel-delta", delta, direction, handoffActive });
			return addCarouselWheelDelta(delta);
		},
		[carouselBoundaryHandoff, isBoundaryStageReady, traceAboutScroll],
	);

	const stopCaseScrollAtProgress = useSmoothCaseScroll(scrollRef, !isMobileLayout, snapAnchors, {
		initialProgress: initialScrollProgress,
		initialTargetDeltaPx,
		onBoundaryScroll,
		isBoundaryHandoffActive,
		allowBoundaryOvershoot: carouselBoundaryHandoff,
		suppressWheelAfterStop: !carouselBoundaryHandoff,
		onTrace: import.meta.env.DEV && carouselBoundaryHandoff ? traceAboutScroll : null,
	});
	usePortfolioStoreBridge(project, stateApi, stageApi, investigationApi);
	const stateGoToState = stateApi.goToState;

	const goToState = useCallback((stateId) => {
		const index = project.states.findIndex((state) => state.id === stateId);
		if (index < 0) {
			return;
		}
		const fromIndex = store.portfolioExperience.activeStateIndex ?? stateApi.activeStateIndex;
		const applyState = (mosaicToIndex) => {
			const state = project.states[mosaicToIndex];
			if (!state) {
				return;
			}
			// Last arc id remaps inside goToState → penultimate @ progress=1.
			const lastIndex = project.states.length - 1;
			if (lastIndex > 0 && mosaicToIndex === lastIndex) {
				stopCaseScrollAtProgress(project.states[lastIndex].scrollAnchor ?? 1);
				stateGoToState(state.id);
				return;
			}
			const anchor = state.scrollAnchor ?? mosaicToIndex / Math.max(project.states.length - 1, 1);
			stopCaseScrollAtProgress(anchor);
			stateGoToState(state.id);
		};

		if (
			renderTextInScene
			&& !isMobileLayout
			&& Number.isInteger(fromIndex)
			&& !isCasePanelHudRevealBusy()
		) {
			requestCaseStageClickMosaic({
				fromIndex,
				toIndex: index,
				statesCount: project.states.length,
				applyState,
			});
			return;
		}

		if (isCaseStageClickMosaicActive()) {
			cancelCaseStageClickMosaic();
		}
		applyState(index);
	}, [
		isMobileLayout,
		project.states,
		renderTextInScene,
		stateApi.activeStateIndex,
		stateGoToState,
		stopCaseScrollAtProgress,
	]);

	useEffect(() => {
		if (!isCaseStageClickMosaicActive()) {
			syncCaseStageClickMosaicDisplayedIndex(stateApi.activeStateIndex, project.states.length);
		}
	}, [project.states.length, stateApi.activeStateIndex]);

	useEffect(() => {
		return subscribeKey(store, "portfolioStateNavigationRequest", (request) => {
			if (!request || request.slug !== project.config.slug) {
				return;
			}

			const stateIndex = Number(request.stateIndex);
			const state = Number.isInteger(stateIndex) ? project.states[stateIndex] : null;
			if (state) {
				goToState(state.id);
			}
			store.portfolioStateNavigationRequest = null;
		});
	}, [goToState, project.config.slug, project.states]);

	useEffect(() => {
		return subscribeKey(store, "scroll", (scroll) => {
			onScrollProgressRef.current(scroll);
		});
	}, []);

	useEffect(() => {
		// Каждый кейс стартует с первого этапа: сброс store + DOM-скролла.
		store.openedCase = true;
		store.scroll = initialScrollProgress;
		if (!hasBoundaryContinuation) {
			store.caseScrollTarget = initialScrollProgress;
		}
		store.portfolioExperience.activeStateIndex = initialStateIndex;
		store.portfolioExperience.activeStateId = project.states[initialStateIndex]?.id ?? null;
		store.portfolioExperience.stageProgress = initialStageProgress;
		if (!hasBoundaryContinuation) {
			store.portfolioExperience.stageProgressTarget = initialStageProgress;
		}
		if (carouselBoundaryHandoff) {
			store.sceneCarouselLastCommitFromId = null;
			store.sceneCarouselLastCommitDirection = null;
			store.sceneCarouselLastCommitBoundaryOverflow = 0;
		}
		if (!hasBoundaryContinuation) {
			// Direct/click entry has no progress to transfer from the outer scene.
			stopCaseScrollAtProgress(initialScrollProgress);
		}
		const el = scrollRef.current;
		if (el) {
			el.scrollTop = initialScrollProgress * Math.max(0, el.scrollHeight - el.clientHeight);
		}
		return () => {
			cancelCaseStageClickMosaic();
			store.scroll = 0;
			store.caseScrollTarget = 0;
			// Case HUD lifetime is owned by CaseStudyPanelHudOverlay (site chrome).
			// Do not release here — shell remounts on case→case while overlay stays mounted.
		};
	}, [
		carouselBoundaryHandoff,
		hasBoundaryContinuation,
		initialScrollProgress,
		initialStageProgress,
		initialStateIndex,
		project.config.slug,
		project.states,
		stopCaseScrollAtProgress,
	]);

	const contextValue = useMemo(
		() => ({
			activeStateId: stateApi.activeStateId,
			activeStateIndex: stateApi.activeStateIndex,
			activeState: stateApi.activeState,
			scrollProgress: stateApi.scrollProgress,
			stageProgress: stageApi.stageProgress,
			stageProgressTarget: stageApi.stageProgressTarget,
			investigationHotspotId: investigationApi.investigationHotspotId,
			activeHotspot: investigationApi.activeHotspot,
			isInvestigating: investigationApi.isInvestigating,
			visibleHotspots: investigationApi.visibleHotspots,
			goToState,
			enterInvestigation: investigationApi.enterInvestigation,
			leaveInvestigation: investigationApi.leaveInvestigation,
		}),
		[stateApi, stageApi, investigationApi, goToState],
	);

	return (
		<PortfolioProjectProvider project={project} value={contextValue}>
			<div className={[styles.portfolioProjectShell, lifecycle.shellClassName].join(" ")}>
				{!isMobileLayout && (
					<div ref={scrollRef} className={styles.scrollContainer} aria-hidden="true">
						<div className={styles.scrollSpacer} />
					</div>
				)}

				<div className={styles.fullscreenStage}>
					{isMobileLayout ? (
						<CaseStudyMobileShell />
					) : (
						<>
							{/* Left panel HUD is a site overlay (CaseStudyPanelHudOverlay) — not remounted per case. */}
							{/* Left panel is WebGL; keep hideProjectNavigation false so the arc still reserves nav height.
							    Left HTML intro is skipped via hideLeftPanel; arc keeps snake enter. */}
							<CaseStudyCanvasUI
								hideLeftPanel={renderTextInScene}
								hideArcNavigation={hideArcNavigation}
								hideProjectNavigation={hideProjectNavigation}
								skipPanelIntro={skipPanelIntro}
							/>
						</>
					)}

					<HotspotLayer />
					<StateContentOverlay isInvestigating={investigationApi.isInvestigating} />
				</div>
			</div>
		</PortfolioProjectProvider>
	);
}

PortfolioProjectShellInner.propTypes = {
	project: PropTypes.object.isRequired,
	hideArcNavigation: PropTypes.bool.isRequired,
	hideProjectNavigation: PropTypes.bool.isRequired,
	skipPanelIntro: PropTypes.bool.isRequired,
};
