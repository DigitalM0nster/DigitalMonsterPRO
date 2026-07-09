import { applySceneBehavior } from "@/portfolio/core/sceneBehavior.js";

/**
 * Специфичная 3D-логика НИПИГАЗ.
 * Поведение орбитального модуля по phase — см. docs/NIPIGAS_3D_MODEL_BEHAVIOR.md
 *
 * @param {import('@/portfolio/core/types.js').ProjectSceneContext} context
 * @returns {import('@/portfolio/core/types.js').ProjectSceneController}
 */
export function createProjectScene(context) {
	const { config } = context;
	let mounted = false;
	let activePhase = "overview";

	return {
		mount() {
			mounted = true;
			console.debug("[nipigas/scene] mount — 3D phase spec:", config.models?.primary);
		},

		unmount() {
			mounted = false;
			activePhase = "overview";
		},

		onStateChange(_nextId, _prevId, state) {
			if (!mounted) return;
			activePhase = state.scene?.model?.orbitalModule?.phase ?? "overview";
			applySceneBehavior(state.scene, context);
			// TODO: lerp orbital module to activePhase (см. NIPIGAS_3D_MODEL_BEHAVIOR.md)
		},

		onSubStageChange(_subStageId, state) {
			if (!mounted) return;
			void state;
		},

		onInvestigationEnter(hotspot) {
			if (!mounted) return;
			applySceneBehavior(hotspot.investigation?.behavior, context);
		},

		onInvestigationLeave() {
			if (!mounted) return;
		},

		update(delta, runtime) {
			if (!mounted) return;
			// TODO: pointer tilt, phase blend from scroll / mobileSwipeProgress
			void delta;
			void runtime;
			void activePhase;
		},
	};
}
