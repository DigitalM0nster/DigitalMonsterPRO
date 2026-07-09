/**
 * @param {import('@/portfolio/core/types.js').ProjectSceneContext} context
 * @returns {import('@/portfolio/core/types.js').ProjectSceneController}
 */
export function createProjectScene(context) {
	const { config } = context;
	let mounted = false;

	return {
		mount() {
			mounted = true;
			console.debug("[belkaProduction/scene] mount", config.models.primary);
		},
		unmount() {
			mounted = false;
		},
		onStateChange(nextId, prevId, state) {
			if (!mounted) return;
			void prevId;
			// Legacy: scroll camera disabled for case4
			console.debug("[belkaProduction/scene] state →", nextId, state.title);
		},
		onInvestigationEnter(hotspot) {
			if (!mounted) return;
			console.debug("[belkaProduction/scene] investigation", hotspot.id);
		},
		onInvestigationLeave() {},
		update(delta, runtime) {
			if (!mounted) return;
			void delta;
			void runtime;
		},
	};
}
