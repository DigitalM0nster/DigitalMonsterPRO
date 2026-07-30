import { applySceneBehavior } from "./sceneBehavior.js";

/**
 * Базовый controller для кейсов с готовым контентом и временной native-сценой.
 * Не создаёт текстур и не выполняет работу в update; state-поведение применяется
 * только при смене главы или investigation.
 *
 * @param {import('./types.js').ProjectSceneContext} context
 * @returns {import('./types.js').ProjectSceneController}
 */
export function createContentProjectScene(context) {
	let mounted = false;

	return {
		mount() {
			mounted = true;
		},
		unmount() {
			mounted = false;
		},
		onStateChange(_nextId, _prevId, state) {
			if (!mounted) return;
			applySceneBehavior(state.scene, context);
		},
		onInvestigationEnter(hotspot) {
			if (!mounted) return;
			applySceneBehavior(hotspot.investigation?.behavior, context);
		},
		onInvestigationLeave() {},
		update() {},
	};
}
