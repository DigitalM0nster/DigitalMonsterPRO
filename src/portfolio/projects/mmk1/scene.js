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
			console.debug("[mmk1/scene] mount", config.models.primary);
		},
		unmount() {
			mounted = false;
		},
		onStateChange(nextId, prevId, state) {
			if (!mounted) return;
			void prevId;
			// TODO: cinematic enter на state_00, camera fly-up
			console.debug("[mmk1/scene] state →", nextId, state.title);
		},
		onInvestigationEnter(hotspot) {
			if (!mounted) return;
			console.debug("[mmk1/scene] investigation", hotspot.id);
		},
		onInvestigationLeave() {},
		update(delta, runtime) {
			if (!mounted) return;
			void delta;
			void runtime;
		},
	};
}
