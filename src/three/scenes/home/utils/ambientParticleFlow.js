import { MathUtils, Vector2, Vector3 } from "three";

export function createAmbientFlowState() {
	return { phase: 0, offset: new Vector2(), direction: new Vector3(1, 0, 0) };
}

/** Integrate a changing current without reprojecting particles that are already
 * moving. The wrapped offset stays bounded for long-running browser sessions. */
export function updateAmbientFlowState(state, scrollPhase, flowDirection, wrapWidth) {
	const nextPhase = Number.isFinite(scrollPhase) ? scrollPhase : state.phase;
	const delta = MathUtils.clamp(nextPhase - state.phase, -2, 2);
	state.phase = nextPhase;
	if (flowDirection?.lengthSq?.() > 1e-6) state.direction.copy(flowDirection).normalize();
	state.offset.x += state.direction.x * delta;
	state.offset.y += state.direction.z * delta;
	const width = Math.max(.001, wrapWidth);
	const half = width * .5;
	state.offset.x = MathUtils.euclideanModulo(state.offset.x + half, width) - half;
	state.offset.y = MathUtils.euclideanModulo(state.offset.y + half, width) - half;
	return state;
}
