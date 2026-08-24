const EPSILON = 0.000001;
const DEFAULT_VARIANTS = ["mmk1"];

const state = {
	progress: 0,
	storyPosition: 0,
	storyTarget: 0,
	transitioning: false,
	settledVariant: DEFAULT_VARIANTS[0],
	sourceVariant: DEFAULT_VARIANTS[0],
	targetVariant: DEFAULT_VARIANTS[0],
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));

/**
 * Resolve the current adjacent capability pair and its local 0..1 hex mix.
 * The page story may contain any number of stages; the compositor still only
 * draws one prepared source and one prepared target per frame.
 * `storyTarget` arms the pair immediately on wheel/touch input, while
 * `storyProgress` remains the only owner of the painted shader progress.
 */
export function setCapabilitiesInternalHexProgress(
	storyProgress,
	variants = DEFAULT_VARIANTS,
	storyTarget = storyProgress,
) {
	const sceneVariants = Array.isArray(variants) && variants.length > 0
		? variants
		: DEFAULT_VARIANTS;
	const lastIndex = sceneVariants.length - 1;
	const position = clamp(storyProgress, 0, lastIndex);
	const targetPosition = clamp(storyTarget, 0, lastIndex);
	const restIndex = Math.round(position);
	const atRest = Math.abs(position - restIndex) <= EPSILON;
	const movingBackwardFromRest = atRest
		&& targetPosition < position - EPSILON
		&& restIndex > 0;
	const sourceIndex = movingBackwardFromRest
		? restIndex - 1
		: Math.min(Math.floor(position), lastIndex);
	const targetIndex = Math.min(sourceIndex + 1, lastIndex);
	const localProgress = targetIndex === sourceIndex
		? 0
		: clamp(position - sourceIndex, 0, 1);
	const hasPaintedMix = targetIndex !== sourceIndex
		&& localProgress > EPSILON
		&& localProgress < 1 - EPSILON;
	const hasInternalIntent = targetIndex !== sourceIndex
		&& Math.abs(targetPosition - position) > EPSILON;

	state.storyPosition = position;
	state.storyTarget = targetPosition;
	state.progress = localProgress;
	state.sourceVariant = sceneVariants[sourceIndex];
	state.targetVariant = sceneVariants[targetIndex];
	state.transitioning = hasPaintedMix || hasInternalIntent;
	if (!state.transitioning) {
		state.settledVariant = localProgress >= 1 - EPSILON
			? state.targetVariant
			: state.sourceVariant;
	}
}

export function resetCapabilitiesInternalHex() {
	state.progress = 0;
	state.storyPosition = 0;
	state.storyTarget = 0;
	state.transitioning = false;
	state.settledVariant = DEFAULT_VARIANTS[0];
	state.sourceVariant = DEFAULT_VARIANTS[0];
	state.targetVariant = DEFAULT_VARIANTS[0];
}

export function getCapabilitiesInternalHexState() {
	return state;
}
