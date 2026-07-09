/**
 * Утилита: scene.js проекта вызывает applySceneBehavior для перехода state / investigation.
 * @param {import('./types.js').SceneBehavior} behavior
 * @param {import('./types.js').ProjectSceneContext} context
 */
export function applySceneBehavior(behavior, context) {
	if (!behavior) {
		return;
	}

	if (typeof context.applyBehavior === "function") {
		context.applyBehavior(behavior);
		return;
	}

	// Fallback до полной реализации scene.js
	console.debug("[portfolio] applySceneBehavior", behavior);
}

/**
 * Разрешить subStage внутри state по scrollProgress (0…1 локально внутри state).
 * @param {import('./types.js').PortfolioState} state
 * @param {number} localProgress 0…1
 * @returns {import('./types.js').PortfolioSubStage | null}
 */
export function resolveSubStage(state, localProgress) {
	if (!state.subStages?.length) {
		return null;
	}

	let active = state.subStages[0];
	for (const stage of state.subStages) {
		const anchor = stage.scrollAnchor ?? 0;
		if (localProgress >= anchor) {
			active = stage;
		}
	}
	return active;
}
