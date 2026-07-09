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
	resetStageProgress,
	registerStageCommitCallback,
	syncStageProgressTarget,
} from "./stageProgress.js";
import { resolveSubStage } from "./sceneBehavior.js";
import {
	preloadCaseStudyTextTransitionSound,
	resetCaseStudyTextTransitionSound,
	updateCaseStudyTextTransitionSound,
} from "@/sounds/caseStudyTextTransitionSound.js";

/**
 * Плавный stageProgress внутри активного state: target от store.scroll, progress догоняет в общем rAF.
 * Без React setState на каждом кадре — canvas читает getStageProgress() напрямую.
 *
 * @param {import('./types.js').PortfolioProjectModule} project
 * @param {number} activeStateIndex
 * @param {(direction: 'forward' | 'backward') => boolean} onStageCommit
 */
export function useStageProgress(project, activeStateIndex, onStageCommit) {
	useEffect(() => {
		void preloadCaseStudyTextTransitionSound();
		resetStageProgress();
		store.portfolioExperience.stageProgress = 0;
		store.portfolioExperience.stageProgressTarget = 0;
		resetCaseStudyTextTransitionSound();
		stopCaseStudyAnimationFrame();
	}, [project.config.slug]);

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
			// Всегда React-индекс из deps — store может кратко отставать / сбрасываться в cleanup.
			const stateIndex = activeStateIndex;
			const target = computeStageProgressTarget(project.states, stateIndex, store.scroll);
			syncStageProgressTarget(target);
			store.portfolioExperience.stageProgressTarget = getStageProgressTarget();
			wakeCaseStudyAnimationFrame();
		};

		syncStageTargetFromScroll();
		return subscribeKey(store, "scroll", syncStageTargetFromScroll);
	}, [project.states, activeStateIndex, project.config.slug]);

	useEffect(() => {
		const onStageProgressTick = (delta) => {
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

	useEffect(() => () => resetCaseStudyTextTransitionSound(), []);

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
