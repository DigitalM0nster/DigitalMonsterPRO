/**
 * До 4 метрик для HUD-панели из state.traits и meta проекта.
 * @param {import('@/portfolio/core/types.js').PortfolioState} state
 * @param {import('@/portfolio/core/types.js').PortfolioProjectConfig} config
 */
export function getStateMetrics(state, config) {
	/** @type {{ label: string, value: string }[]} */
	const metrics = [];

	if (state.id === "state_00" && config.meta) {
		if (config.meta.year != null) {
			metrics.push({ label: "Year", value: String(config.meta.year) });
		}
		if (config.meta.type) {
			metrics.push({ label: "Type", value: config.meta.type });
		}
	}

	for (const trait of state.traits ?? []) {
		if (metrics.length >= 4) {
			break;
		}
		const value = trait.values?.length
			? trait.values.slice(0, 3).join(" · ")
			: (trait.value ?? "");
		if (!value) {
			continue;
		}
		metrics.push({ label: trait.label, value });
	}

	return metrics.slice(0, 4);
}
