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
			console.debug("[troof/scene] mount", config.models.primary);
		},
		unmount() {
			mounted = false;
		},
		onStateChange(nextId, prevId, state) {
			if (!mounted) return;
			void prevId;
			console.debug("[troof/scene] state →", nextId, state.title);
		},
		onInvestigationEnter(hotspot) {
			if (!mounted) return;
			// TODO: LinesModel expand, roof highlight (legacy Case2Model hover)
			console.debug("[troof/scene] investigation", hotspot.id);
		},
		onInvestigationLeave() {},
		update(delta, runtime) {
			if (!mounted) return;
			void delta;
			void runtime;
		},
	};
}
