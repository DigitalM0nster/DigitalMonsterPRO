import { store } from "@/app/store.jsx";
import { setStageProgressState } from "@/pages/portfolio/core/stageProgress.js";
import {
	requestCaseStudyScrollRepaint,
	requestSiteArcScrollRepaint,
} from "@/pages/portfolio/core/caseStudyAnimationFrame.js";
import { CAPABILITIES, getCapabilityBySceneId } from "./data/capabilities.js";

/**
 * Publish route-owned capability identity and arc progress.
 * Scene motion is owned by SceneCarousel; this bridge only changes at route commits.
 */
export function syncCapabilityRouteState(sceneId) {
	const capability = getCapabilityBySceneId(sceneId);
	if (!capability) {
		store.capabilitiesExperience.active = false;
		store.capabilitiesExperience.investigating = false;
		store.capabilitiesExperience.activeHotspotId = null;
		return false;
	}

	const stageIndex = Math.max(0, CAPABILITIES.findIndex((item) => item.sceneId === sceneId));
	const denominator = Math.max(1, CAPABILITIES.length - 1);
	const sectionProgress = stageIndex / denominator;

	store.capabilitiesExperience.active = true;
	store.capabilitiesExperience.activeStageIndex = stageIndex;
	store.capabilitiesExperience.activeStageId = capability.id;
	store.capabilitiesExperience.storyProgress = stageIndex;
	store.capabilitiesExperience.storyProgressTarget = stageIndex;
	store.capabilitiesExperience.progress = sectionProgress;
	store.capabilitiesExperience.progressTarget = sectionProgress;
	store.capabilitiesExperience.stagePosition = stageIndex;
	if (capability.id !== "mmk1") {
		store.capabilitiesExperience.investigating = false;
		store.capabilitiesExperience.activeHotspotId = null;
	}

	store.portfolioExperience.slug = null;
	store.portfolioExperience.activeStateIndex = 0;
	store.portfolioExperience.activeStateId = null;
	store.portfolioExperience.storyProgress = 0;
	store.portfolioExperience.storyProgressTarget = 0;
	store.portfolioExperience.stageProgress = 0;
	store.portfolioExperience.stageProgressTarget = 0;
	store.scroll = sectionProgress;
	store.caseScrollTarget = sectionProgress;
	setStageProgressState(0);
	requestCaseStudyScrollRepaint();
	requestSiteArcScrollRepaint();
	return true;
}
