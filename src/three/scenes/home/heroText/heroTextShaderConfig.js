/** Live-конфиг hero-текста (dev-панель 6 + дефолты продакшена). */
export const heroTextShaderConfig = {
	titleFillBrightness: 1,
	titleMasterAlpha: 1,
	titleGlitchStrength: 2,
	titleOutlineR: 2.28,
	titleOutlineG: 2.28,
	titleOutlineB: 6,
	titleOutlineThreshold: 0.17,
	// Tagline — «Создаём сайты…» (полупрозрачный белый, как до референса)
	taglineFillBrightness: 0.38,
	taglineMasterAlpha: 0.62,
	taglineGamma: 2.2,
	taglineTint: "#ffffff",
	// Tech stack — белый, без soft-cyan gamma (иначе мылится в bloom)
	stackFillBrightness: 1.05,
	stackMasterAlpha: 1,
	stackGamma: 1,
	stackTint: "#ffffff",
	titleGradientTop: "#ffffff",
	titleGradientBottom: "#37afeb",
	titleShimmer: 0.045,
	// Local click wave over the title. Energy stacks on repeated clicks, but is capped.
	titleClickImpulse: 0.42,
	titleClickMaxStrength: 1,
	titleClickAttack: 24,
	titleClickDecay: 2.8,
	titleClickRadiusNDC: 0.16,
	titleClickWaveSpeedNDC: 0.72,
	titleClickWaveWidthNDC: 0.085,
	titleClickOffset: 0.009,
};

export function applyHeroTitleShaderUniforms(uniforms, config = heroTextShaderConfig, profile = "title") {
	if (!uniforms) {
		return;
	}

	if (profile === "title") {
		if (uniforms.uFillBrightness) {
			uniforms.uFillBrightness.value = config.titleFillBrightness;
		}
		if (uniforms.uMasterAlpha) {
			uniforms.uMasterAlpha.value = config.titleMasterAlpha;
		}
		if (uniforms.uGlitchStrength) {
			uniforms.uGlitchStrength.value = config.titleGlitchStrength;
		}
		if (uniforms.uOutlineBoost) {
			uniforms.uOutlineBoost.value.set(config.titleOutlineR, config.titleOutlineG, config.titleOutlineB);
		}
		if (uniforms.uOutlineThreshold) {
			uniforms.uOutlineThreshold.value = config.titleOutlineThreshold;
		}
		if (uniforms.uFillGradientTop) {
			uniforms.uFillGradientTop.value.set(config.titleGradientTop);
		}
		if (uniforms.uFillGradientBottom) {
			uniforms.uFillGradientBottom.value.set(config.titleGradientBottom);
		}
		if (uniforms.uTitleShimmer) {
			uniforms.uTitleShimmer.value = config.titleShimmer;
		}
		return;
	}

	const layer =
		profile === "stack"
			? {
					brightness: config.stackFillBrightness,
					alpha: config.stackMasterAlpha,
					gamma: config.stackGamma,
					tint: config.stackTint,
				}
			: {
					brightness: config.taglineFillBrightness,
					alpha: config.taglineMasterAlpha,
					gamma: config.taglineGamma,
					tint: config.taglineTint,
				};

	if (uniforms.uSubtitleBrightness) {
		uniforms.uSubtitleBrightness.value = layer.brightness;
	}
	if (uniforms.uSubtitleAlpha) {
		uniforms.uSubtitleAlpha.value = layer.alpha;
	}
	if (uniforms.uSubtitleGamma) {
		uniforms.uSubtitleGamma.value = layer.gamma;
	}
	if (uniforms.uSubtitleTint) {
		uniforms.uSubtitleTint.value.set(layer.tint);
	}
}
