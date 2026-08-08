import { useCallback, useMemo } from "react";
import { useSnapshot } from "valtio";
import { getProjectByRoute, getProjectBySlug } from "@/pages/portfolio/core/projectRegistry.js";
import { PortfolioProjectProvider } from "@/pages/portfolio/core/PortfolioProjectContext.jsx";
import { useCaseStudyMobileViewport } from "@/pages/portfolio/core/useCaseStudyMobileViewport.js";
import { navigateCaseStudyToState } from "@/pages/portfolio/core/navigateCaseStudyState.js";
import { useRouteTransitionContext } from "@/app/context/RouteTransitionContext.jsx";
import { store } from "@/app/store.jsx";
import { resolveSceneId } from "@/three/scenes/resolveSceneId.js";
import { CAPABILITIES } from "@/pages/capabilities/data/capabilities.js";
import lightTrailsHudProject from "@/pages/capabilities/lightTrails/lightTrailsHudProject.js";
import CaseStudyPanelHudPainter from "./CaseStudyPanelHudPainter.jsx";

/**
 * Site-level case HUD host (like LeftMenu / SiteTopHud).
 * One React tree across all case routes — chrome/snake survive case→case without remount.
 * Visible only when the resolved Three scene owns a legacy panelHud. Hub-plate
 * case routes render their HUD on the plate and intentionally skip this host.
 */
export default function CaseStudyPanelHudOverlay() {
	const { displayPathname } = useRouteTransitionContext();
	const sceneId = useMemo(() => resolveSceneId(displayPathname), [displayPathname]);
	const capabilityExperience = useSnapshot(store.capabilitiesExperience);
	const capabilityStageId = capabilityExperience.activeStageId;
	const project = useMemo(() => (
		sceneId === "capabilities"
			? capabilityStageId === "light-trails"
				? lightTrailsHudProject
				: getProjectBySlug("mmk1")
			: getProjectByRoute(displayPathname)
	), [capabilityStageId, displayPathname, sceneId]);
	// Subscribe only to content identity — never stageProgress/scroll.
	// Those update every spring tick; WebGL HUD reads them via getStageProgress().
	// Tracking them here re-rendered the whole left painter at scroll FPS (CPU spike).
	const experience = useSnapshot(store.portfolioExperience);
	const openedCase = useSnapshot(store).openedCase;
	const experienceSlug = experience.slug;
	const experienceStateIndex = experience.activeStateIndex;
	const experienceStateId = experience.activeStateId;
	const experienceInvestigating = experience.isInvestigating;
	const experienceHotspotId = experience.investigationHotspotId;
	const renderTextInScene = Boolean(project?.config.caseStudy?.renderTextInScene);
	const isMobileLayout = useCaseStudyMobileViewport(renderTextInScene);

	const goToState = useCallback(
		(stateId) => {
			if (!project) {
				return;
			}
			navigateCaseStudyToState({
				project,
				stateId,
				fromIndex: store.portfolioExperience.activeStateIndex ?? 0,
				useClickMosaic: true,
			});
		},
		[project],
	);

	const contextValue = useMemo(() => {
		if (!project) {
			return null;
		}
		const slugMatches = experienceSlug === project.config.slug;
		const rawIndex = slugMatches ? Number(experienceStateIndex) || 0 : 0;
		// New case / slug mismatch: always stage 1 until experience catches up.
		const activeStateIndex = slugMatches ? Math.max(0, Math.min(project.states.length - 1, rawIndex)) : 0;
		const activeState = project.states[activeStateIndex];
		const activeStateId = (slugMatches && experienceStateId) || activeState?.id || "";
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
	}, [experienceHotspotId, experienceInvestigating, experienceSlug, experienceStateId, experienceStateIndex, goToState, project]);

	// Current case routes are rendered by PortfolioHubScene: their panel, gallery
	// and locale snake live directly on HubPlateInnerPanels. Mounting the legacy
	// fullscreen HUD here would still repaint/upload its large canvases during a
	// locale switch even though PortfolioHubScene has no panelHud to display them.
	const isCapabilityHud = sceneId === "capabilities";
	const sceneOwnsLegacyPanelHud = sceneId.startsWith("case") || isCapabilityHud;
	if (
		!sceneOwnsLegacyPanelHud ||
		(!openedCase && !isCapabilityHud) ||
		!project ||
		!renderTextInScene ||
		isMobileLayout ||
		!contextValue
	) {
		return null;
	}

	return (
		<PortfolioProjectProvider project={project} value={contextValue}>
			<CaseStudyPanelHudPainter
				hideProjectNavigation={isCapabilityHud}
				keepStageRailVisible={isCapabilityHud}
				// MMK-1 keeps its established idle HUD. The second capability
				// changes the prepared content only after the internal hex settles,
				// then reveals it with the existing GPU mosaic enter.
				skipPanelIntro={isCapabilityHud && capabilityStageId !== "light-trails"}
				stageRailStates={isCapabilityHud ? CAPABILITIES : null}
				stageRailInteractive={!isCapabilityHud}
			/>
		</PortfolioProjectProvider>
	);
}
