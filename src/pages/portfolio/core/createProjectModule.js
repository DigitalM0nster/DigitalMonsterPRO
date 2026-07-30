/**
 * Сборка модуля проекта из четырёх конфигов.
 * @param {import('./types.js').PortfolioProjectConfig} config
 * @param {import('./types.js').PortfolioState[]} states
 * @param {import('./types.js').HotspotsByState} hotspots
 * @param {(ctx: import('./types.js').ProjectSceneContext) => import('./types.js').ProjectSceneController} createScene
 * @returns {import('./types.js').PortfolioProjectModule}
 */
export function createProjectModule(config, states, hotspots, createScene) {
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
		hotspots: hotspots ?? {},
		createScene,
	};
}
