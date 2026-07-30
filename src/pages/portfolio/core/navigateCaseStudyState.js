/**
 * Shared stage jump for shell + WebGL HUD overlay (click mosaic + story runtime).
 */
import {
	cancelCaseStageClickMosaic,
	isCaseStageClickMosaicActive,
	requestCaseStageClickMosaic,
} from "@/pages/portfolio/core/caseStageClickMosaic.js";
import { jumpCaseExperienceToStateIndex } from "@/pages/portfolio/core/caseExperienceRuntime.js";
import { isCasePanelHudRevealBusy } from "@/pages/portfolio/core/casePanelHudReveal.js";
import { store } from "@/app/store.jsx";

/**
 * @param {{
 *   project: import('./types.js').PortfolioProjectModule,
 *   stateId: string,
 *   fromIndex?: number,
 *   useClickMosaic?: boolean,
 *   onApplied?: (stateIndex: number) => void,
 * }} args
 */
export function navigateCaseStudyToState({
	project,
	stateId,
	fromIndex = null,
	useClickMosaic = true,
	onApplied = null,
}) {
	const index = project.states.findIndex((state) => state.id === stateId);
	if (index < 0) {
		return;
	}

	const resolvedFrom = Number.isInteger(fromIndex)
		? fromIndex
		: (store.portfolioExperience.activeStateIndex ?? 0);

	const applyState = (mosaicToIndex) => {
		jumpCaseExperienceToStateIndex(mosaicToIndex, project.states.length);
		onApplied?.(mosaicToIndex);
	};

	if (
		useClickMosaic
		&& Number.isInteger(resolvedFrom)
		&& resolvedFrom !== index
		&& !isCasePanelHudRevealBusy()
	) {
		requestCaseStageClickMosaic({
			fromIndex: resolvedFrom,
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
}
