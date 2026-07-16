import { useEffect, useMemo } from "react";
import { store } from "@/store.jsx";
import { subscribeKey } from "valtio/utils";
import {
	registerCaseStudyStageProgress,
	stopCaseStudyAnimationFrame,
	wakeCaseStudyAnimationFrame,
} from "./caseStudyAnimationFrame.js";
import {
	computeStageProgressTarget,
	getStageProgress,
	getStageProgressTarget,
	registerStageCommitCallback,
	setStageProgressState,
	syncStageProgressTarget,
} from "./stageProgress.js";
import { resolveSubStage } from "./sceneBehavior.js";
import {
	preloadCaseStudyTextTransitionSound,
	resetCaseStudyTextTransitionSound,
	updateCaseStudyTextTransitionSound,
} from "@/sounds/caseStudyTextTransitionSound.js";
import { isCaseStageClickMosaicActive } from "@/portfolio/core/caseStageClickMosaic.js";

/**
 * Плавный stageProgress внутри активного state: target от store.scroll, progress догоняет в общем rAF.
 * Без React setState на каждом кадре — canvas читает getStageProgress() напрямую.
 *
 * @param {import('./types.js').PortfolioProjectModule} project
 * @param {number} activeStateIndex
 * @param {(direction: 'forward' | 'backward') => boolean} onStageCommit
 * @param {number} [initialStageProgress]
 */
export function useStageProgress(project, activeStateIndex, onStageCommit, initialStageProgress = 0) {
	useEffect(() => {
		void preloadCaseStudyTextTransitionSound();
		setStageProgressState(initialStageProgress);
		store.portfolioExperience.stageProgress = initialStageProgress;
		store.portfolioExperience.stageProgressTarget = initialStageProgress;
		resetCaseStudyTextTransitionSound();
		stopCaseStudyAnimationFrame();
	}, [initialStageProgress, project.config.slug]);

	useEffect(() => {
		registerStageCommitCallback(onStageCommit);
		return () => registerStageCommitCallback(null);
	}, [onStageCommit]);

	useEffect(() => {
		const committedProgress = getStageProgress();
		const committedTarget = getStageProgressTarget();
		store.portfolioExperience.stageProgress = committedProgress;
		store.portfolioExperience.stageProgressTarget = committedTarget;
		updateCaseStudyTextTransitionSound(0, committedProgress);
	}, [activeStateIndex]);

	useEffect(() => {
		const syncStageTargetFromScroll = () => {
			if (isCaseStageClickMosaicActive()) {
				return;
			}
			// Всегда React-индекс из deps — store может кратко отставать / сбрасываться в cleanup.
			const stateIndex = activeStateIndex;
			const usesBoundaryHandoff = Boolean(project.config.caseStudy?.carouselBoundaryHandoff);
			const scrollTarget = usesBoundaryHandoff ? store.caseScrollTarget : store.scroll;
			const target = computeStageProgressTarget(
				project.states,
				stateIndex,
				store.scroll,
				scrollTarget,
			);
			const lastScrollableStateIndex = Math.max(0, project.states.length - 2);
			const preserveBoundaryOvershoot = usesBoundaryHandoff && (
				(stateIndex === 0 && target < 0) ||
				(stateIndex === lastScrollableStateIndex && target > 1)
			);
			syncStageProgressTarget(target, { preserveBoundaryOvershoot });
			store.portfolioExperience.stageProgressTarget = getStageProgressTarget();
			wakeCaseStudyAnimationFrame();
		};

		syncStageTargetFromScroll();
		const unsubscribeScroll = subscribeKey(store, "scroll", syncStageTargetFromScroll);
		const unsubscribeTarget = subscribeKey(store, "caseScrollTarget", syncStageTargetFromScroll);
		return () => {
			unsubscribeScroll();
			unsubscribeTarget();
		};
	}, [
		project.states,
		activeStateIndex,
		project.config.slug,
		project.config.caseStudy?.carouselBoundaryHandoff,
	]);

	useEffect(() => {
		const onStageProgressTick = (delta) => {
			if (isCaseStageClickMosaicActive()) {
				return;
			}
			const progress = getStageProgress();
			store.portfolioExperience.stageProgress = progress;
			store.portfolioExperience.stageProgressTarget = getStageProgressTarget();
			updateCaseStudyTextTransitionSound(delta, progress);

			const stateIndex = store.portfolioExperience.activeStateIndex ?? activeStateIndex;
			const state = project.states[stateIndex];
			if (state?.subStages?.length) {
				const sub = resolveSubStage(state, progress);
				store.portfolioExperience.activeSubStageId = sub?.id ?? null;
			} else {
				store.portfolioExperience.activeSubStageId = null;
			}
		};

		registerCaseStudyStageProgress(onStageProgressTick);
		return () => registerCaseStudyStageProgress(null);
	}, [project.states, activeStateIndex]);

	useEffect(() => () => {
		registerCaseStudyStageProgress(null);
		registerStageCommitCallback(null);
		setStageProgressState(0);
		stopCaseStudyAnimationFrame();
		resetCaseStudyTextTransitionSound();
	}, []);

	return useMemo(
		() => ({
			get stageProgress() {
				return getStageProgress();
			},
			get stageProgressTarget() {
				return getStageProgressTarget();
			},
		}),
		[],
	);
}
