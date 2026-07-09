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

	// Glitch-символы на canvas (#00ccff): низкий R, не белый tagline и не stack #8ce8ff (R ~0.55).
	float glitchSymbolMask =
		(1.0 - smoothstep(0.08, 0.22, displacedColor.r)) *
		smoothstep(0.2, 0.42, displacedColor.b - displacedColor.r) *
		smoothstep(0.45, 0.68, displacedColor.g);
	vec3 bloomHdr = uReplacementBloomTint * uReplacementBloomBoost;
	rgb = mix(rgb, bloomHdr, glitchSymbolMask);

	gl_FragColor = vec4(rgb, alpha);
	if (gl_FragColor.a < 0.1) discard;
}
`;
