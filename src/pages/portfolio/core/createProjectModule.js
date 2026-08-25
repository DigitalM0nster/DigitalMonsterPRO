/**
 * Сборка project-модуля из используемых config и states.
 * @param {import('./types.js').PortfolioProjectConfig} config
 * @param {import('./types.js').PortfolioState[]} states
 * @returns {import('./types.js').PortfolioProjectModule}
 */
export function createProjectModule(config, states) {
	if (!config?.slug) {
		throw new Error("createProjectModule: config.slug обязателен");
	}
	if (!Array.isArray(states) || states.length === 0) {
		throw new Error(`createProjectModule(${config.slug}): states не может быть пустым`);
	}

	const stateIds = new Set();
	for (const state of states) {
		if (stateIds.has(state.id)) {
			throw new Error(`createProjectModule(${config.slug}): дублирующий state id "${state.id}"`);
		}
		stateIds.add(state.id);
	}

	return {
		config,
		states,
	};
}
