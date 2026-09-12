// Medium-only presentation. High/Low never consume these overrides.
export const mediumHomeVisualDefaults = Object.freeze({
	whaleColor: "#0f93cc", // Original whale palette, also used by High.
	whaleEmission: 16,
	whaleRadiance: 6,
	mouseColor: "#00a9ff",
	mouseGlow: 0.85,
	mouseGlowWidth: 2.9,
	textSharpness: 1,
	textBrightness: 0.78,
	textDensity: 1,
	stackTextRenderer: "msdf",
	stackMsdfWeight: 0.05,
	titleFill: 1,
	titleGlowColor: "#a6a6ff",
	titleGlow: 4,
	titleGlowWidth: 1.05,
	titleEdgeSoftness: 0.15,
	titleMotion: 0.25,
	titleMotionSpeed: 1.17,
});

export const mediumHomeVisualConfig = { ...mediumHomeVisualDefaults };

/** Low starts from the approved text/cue defaults, never Medium's dev overrides. */
export function getHomeTextVisualSettings(tier) {
	return tier === "low" ? mediumHomeVisualDefaults : mediumHomeVisualConfig;
}

/** Dev changes only existing uniforms; no resource work or per-frame polling. */
export function applyMediumHomeVisualConfig(scene) {
	const whale = scene?.whaleParticles?.material;
	if (!whale?.defines?.MEDIUM_ROUND_PARTICLE) return;
	const c = mediumHomeVisualConfig, u = whale.uniforms;
	u.uMediumColor.value.set(c.whaleColor);
	u.uMediumEmission.value = c.whaleEmission;
	u.uMediumRadiance.value = c.whaleRadiance;
	for (const overlay of scene.heroTitle?.getWarmupOverlays() ?? []) {
		if (overlay.nativeSmallGlyphs) {
			overlay.uniforms.uGlyphSharpness.value = c.textSharpness;
			overlay.uniforms.uGlyphBrightness.value = c.textBrightness;
			overlay.uniforms.uGlyphDensity.value = c.textDensity;
		}
		if (overlay.msdf) {
			overlay.uniforms.uMsdfEnabled.value = c.stackTextRenderer === "msdf" ? 1 : 0;
			overlay.uniforms.uMsdfWeight.value = c.stackMsdfWeight;
		}
		if (overlay.crispTitle) {
			for (const material of [overlay.textMaterial, overlay.fillMaterial]) {
				const title = material?.uniforms;
				if (!title) continue; // The panel may open before preparation finishes.
				title.uMediumFill.value = c.titleFill;
				title.uMediumGlowColor.value.set(c.titleGlowColor);
				title.uMediumGlow.value = c.titleGlow;
				title.uMediumGlowWidth.value = c.titleGlowWidth;
				title.uMediumEdgeSoftness.value = c.titleEdgeSoftness;
				title.uMediumMotion.value = c.titleMotion;
				title.uMediumMotionSpeed.value = c.titleMotionSpeed;
			}
		}
		if (!overlay.crispCue) continue;
		const cue = overlay.cueUniforms;
		cue.uCueMain.value.set(c.mouseColor);
		cue.uCueBright.value.set(c.mouseColor);
		cue.uGlowStrength.value = c.mouseGlow;
		cue.uGlowWidth.value = c.mouseGlowWidth;
	}
}
