import { createContext, useContext, useMemo } from "react";

/** @type {import('react').Context<import('./types.js').PortfolioProjectContextValue | null>} */
const PortfolioProjectContext = createContext(null);

/**
 * @typedef {Object} PortfolioProjectContextValue
 * @property {import('./types.js').PortfolioProjectModule} project
 * @property {string} activeStateId
 * @property {number} activeStateIndex
 * @property {import('./types.js').PortfolioState} activeState
 * @property {number} scrollProgress
 * @property {number} stageProgress
 * @property {number} stageProgressTarget
 * @property {string | null} investigationHotspotId
 * @property {import('./types.js').PortfolioHotspot | null} activeHotspot
 * @property {boolean} isInvestigating
 * @property {import('./types.js').PortfolioHotspot[]} visibleHotspots
 * @property {(stateId: string) => void} goToState
 * @property {(hotspotId: string) => void} enterInvestigation
 * @property {() => void} leaveInvestigation
 */

/**
 * @param {Object} props
 * @param {import('./types.js').PortfolioProjectModule} props.project
 * @param {PortfolioProjectContextValue} props.value
 * @param {import('react').ReactNode} props.children
 */
export function PortfolioProjectProvider({ project, value, children }) {
	const merged = useMemo(
		() => ({
			project,
			...value,
		}),
		[project, value],
	);

	return (
		<PortfolioProjectContext.Provider value={merged}>
			{children}
		</PortfolioProjectContext.Provider>
	);
}

/** @returns {PortfolioProjectContextValue} */
export function usePortfolioProject() {
	const ctx = useContext(PortfolioProjectContext);
	if (!ctx) {
		throw new Error("usePortfolioProject: вне PortfolioProjectProvider");
	}
	return ctx;
}

export default PortfolioProjectContext;
