const EPSILON = 0.000001;

const state = {
	progress: 0,
	transitioning: false,
	settledVariant: "mmk1",
};

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

/**
 * Internal capability 01↔02 transition. The same prepared hex compositor is
 * reused, but route/ring ownership remains with the capabilities page.
 */
export function setCapabilitiesInternalHexProgress(storyProgress) {
	const progress = clamp01(storyProgress);
	state.progress = progress;
	state.transitioning = progress > EPSILON && progress < 1 - EPSILON;
	if (!state.transitioning) state.settledVariant = progress >= 1 - EPSILON ? "lightTrails" : "mmk1";
}

export function resetCapabilitiesInternalHex() {
	state.progress = 0;
	state.transitioning = false;
	state.settledVariant = "mmk1";
}

export function getCapabilitiesInternalHexState() {
	return state;
}
