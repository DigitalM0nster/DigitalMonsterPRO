import { useEffect } from "react";
import { store } from "@/store.jsx";

/**
 * Синхронизирует React-контекст портфолио → valtio store для THREE (Case1Scene).
 *
 * @param {import('./types.js').PortfolioProjectModule} project
 * @param {ReturnType<import('./useProjectState.js').useProjectState>} stateApi
 * @param {ReturnType<import('./useProjectState.js').useInvestigationMode>} investigationApi
 */
export function usePortfolioStoreBridge(project, stateApi, _stageApi, investigationApi) {
	// Только смена кейса / unmount. Нельзя сбрасывать index в cleanup при смене этапа:
	// React сначала гоняет все cleanup'ы, и sync stageTarget успевает прочитать index=0 → target=1.5.
	useEffect(() => {
		store.portfolioExperience.slug = project.config.slug;
		return () => {
			store.portfolioExperience.slug = null;
			store.portfolioExperience.activeStateId = null;
			store.portfolioExperience.activeStateIndex = 0;
			store.portfolioExperience.activeSubStageId = null;
			store.portfolioExperience.isInvestigating = false;
			store.portfolioExperience.investigationHotspotId = null;
			store.portfolioExperience.stageProgress = 0;
			store.portfolioExperience.stageProgressTarget = 0;
			store.portfolioExperience.mobileSwipeProgress = 0;
		};
	}, [project.config.slug]);

	useEffect(() => {
		store.portfolioExperience.activeStateId = stateApi.activeStateId;
		store.portfolioExperience.activeStateIndex = stateApi.activeStateIndex;
	}, [stateApi.activeStateId, stateApi.activeStateIndex]);

	useEffect(() => {
		store.portfolioExperience.isInvestigating = investigationApi.isInvestigating;
		store.portfolioExperience.investigationHotspotId = investigationApi.investigationHotspotId;
	}, [investigationApi.isInvestigating, investigationApi.investigationHotspotId]);
}
