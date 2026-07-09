import { easing } from "maath";

/**
 * Grain blur case1 от скролла.
 * blurRadius: 0 → blurMax в диапазоне scroll, затем снова 0.
 */
export function updateCase1GrainBlurRadius(damped, scroll, delta, grainBlurConfig, viewportWidth, openedCase) {
	const blurMax = grainBlurConfig.blurRadiusMax ?? 0.0015;
	const scrollGain = grainBlurConfig.scrollGain ?? 0.012;
	const rampSmooth = grainBlurConfig.rampSmooth ?? 2.8;
	const fadeSmooth = grainBlurConfig.fadeSmooth ?? 0.65;
	const fadeStart = grainBlurConfig.scrollFadeStart ?? 0.55;

	const targetFromScroll = (value) => Math.min(value * scrollGain, blurMax);

	if (viewportWidth <= 768) {
		if (scroll < 0.01) {
			easing.damp(damped, "current", openedCase ? blurMax : 0.0, fadeSmooth, delta);
		} else if (scroll < fadeStart) {
			easing.damp(
				damped,
				"current",
				openedCase ? blurMax : targetFromScroll(scroll),
				rampSmooth,
				delta,
			);
		} else {
			easing.damp(damped, "current", 0.0, fadeSmooth, delta);
		}
		return;
	}

	if (scroll < 0.01) {
		easing.damp(damped, "current", 0.0, fadeSmooth, delta);
	} else if (scroll < fadeStart) {
		easing.damp(damped, "current", targetFromScroll(scroll), rampSmooth, delta);
	} else {
		easing.damp(damped, "current", 0.0, fadeSmooth, delta);
	}
}
