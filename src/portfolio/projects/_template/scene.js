/**
 * @param {import('@/portfolio/core/types.js').ProjectSceneContext} context
 * @returns {import('@/portfolio/core/types.js').ProjectSceneController}
 */
export function createProjectScene(context) {
	void context;
	return {
		mount() {},
		unmount() {},
		onStateChange() {},
		onInvestigationEnter() {},
		onInvestigationLeave() {},
		update() {},
	};
}
