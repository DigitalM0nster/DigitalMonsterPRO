import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getHotspotsForState } from "./projectRegistry.js";
import { store } from "@/store.jsx";
import { setStageProgressState } from "./stageProgress.js";

/**
 * Управление states: scroll → activeState, Navigation Core → goToState.
 * @param {import('./types.js').PortfolioProjectModule} project
 * @param {{ initialStateIndex?: number, initialScrollProgress?: number, initialStageProgress?: number }} [options]
 */
export function useProjectState(project, options = {}) {
	const { states } = project;
	const initialStateIndex = Math.max(0, Math.min(states.length - 1, options.initialStateIndex ?? 0));
	const initialScrollProgress = Math.max(0, Math.min(1, options.initialScrollProgress ?? 0));
	const initialStageProgress = Math.max(0, Math.min(1, options.initialStageProgress ?? 0));
	const [activeStateIndex, setActiveStateIndex] = useState(initialStateIndex);
	const [scrollProgress, setScrollProgress] = useState(initialScrollProgress);
	const programmaticScrollRef = useRef(false);
	const activeStateIndexRef = useRef(activeStateIndex);
	activeStateIndexRef.current = activeStateIndex;

	const activeState = states[activeStateIndex] ?? states[0];
	const activeStateId = activeState?.id ?? states[0].id;

	const commitStageStep = useCallback((direction) => {
		const delta = direction === "backward" ? -1 : 1;
		const fromIndex = activeStateIndexRef.current;
		const nextIndex = fromIndex + delta;
		const lastIndex = states.length - 1;
		// Финал кейса: 0→1 на предпоследнем уже показывает контент последнего.
		// Commit на lastIndex с progress=0 ломает модель — туда скроллом не заходим.
		const blockedFinalForward = direction === "forward" && nextIndex === lastIndex && lastIndex > 0;
		if (nextIndex < 0 || nextIndex >= states.length || blockedFinalForward) {
			return false;
		}
		activeStateIndexRef.current = nextIndex;
		const nextState = states[nextIndex];
		// Синхронно для canvas: иначе 1 кадр рисует старый left panel при stageProgress=0.
		store.portfolioExperience.activeStateIndex = nextIndex;
		store.portfolioExperience.activeStateId = nextState?.id ?? null;
		setActiveStateIndex(nextIndex);
		return true;
	}, [states]);

	const goToState = useCallback(
		(stateId, options = {}) => {
			let index = states.findIndex((s) => s.id === stateId);
			if (index < 0) {
				return;
			}
			const lastIndex = states.length - 1;
			let stageProgress = Math.max(0, Math.min(1, options.stageProgress ?? 0));
			let scroll = options.scrollProgress;
			// Финальная точка дуги = предпоследний этап при progress=1 (контент последнего).
			if (lastIndex > 0 && index === lastIndex) {
				index = lastIndex - 1;
				stageProgress = 1;
				scroll = states[lastIndex].scrollAnchor ?? 1;
			}
			programmaticScrollRef.current = true;
			setStageProgressState(stageProgress);
			activeStateIndexRef.current = index;
			store.portfolioExperience.activeStateIndex = index;
			store.portfolioExperience.activeStateId = states[index]?.id ?? null;
			store.portfolioExperience.stageProgress = stageProgress;
			store.portfolioExperience.stageProgressTarget = stageProgress;
			setActiveStateIndex(index);
			const anchor = Number.isFinite(scroll)
				? scroll
				: (states[index].scrollAnchor ?? index / Math.max(states.length - 1, 1));
			setScrollProgress(anchor);
			store.scroll = anchor;
		},
		[states],
	);

	const onScrollProgress = useCallback(
		(progress) => {
			const clamped = Math.max(0, Math.min(1, progress));
			setScrollProgress(clamped);

			if (programmaticScrollRef.current) {
				programmaticScrollRef.current = false;
				return;
			}

		},
		[],
	);

	useEffect(() => {
		programmaticScrollRef.current = true;
		setActiveStateIndex(initialStateIndex);
		setScrollProgress(initialScrollProgress);
		activeStateIndexRef.current = initialStateIndex;
		setStageProgressState(initialStageProgress);
		store.scroll = initialScrollProgress;
		store.portfolioExperience.activeStateIndex = initialStateIndex;
		store.portfolioExperience.activeStateId = states[initialStateIndex]?.id ?? null;
		store.portfolioExperience.stageProgress = initialStageProgress;
		store.portfolioExperience.stageProgressTarget = initialStageProgress;
	}, [initialScrollProgress, initialStageProgress, initialStateIndex, project.config.slug, states]);

	return useMemo(
		() => ({
			activeStateId,
			activeStateIndex,
			activeState,
			scrollProgress,
			goToState,
			commitStageStep,
			onScrollProgress,
			stateCount: states.length,
		}),
		[activeState, activeStateId, activeStateIndex, commitStageStep, goToState, onScrollProgress, scrollProgress, states.length],
	);
}

/**
 * Режим исследования hotspot (уровень 2).
 * @param {import('./types.js').PortfolioProjectModule} project
 * @param {string} activeStateId
 */
export function useInvestigationMode(project, activeStateId) {
	const [investigationHotspotId, setInvestigationHotspotId] = useState(null);

	const stateHotspots = useMemo(
		() => getHotspotsForState(project, activeStateId),
		[project, activeStateId],
	);

	const activeHotspot = useMemo(
		() => stateHotspots.find((h) => h.id === investigationHotspotId) ?? null,
		[stateHotspots, investigationHotspotId],
	);

	const enterInvestigation = useCallback((hotspotId) => {
		setInvestigationHotspotId(hotspotId);
	}, []);

	const leaveInvestigation = useCallback(() => {
		setInvestigationHotspotId(null);
	}, []);

	// Смена state сбрасывает investigation
	useEffect(() => {
		setInvestigationHotspotId(null);
	}, [activeStateId]);

	const visibleHotspots = useMemo(() => {
		if (investigationHotspotId && activeHotspot?.investigation?.hideOtherHotspots !== false) {
			return stateHotspots.filter((h) => h.id === investigationHotspotId);
		}
		return stateHotspots.filter((h) => h.status !== "needsCopy");
	}, [activeHotspot, investigationHotspotId, stateHotspots]);

	return useMemo(
		() => ({
			investigationHotspotId,
			activeHotspot,
			isInvestigating: investigationHotspotId !== null,
			visibleHotspots,
			enterInvestigation,
			leaveInvestigation,
		}),
		[activeHotspot, enterInvestigation, investigationHotspotId, leaveInvestigation, visibleHotspots],
	);
}
