/**
 * Site-level right-arc chrome (like LeftMenu / SiteTopHud).
 * Once case-space session starts, DomNav stays mounted across case→case.
 */
import { useCallback, useMemo, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useSnapshot } from "valtio";
import { getAllPortfolioProjects, getProjectByRoute, getProjectBySlug } from "@/pages/portfolio/core/projectRegistry.js";
import { useCaseStudyMobileViewport } from "@/pages/portfolio/core/useCaseStudyMobileViewport.js";
import { activateCaseProjectCanvasNavigation } from "@/pages/portfolio/ui/CaseStudyCanvas/caseProjectCanvasNavigation.js";
import { useRouteTransitionContext } from "@/app/context/RouteTransitionContext.jsx";
import { store } from "@/app/store.jsx";
import SiteArcDomNav from "./SiteArcDomNav.jsx";
import { isSiteArcSessionActive } from "./siteArcSession.js";
import { useSiteArcLifecycle } from "./useSiteArcLifecycle.js";

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

export default function SiteArcOverlay() {
	const location = useLocation();
	const { displayPathname } = useRouteTransitionContext();
	const routeProject = useMemo(() => getProjectByRoute(displayPathname), [displayPathname]);
	const experience = useSnapshot(store.portfolioExperience);
	const openedCase = useSnapshot(store).openedCase;
	const experienceSlug = experience.slug;
	const stickyProjectRef = useRef(null);

	const inCaseSpace = Boolean(routeProject || openedCase || isSiteArcSessionActive());

	const activeProject = inCaseSpace ? resolveStickyProject(routeProject, experienceSlug, stickyProjectRef) : null;

	if (!inCaseSpace) {
		stickyProjectRef.current = null;
	}

	const isMobileLayout = useCaseStudyMobileViewport(true);

	const arcEnabled = Boolean(activeProject && !isMobileLayout);
	useSiteArcLifecycle({
		enabled: arcEnabled,
		panelIntroDelayMs: activeProject?.config.caseStudy?.panelIntroDelayMs ?? 500,
	});

	const activateProject = useCallback((item) => {
		activateCaseProjectCanvasNavigation({
			type: "projectNavigation",
			targetPath: item?.route,
		}, location.pathname);
	}, [location.pathname]);

	if (!arcEnabled) {
		return null;
	}

	return (
		<SiteArcDomNav
			activeItemId={activeProject.config.id}
			onActivateItem={activateProject}
		/>
	);
}
