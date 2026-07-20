import { heroPageRevealFunctionsGlsl, heroPageRevealUniformsGlsl } from "./heroPageReveal.glsl.js";

export const heroTextFragmentSimpleShader = /* glsl */ `
uniform sampler2D uTexture;
${heroPageRevealUniformsGlsl}
uniform vec2 uMouse;
uniform vec2 uPlaneSize;
uniform vec2 uResolution;
uniform float uTime;
uniform float uProgress;
uniform float uSubtitleBrightness;
uniform float uSubtitleAlpha;
uniform float uSubtitleGamma;
uniform vec3 uSubtitleTint;
uniform float uReplacementBloomBoost;
uniform vec3 uReplacementBloomTint;
varying vec2 vUv;

${heroPageRevealFunctionsGlsl}

void main() {
	vec2 sampleUv = vUv;
	float revealAlpha = heroPageApplyReveal(sampleUv);
	if (revealAlpha <= 0.0) {
		discard;
	}

	vec4 displacedColor = texture2D(uTexture, sampleUv);

	float alpha = displacedColor.a * revealAlpha * uSubtitleAlpha;
	vec3 base = displacedColor.rgb * uSubtitleTint;
	vec3 rgb = pow(base * uSubtitleBrightness, vec3(1.0 / uSubtitleGamma));

	// Snake letters (#009dff) on SRGB→linear textures: G≈0.35, B≈1, R≈0.
	// Old mask expected sRGB G (0.45–0.68) and killed HDR neon after color-management.
	float glitchSymbolMask =
		smoothstep(0.04, 0.18, displacedColor.a) *
		(1.0 - smoothstep(0.05, 0.38, displacedColor.r)) *
		smoothstep(0.12, 0.42, displacedColor.g) *
		smoothstep(0.35, 0.75, displacedColor.b);
	vec3 bloomHdr = uReplacementBloomTint * uReplacementBloomBoost;
	rgb = mix(rgb, bloomHdr, glitchSymbolMask);
	// Keep soft canvas halo (low alpha) for neon fringe — don't discard it.
	alpha = max(alpha, glitchSymbolMask * displacedColor.a * revealAlpha);

	gl_FragColor = vec4(rgb, alpha);
	if (gl_FragColor.a < 0.02) discard;
}
`;
