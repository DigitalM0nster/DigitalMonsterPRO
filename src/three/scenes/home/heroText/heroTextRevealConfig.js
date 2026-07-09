import { LOADER_CURTAIN_HIDE_MS } from "@/config/loaderCurtain.js";
import { ROUTE_TRANSITION_EXIT_MS } from "@/config/routeTransition.js";

/**
 * Reveal появления/исчезновения hero-текста на главной.
 * Отдельно от portfolio hub — свой шейдер heroPageReveal.glsl.js.
 *
 * enterDurationMs / exitDurationMs — реальное время анимации в ms.
 * В шейдер уходит uRevealLinear (линейный 0→1 за это время); easing — один раз в GLSL.
 * Live-tune: dev-панель 6 → секция «Reveal главной».
 */
export const heroTextRevealConfig = {
	enabled: true,
	partSize: 0.005,
	shiftRatio: 0.91,
	dropMin: 0.15,
	dropMax: 0.5,
	sweepSpread: 0.09,
	enterDurationMs: 1100,
	exitDurationMs: 500,
	localeSwitchExitMs: 650,
	localeSwitchEnterMs: 900,
	/** Glitch-полосы при смене языка (subtitle + stack). */
	localeSwitchGlitch: true,
	waitForLoaderCurtainMs: LOADER_CURTAIN_HIDE_MS,
	/** Glitch-полосы при появлении (сильнее в начале, затухает). */
	enterGlitch: true,
	/** Exit-анимация не используется: уход с главной — hexTransition. */
	exitGlitch: false,
	glitchIntensity: 0.029,
	glitchSliceCount: 40,
	glitchRgbShift: 0,
	glitchColor: "#ffffff",
	titleRevealSeed: 0.17,
	subtitleRevealSeed: 0.41,
};

export function applyHeroTextRevealUniforms(uniforms, config = heroTextRevealConfig, revealSeed = config.titleRevealSeed) {
	if (!uniforms?.uRevealPartSize) {
		return;
	}

	uniforms.uRevealPartSize.value = config.partSize;
	uniforms.uRevealSeed.value = revealSeed;
	uniforms.uRevealShiftRatio.value = config.shiftRatio;
	uniforms.uRevealDropMin.value = config.dropMin;
	uniforms.uRevealDropMax.value = config.dropMax;
	uniforms.uRevealSweepSpread.value = config.sweepSpread;
	uniforms.uRevealUsePartReveal.value = config.enabled ? 1 : 0;
	uniforms.uRevealGlitchIntensity.value = config.glitchIntensity;
	uniforms.uRevealGlitchSliceCount.value = config.glitchSliceCount;
	uniforms.uRevealGlitchRgbShift.value = config.glitchRgbShift;
	uniforms.uRevealGlitchColor.value.set(config.glitchColor);
}
