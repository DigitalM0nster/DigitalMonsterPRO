/**
 * Site-level right-arc chrome (like LeftMenu / SiteTopHud).
 * Once case-space session starts, DomNav stays mounted across case→case.
 */
import { useMemo, useRef } from "react";
import { useSnapshot } from "valtio";
import { getAllPortfolioProjects, getProjectByRoute, getProjectBySlug } from "@/portfolio/core/projectRegistry.js";
import { PortfolioProjectProvider } from "@/portfolio/core/PortfolioProjectContext.jsx";
import { useCaseStudyMobileViewport } from "@/portfolio/core/useCaseStudyMobileViewport.js";
import { useRouteTransitionContext } from "@/context/RouteTransitionContext.jsx";
import { store } from "@/store.jsx";
import CaseStudyArcDomNav from "./CaseStudyArcDomNav.jsx";
import { isCaseArcSessionActive } from "./caseStudyArcSession.js";

function resolveStickyProject(routeProject, experienceSlug, stickyRef) {
	if (routeProject) {
		stickyRef.current = routeProject;
		return routeProject;
	}
	const bySlug = experienceSlug ? getProjectBySlug(experienceSlug) : null;
	if (bySlug) {
		stickyRef.current = bySlug;
		return bySlug;
	}
	if (stickyRef.current) {
		return stickyRef.current;
	}
	// Last resort while session is alive — any known case module.
	const fallback = getAllPortfolioProjects()[0] ?? null;
	if (fallback) {
		stickyRef.current = fallback;
	}
	return fallback;
}

export default function CaseStudyArcOverlay() {
	const { displayPathname } = useRouteTransitionContext();
	const routeProject = useMemo(() => getProjectByRoute(displayPathname), [displayPathname]);
	const experience = useSnapshot(store.portfolioExperience);
	const openedCase = useSnapshot(store).openedCase;
	const experienceSlug = experience.slug;
	const stickyProjectRef = useRef(null);

	const inCaseSpace = Boolean(
		routeProject || openedCase || isCaseArcSessionActive(),
	);

	const activeProject = inCaseSpace
		? resolveStickyProject(routeProject, experienceSlug, stickyProjectRef)
		: null;

	if (!inCaseSpace) {
		stickyProjectRef.current = null;
	}

	const isMobileLayout = useCaseStudyMobileViewport(true);

	const contextValue = useMemo(() => {
		if (!activeProject) {
			return null;
		}
		const slugMatches = experienceSlug === activeProject.config.slug;
		const rawIndex = slugMatches ? Number(experience.activeStateIndex) || 0 : 0;
		const activeStateIndex = slugMatches
			? Math.max(0, Math.min(activeProject.states.length - 1, rawIndex))
			: 0;
		const activeState = activeProject.states[activeStateIndex];
		return {
			activeStateId: (slugMatches && experience.activeStateId) || activeState?.id || "",
			activeStateIndex,
			activeState,
			scrollProgress: 0,
			stageProgress: 0,
			stageProgressTarget: 0,
			investigationHotspotId: null,
			activeHotspot: null,
			isInvestigating: false,
			visibleHotspots: [],
			goToState: () => {},
			enterInvestigation: () => {},
			leaveInvestigation: () => {},
		};
	}, [activeProject, experience.activeStateId, experience.activeStateIndex, experienceSlug]);

	if (!activeProject || !contextValue || isMobileLayout) {
		return null;
	}

	return (
		<PortfolioProjectProvider project={activeProject} value={contextValue}>
			<CaseStudyArcDomNav
				skipPanelIntro={false}
				panelIntroDelayMs={activeProject.config.caseStudy?.panelIntroDelayMs ?? 500}
			/>
		</PortfolioProjectProvider>
	);
}
