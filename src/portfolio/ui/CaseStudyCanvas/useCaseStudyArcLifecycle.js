/**
 * Arc enter/leave for site-level CaseStudyArcOverlay.
 * Session state is module-level — React remount cannot re-trigger intro.
 */
import { useLayoutEffect, useRef } from "react";
import { subscribeKey } from "valtio/utils";
import { store } from "@/store.jsx";
import { useRouteTransitionContext } from "@/context/RouteTransitionContext.jsx";
import { isCaseEnterFromAnotherCase, isCaseLeavingToNonCase } from "@/utils/hexNavigation.js";
import {
	CASE_STUDY_ARC_INTRO_MS,
	CASE_STUDY_ARC_INTRO_START_DEG,
	caseStudyArcRuntime,
} from "./caseStudyArcConfig.js";
import {
	beginCaseArcSession,
	hasCaseArcIntroPlayed,
	isCaseArcOrbitExiting,
	keepCaseArcSessionAlive,
	markCaseArcIntroPlayed,
} from "./caseStudyArcSession.js";
import {
	flushCaseStudyArcPaint,
	wakeCaseStudyAnimationFrame,
	markCaseStudyArcDirty,
} from "@/portfolio/core/caseStudyAnimationFrame.js";

/**
 * @param {{
 *   enabled?: boolean,
 *   skipPanelIntro?: boolean,
 *   panelIntroDelayMs?: number,
 * }} opts
 */
export function useCaseStudyArcLifecycle({
	enabled = true,
	skipPanelIntro = false,
	panelIntroDelayMs = 500,
} = {}) {
	const { phase: routePhase } = useRouteTransitionContext();
	const arcIntroFrameRef = useRef(0);
	const arcIntroDelayRef = useRef(0);

	useLayoutEffect(() => {
		if (!enabled) {
			return undefined;
		}

		if (skipPanelIntro || hasCaseArcIntroPlayed()) {
			keepCaseArcSessionAlive({ forceVisible: true });
			markCaseStudyArcDirty();
			return undefined;
		}

		const { needsOrbitIntro } = beginCaseArcSession({
			fromAnotherCase: isCaseEnterFromAnotherCase(),
		});
		markCaseStudyArcDirty();
		flushCaseStudyArcPaint();

		if (!needsOrbitIntro) {
			return undefined;
		}

		const delayMs = Math.max(0, panelIntroDelayMs);
		arcIntroDelayRef.current = window.setTimeout(() => {
			arcIntroDelayRef.current = 0;
			const startedAt = performance.now();
			const tick = (now) => {
				const progress = Math.min(1, (now - startedAt) / CASE_STUDY_ARC_INTRO_MS);
				const eased = 1 - (1 - progress) ** 3;
				caseStudyArcRuntime.introRotationDeg = CASE_STUDY_ARC_INTRO_START_DEG * (1 - eased);
				caseStudyArcRuntime.introOpacity = eased;
				flushCaseStudyArcPaint();
				if (progress < 1) {
					arcIntroFrameRef.current = requestAnimationFrame(tick);
					return;
				}
				arcIntroFrameRef.current = 0;
				markCaseArcIntroPlayed();
				flushCaseStudyArcPaint();
			};
			arcIntroFrameRef.current = requestAnimationFrame(tick);
			wakeCaseStudyAnimationFrame();
		}, delayMs);

		// Do NOT park arc on React cleanup — remount during case→case must not kill chrome.
		return () => {
			window.clearTimeout(arcIntroDelayRef.current);
			arcIntroDelayRef.current = 0;
			if (arcIntroFrameRef.current) {
				cancelAnimationFrame(arcIntroFrameRef.current);
				arcIntroFrameRef.current = 0;
			}
		};
	}, [enabled, panelIntroDelayMs, skipPanelIntro]);

	useLayoutEffect(() => {
		if (!enabled) {
			return undefined;
		}

		// Observe only — chrome leave starts in publishSiteRouteTransition (SITE_TRANSITION.md).
		let lastObserveKey = "";

		const syncLeaveArc = () => {
			const leaving = store.sceneCarouselClickTransitionActive === true || routePhase === "exiting";
			const leaveSite = isCaseLeavingToNonCase();
			const observeKey = `${leaving ? 1 : 0}:${leaveSite ? 1 : 0}`;
			if (observeKey === lastObserveKey) {
				return;
			}
			const wasLeaving = lastObserveKey.startsWith("1:");
			lastObserveKey = observeKey;

			if (leaving) {
				if (!leaveSite && isCaseEnterFromAnotherCase()) {
					// case→case: keep session rest pose (exit already owned by publisher).
					keepCaseArcSessionAlive({ forceVisible: true });
				}
				markCaseStudyArcDirty();
				wakeCaseStudyAnimationFrame();
				return;
			}

			if (wasLeaving) {
				if (leaveSite || isCaseArcOrbitExiting()) {
					return;
				}
				if (isCaseEnterFromAnotherCase() || hasCaseArcIntroPlayed()) {
					keepCaseArcSessionAlive({ forceVisible: true });
					markCaseStudyArcDirty();
					wakeCaseStudyAnimationFrame();
				}
			}
		};

		const stop = subscribeKey(store, "sceneCarouselClickTransitionActive", syncLeaveArc);
		syncLeaveArc();
		return () => {
			stop();
		};
	}, [enabled, routePhase]);
}
