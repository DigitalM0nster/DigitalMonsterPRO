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
	jumpCaseExperienceToStateIndex,
	startCaseExperienceRuntime,
	stopCaseExperienceRuntime,
} from "@/portfolio/core/caseExperienceRuntime.js";
import {
	isCasePanelHudRevealBusy,
} from "@/portfolio/core/casePanelHudReveal.js";
import {
	cancelCaseStageClickMosaic,
	isCaseStageClickMosaicActive,
	requestCaseStageClickMosaic,
	syncCaseStageClickMosaicDisplayedIndex,
} from "@/portfolio/core/caseStageClickMosaic.js";
import { store } from "@/store.jsx";
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
	const stateApi = useProjectState(project, {
		initialStateIndex: 0,
		initialScrollProgress: 0,
		initialStageProgress: 0,
	});
	const stageApi = useStageProgress(
		project,
		stateApi.activeStateIndex,
		stateApi.commitStageStep,
		0,
	);
	const investigationApi = useInvestigationMode(project, stateApi.activeStateId);
	const lifecycle = useProjectLifecycle(project);
	const onScrollProgressRef = useRef(stateApi.onScrollProgress);
	onScrollProgressRef.current = stateApi.onScrollProgress;

	const mobileSwipeEnabled = Boolean(project.config.caseStudy?.mobileHorizontalSwipe);
	const renderTextInScene = Boolean(project.config.caseStudy?.renderTextInScene);
	const isMobileLayout = useCaseStudyMobileViewport(mobileSwipeEnabled);
	// Arc chrome lives in CaseStudyArcOverlay (site-level) — not remounted per case.

	// Desktop: About-shaped caseExperienceRuntime owns wheel (interior + case leave).
	// Mobile: keep DOM smooth scroll for horizontal-swipe shells.
	const snapAnchors = useMemo(() => buildCaseScrollSnapAnchors(project.states), [project.states]);
	const stopCaseScrollAtProgress = useSmoothCaseScroll(scrollRef, isMobileLayout, snapAnchors, {
		initialProgress: 0,
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
			const lastIndex = project.states.length - 1;
			if (!isMobileLayout) {
				jumpCaseExperienceToStateIndex(mosaicToIndex, project.states.length);
				stateGoToState(state.id);
				return;
			}
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
		store.openedCase = true;
		store.scroll = 0;
		store.caseScrollTarget = 0;
		store.portfolioExperience.activeStateIndex = 0;
		store.portfolioExperience.activeStateId = project.states[0]?.id ?? null;
		store.portfolioExperience.stageProgress = 0;
		store.portfolioExperience.stageProgressTarget = 0;

		if (!isMobileLayout) {
			startCaseExperienceRuntime({
				project,
				commitStageStep: stateApi.commitStageStep,
				allowCaseLeave: !hideProjectNavigation,
			});
		} else {
			stopCaseExperienceRuntime();
			stopCaseScrollAtProgress(0);
			const el = scrollRef.current;
			if (el) {
				el.scrollTop = 0;
			}
		}

		return () => {
			stopCaseExperienceRuntime();
			cancelCaseStageClickMosaic();
			store.scroll = 0;
			store.caseScrollTarget = 0;
		};
	}, [
		hideProjectNavigation,
		isMobileLayout,
		project,
		stateApi.commitStageStep,
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
				{isMobileLayout && (
					<div ref={scrollRef} className={styles.scrollContainer} aria-hidden="true">
						<div className={styles.scrollSpacer} />
					</div>
				)}

				<div className={styles.fullscreenStage}>
					{isMobileLayout ? <CaseStudyMobileShell /> : null}

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
