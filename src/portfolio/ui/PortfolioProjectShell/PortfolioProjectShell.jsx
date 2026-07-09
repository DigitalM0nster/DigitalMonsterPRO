import { useCallback, useEffect, useMemo, useRef } from "react";
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
import { store } from "@/store.jsx";
import CaseStudyCanvasUI from "../CaseStudyCanvas/CaseStudyCanvasUI.jsx";
import CaseStudyMobileShell from "../CaseStudyMobile/CaseStudyMobileShell.jsx";
import StateContentOverlay from "../StateContentOverlay/StateContentOverlay.jsx";
import HotspotLayer from "../HotspotLayer/HotspotLayer.jsx";
import styles from "./PortfolioProjectShell.module.scss";

/**
 * @param {{ slug: string }} props
 */
export default function PortfolioProjectShell({ slug }) {
	const project = getProjectBySlug(slug);
	if (!project) {
		return null;
	}
	return <PortfolioProjectShellInner project={project} />;
}

function PortfolioProjectShellInner({ project }) {
	const scrollRef = useRef(null);
	const stateApi = useProjectState(project);
	const stageApi = useStageProgress(project, stateApi.activeStateIndex, stateApi.commitStageStep);
	const investigationApi = useInvestigationMode(project, stateApi.activeStateId);
	const lifecycle = useProjectLifecycle(project);
	const onScrollProgressRef = useRef(stateApi.onScrollProgress);
	onScrollProgressRef.current = stateApi.onScrollProgress;

	const mobileSwipeEnabled = Boolean(project.config.caseStudy?.mobileHorizontalSwipe);
	const isMobileLayout = useCaseStudyMobileViewport(mobileSwipeEnabled);

	const snapAnchors = useMemo(() => buildCaseScrollSnapAnchors(project.states), [project.states]);

	const stopCaseScrollAtProgress = useSmoothCaseScroll(scrollRef, !isMobileLayout, snapAnchors);
	usePortfolioStoreBridge(project, stateApi, stageApi, investigationApi);
	const stateGoToState = stateApi.goToState;

	const goToState = useCallback((stateId) => {
		const index = project.states.findIndex((state) => state.id === stateId);
		if (index < 0) {
			return;
		}
		const anchor = project.states[index].scrollAnchor ?? index / Math.max(project.states.length - 1, 1);
		stopCaseScrollAtProgress(anchor);
		stateGoToState(stateId);
	}, [project.states, stateGoToState, stopCaseScrollAtProgress]);

	useEffect(() => {
		return subscribeKey(store, "scroll", (scroll) => {
			onScrollProgressRef.current(scroll);
		});
	}, []);

	useEffect(() => {
		// Каждый кейс стартует с первого этапа: сброс store + DOM-скролла.
		store.openedCase = true;
		store.scroll = 0;
		store.portfolioExperience.activeStateIndex = 0;
		store.portfolioExperience.activeStateId = project.states[0]?.id ?? null;
		store.portfolioExperience.stageProgress = 0;
		store.portfolioExperience.stageProgressTarget = 0;
		stopCaseScrollAtProgress(0);
		const el = scrollRef.current;
		if (el) {
			el.scrollTop = 0;
		}
		return () => {
			store.openedCase = false;
			store.scroll = 0;
		};
	}, [project.config.slug, project.states, stopCaseScrollAtProgress]);

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
					{isMobileLayout ? <CaseStudyMobileShell /> : <CaseStudyCanvasUI />}

					<HotspotLayer />
					<StateContentOverlay isInvestigating={investigationApi.isInvestigating} />
				</div>
			</div>
		</PortfolioProjectProvider>
	);
}
