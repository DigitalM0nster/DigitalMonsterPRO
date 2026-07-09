/** Reveal появления/исчезновения — только hero-текст главной страницы. */
export const heroPageRevealUniformsGlsl = /* glsl */ `
uniform float uRevealProgress;
uniform float uRevealLinear;
uniform float uRevealEnter;
uniform float uRevealPartSize;
uniform float uRevealSeed;
uniform float uRevealShiftRatio;
uniform float uRevealDropMin;
uniform float uRevealDropMax;
uniform float uRevealSweepSpread;
uniform float uRevealUsePartReveal;
uniform float uRevealGlitchProgress;
uniform float uRevealGlitchTime;
uniform float uRevealGlitchIntensity;
uniform float uRevealGlitchSliceCount;
uniform float uRevealGlitchRgbShift;
uniform vec3 uRevealGlitchColor;
`;

export const heroPageRevealFunctionsGlsl = /* glsl */ `
float heroPageRevealHash21(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}

float heroPageRevealEaseOutCubic(float t) {
	float c = clamp(t, 0.0, 1.0);
	return 1.0 - pow(1.0 - c, 3.0);
}

float heroPageRevealEaseInOutCubic(float t) {
	float c = clamp(t, 0.0, 1.0);
	return c < 0.5
		? 4.0 * c * c * c
		: 1.0 - pow(-2.0 * c + 2.0, 3.0) / 2.0;
}

/** @return alpha multiplier; sampleUv может сдвигаться (drop / glitch). */
float heroPageApplyReveal(inout vec2 sampleUv) {
	if (uRevealProgress <= 0.0) {
		return 0.0;
	}

	float buildT = heroPageRevealEaseInOutCubic(uRevealLinear);
	float alphaT = uRevealEnter > 0.5 ? buildT : uRevealProgress;

	if (uRevealUsePartReveal > 0.5) {
		float cellW = uRevealPartSize;
		float cellH = uRevealPartSize;
		vec2 cellId = vec2(floor(sampleUv.x / cellW), floor(sampleUv.y / cellH));
		vec2 gridCount = vec2(ceil(1.0 / cellW), ceil(1.0 / cellH));
		float order = (cellId.x / max(gridCount.x - 1.0, 1.0) + cellId.y / max(gridCount.y - 1.0, 1.0) * 0.22);
		float localT = clamp((buildT - order * uRevealSweepSpread) / max(1.0 - uRevealSweepSpread, 0.001), 0.0, 1.0);
		float riseT = heroPageRevealEaseOutCubic(localT);
		alphaT = uRevealEnter > 0.5 ? localT : uRevealProgress * localT;

		vec2 seedOffset = vec2(uRevealSeed, uRevealSeed * 1.37);
		float shiftRoll = heroPageRevealHash21(cellId + seedOffset);
		if (shiftRoll < uRevealShiftRatio) {
			float dropRoll = heroPageRevealHash21(cellId + seedOffset * 2.11 + vec2(5.1, 9.3));
			float dropUv = mix(uRevealDropMin, uRevealDropMax, dropRoll);
			sampleUv.y += dropUv * (1.0 - riseT);
		}
	}

	if (uRevealGlitchProgress > 0.001) {
		float sliceId = floor(sampleUv.y * max(uRevealGlitchSliceCount, 1.0));
		float bandNoise = heroPageRevealHash21(vec2(sliceId, floor(uRevealGlitchTime * 42.0) + uRevealSeed));
		float bandPulse = step(0.42, bandNoise);
		float bandWave = sin(uRevealGlitchTime * 52.0 + sliceId * 2.37);
		float bandOffset = (bandNoise - 0.5) * 2.0 * uRevealGlitchIntensity * uRevealGlitchProgress;
		sampleUv.x += bandOffset * bandPulse + bandWave * uRevealGlitchIntensity * 0.16 * uRevealGlitchProgress;
	}

	if (sampleUv.x < 0.0 || sampleUv.x > 1.0 || sampleUv.y < 0.0 || sampleUv.y > 1.0) {
		return 0.0;
	}

	return alphaT;
}
`;
