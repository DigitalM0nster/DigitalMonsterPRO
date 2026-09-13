/** The light-trails title reveal; consumers supply their prepared textInk atlas. */
export const TITLE_MOSAIC_GLSL = /* glsl */ `
	vec4 titleMosaic(vec2 uv, float reveal, float side, float bloomStrength) {
		if (reveal <= 0.0) discard;
		vec4 ink = textInk(uv);
		// Settled type needs one atlas sample, with no ongoing glitch or emission.
		if (reveal >= 1.0) {
			#ifdef BLOOM_ONLY
				discard;
			#endif
			if (ink.a < 0.002) discard;
			return ink;
		}
		vec2 cell = floor(uv * vec2(128.0, 32.0));
		float stagger = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
		float along = side > 0.0 ? 1.0 - uv.x : uv.x;
		float progress = clamp((reveal - along * 0.72 - stagger * 0.1) / 0.18, 0.0, 1.0);
		vec2 phase = vec2(smoothstep(0.0, 1.0, progress), sin(progress * 3.14159265));
		float glitch = fract(sin(dot(cell + floor(phase.x * 3.0), vec2(71.7, 139.3))) * 43758.5453);
		ink = textInk(uv + vec2((glitch - 0.5) * 0.005 * phase.y, 0.0));
		ink.a *= phase.x;
		if (ink.a < 0.002) discard;
		vec3 emission = vec3(2.5, 10.0, 18.0) * pow(max(0.0, phase.y), 1.4) * bloomStrength;
		#ifdef BLOOM_ONLY
			return vec4(emission, ink.a);
		#else
			ink.rgb = mix(ink.rgb, vec3(0.3, 0.88, 1.0), phase.y * 0.7);
			#ifndef SHARP_ONLY
				ink.rgb += emission;
			#endif
			return ink;
		#endif
	}
`;
