import { useCallback, useMemo } from "react";
import { useSnapshot } from "valtio";
import { getProjectByRoute } from "@/portfolio/core/projectRegistry.js";
import { PortfolioProjectProvider } from "@/portfolio/core/PortfolioProjectContext.jsx";
import { useCaseStudyMobileViewport } from "@/portfolio/core/useCaseStudyMobileViewport.js";
import { navigateCaseStudyToState } from "@/portfolio/core/navigateCaseStudyState.js";
import { useRouteTransitionContext } from "@/context/RouteTransitionContext.jsx";
import { store } from "@/store.jsx";
import CaseStudyPanelHudPainter from "./CaseStudyPanelHudPainter.jsx";

/**
 * Site-level case HUD host (like LeftMenu / SiteTopHud).
 * One React tree across all case routes — chrome/snake survive case→case without remount.
 * Visible while displayPathname is a desktop case with renderTextInScene.
 */
export default function CaseStudyPanelHudOverlay() {
	const { displayPathname } = useRouteTransitionContext();
	const project = useMemo(() => getProjectByRoute(displayPathname), [displayPathname]);
	// Subscribe only to content identity — never stageProgress/scroll.
	// Those update every spring tick; WebGL HUD reads them via getStageProgress().
	// Tracking them here re-rendered the whole left painter at scroll FPS (CPU spike).
	const experience = useSnapshot(store.portfolioExperience);
	const experienceSlug = experience.slug;
	const experienceStateIndex = experience.activeStateIndex;
	const experienceStateId = experience.activeStateId;
	const experienceInvestigating = experience.isInvestigating;
	const experienceHotspotId = experience.investigationHotspotId;
	const renderTextInScene = Boolean(project?.config.caseStudy?.renderTextInScene);
	const isMobileLayout = useCaseStudyMobileViewport(renderTextInScene);

	const goToState = useCallback((stateId) => {
		if (!project) {
			return;
		}
		navigateCaseStudyToState({
			project,
			stateId,
			fromIndex: store.portfolioExperience.activeStateIndex ?? 0,
			useClickMosaic: true,
		});
	}, [project]);

	const contextValue = useMemo(() => {
		if (!project) {
			return null;
		}
		const slugMatches = experienceSlug === project.config.slug;
		const rawIndex = slugMatches ? Number(experienceStateIndex) || 0 : 0;
		// New case / slug mismatch: always stage 1 until experience catches up.
		const activeStateIndex = slugMatches
			? Math.max(0, Math.min(project.states.length - 1, rawIndex))
			: 0;
		const activeState = project.states[activeStateIndex];
		const activeStateId = (
			slugMatches && experienceStateId
		) || activeState?.id || "";
		return {
			activeStateId,
			activeStateIndex,
			activeState,
			// Scroll/stage mix is GPU-only — do not mirror per-frame values into React.
			scrollProgress: 0,
			stageProgress: 0,
			stageProgressTarget: 0,
			investigationHotspotId: slugMatches ? experienceHotspotId : null,
			activeHotspot: null,
			isInvestigating: slugMatches ? Boolean(experienceInvestigating) : false,
			visibleHotspots: [],
			goToState,
			enterInvestigation: () => {},
			leaveInvestigation: () => {},
		};
	}, [
		experienceHotspotId,
		experienceInvestigating,
		experienceSlug,
		experienceStateId,
		experienceStateIndex,
		goToState,
		project,
	]);

	if (!project || !renderTextInScene || isMobileLayout || !contextValue) {
		return null;
	}

	return (
		<PortfolioProjectProvider project={project} value={contextValue}>
			<CaseStudyPanelHudPainter />
		</PortfolioProjectProvider>
	);
}
