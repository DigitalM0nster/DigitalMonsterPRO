import { useMemo } from "react";
import { useSnapshot } from "valtio";
import { getProjectByRoute } from "@/portfolio/core/projectRegistry.js";
import { PortfolioProjectProvider } from "@/portfolio/core/PortfolioProjectContext.jsx";
import { useCaseStudyMobileViewport } from "@/portfolio/core/useCaseStudyMobileViewport.js";
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
	const experience = useSnapshot(store.portfolioExperience);
	const renderTextInScene = Boolean(project?.config.caseStudy?.renderTextInScene);
	const isMobileLayout = useCaseStudyMobileViewport(renderTextInScene);

	const contextValue = useMemo(() => {
		if (!project) {
			return null;
		}
		const slugMatches = experience.slug === project.config.slug;
		const rawIndex = slugMatches ? Number(experience.activeStateIndex) || 0 : 0;
		const activeStateIndex = Math.max(0, Math.min(project.states.length - 1, rawIndex));
		const activeState = project.states[activeStateIndex];
		const activeStateId = (
			slugMatches && experience.activeStateId
		) || activeState?.id || "";
		return {
			activeStateId,
			activeStateIndex,
			activeState,
			scrollProgress: store.scroll,
			stageProgress: slugMatches ? experience.stageProgress : 0,
			stageProgressTarget: slugMatches ? experience.stageProgressTarget : 0,
			investigationHotspotId: slugMatches ? experience.investigationHotspotId : null,
			activeHotspot: null,
			isInvestigating: slugMatches ? Boolean(experience.isInvestigating) : false,
			visibleHotspots: [],
			goToState: () => {},
			enterInvestigation: () => {},
			leaveInvestigation: () => {},
		};
	}, [experience, project]);

	if (!project || !renderTextInScene || isMobileLayout || !contextValue) {
		return null;
	}

	return (
		<PortfolioProjectProvider project={project} value={contextValue}>
			<CaseStudyPanelHudPainter />
		</PortfolioProjectProvider>
	);
}
