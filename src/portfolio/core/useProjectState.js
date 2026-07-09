import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getHotspotsForState } from "./projectRegistry.js";
import { store } from "@/store.jsx";
import { setStageProgressState } from "./stageProgress.js";

/**
 * Управление states: scroll → activeState, Navigation Core → goToState.
 * @param {import('./types.js').PortfolioProjectModule} project
 */
export function useProjectState(project) {
	const { states } = project;
	const [activeStateIndex, setActiveStateIndex] = useState(0);
	const [scrollProgress, setScrollProgress] = useState(0);
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
		(stateId) => {
			const index = states.findIndex((s) => s.id === stateId);
			if (index < 0) {
				return;
			}
			programmaticScrollRef.current = true;
			setStageProgressState(0);
			activeStateIndexRef.current = index;
			store.portfolioExperience.activeStateIndex = index;
			store.portfolioExperience.activeStateId = states[index]?.id ?? null;
			setActiveStateIndex(index);
			const anchor = states[index].scrollAnchor ?? index / Math.max(states.length - 1, 1);
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
		setActiveStateIndex(0);
		setScrollProgress(0);
		activeStateIndexRef.current = 0;
		setStageProgressState(0);
		store.scroll = 0;
		store.portfolioExperience.activeStateIndex = 0;
		store.portfolioExperience.activeStateId = states[0]?.id ?? null;
		store.portfolioExperience.stageProgress = 0;
		store.portfolioExperience.stageProgressTarget = 0;
	}, [project.config.slug, states]);

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
