/**
 * Live-tunable Balatro-style liquid knobs (DEV panel + shader uniforms).
 * Based on Shadertoy XXtBRr / localthunk — pixel filter removed; colour1 = black.
 */
export const backgroundLiquidTuneDefaults = Object.freeze({
	spinRotation: 2.85,
	spinSpeed: 8.4,
	contrast: 3.3,
	lighting: 1.5,
	spinAmount: 0.15,
	spinEase: 3,
	/** UV scale inside paint loop (Balatro default 30). */
	paintZoom: 12,
	/** Extra iTime on the spin-angle term (Balatro IS_ROTATE). */
	rotate: false,
	/** Was Balatro red — site uses black. */
	colour1: "#000000",
	colour2: "#006bb4",
	colour3: "#161f25",
	/** Pipeline iTime advance per second. */
	timeSpeed: 0.175,
	/** Site brightness / tint (also writes case1PostProcessConfig when applied). */
	brightness: 0.8,
	distortionColor: "#1b476f",
	liquidScale: 2,
});

/** Mutable live state — DEV panel writes here. */
export const backgroundLiquidTune = {
	...backgroundLiquidTuneDefaults,
};

export function resetBackgroundLiquidTune() {
	Object.assign(backgroundLiquidTune, backgroundLiquidTuneDefaults);
}

export function shouldOpenLiquidDevFromUrl() {
	if (typeof window === "undefined") {
		return false;
	}
	try {
		const params = new URLSearchParams(window.location.search);
		return params.has("liquidDev") || params.has("bgLiquidDev");
	} catch {
		return false;
	}
}
