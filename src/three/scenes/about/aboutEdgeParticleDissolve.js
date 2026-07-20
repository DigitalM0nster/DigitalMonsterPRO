/**
 * Edge dissolve / PCB appear mode ids (0…5): fade, seed, scan, spark, ring, glitch.
 * PCB appear uses the same math with inverted progress.
 */

/** GLSL helpers + sample. Expects hash01(float) or uses seed floats. */
export const ABOUT_EDGE_DISSOLVE_GLSL = /* glsl */ `
	uniform float uDissolve;
	uniform float uDissolveMode;

	float edgeHash11(float n) {
		return fract(sin(n * 127.1) * 43758.5453123);
	}

	/**
	 * Returns vis 0..1 and glow boost for the dissolving edge.
	 * seed: per-segment / per-point random
	 * along: 0..1 along segment / ring
	 */
	vec2 edgeDissolveSample(float seed, float along, float time) {
		float d = clamp(uDissolve, 0.0, 1.0);
		if (d <= 1e-5) return vec2(1.0, 0.0);
		if (d >= 0.999) return vec2(0.0, 0.0);

		float mode = floor(uDissolveMode + 0.5);
		float h = edgeHash11(seed * 17.13 + 3.7);
		float h2 = edgeHash11(seed * 41.9 + along * 9.0);
		float vis = 1.0;
		float glow = 0.0;

		if (mode < 0.5) {
			/** 0 Soft fade */
			vis = 1.0 - smoothstep(0.0, 1.0, d);
			glow = smoothstep(0.0, 0.35, d) * (1.0 - smoothstep(0.55, 1.0, d)) * 0.65;
			return vec2(vis, glow);
		}

		if (mode < 1.5) {
			/** 1 Seed dissolve — random bits drop out */
			float cut = d * 1.15;
			vis = smoothstep(cut - 0.08, cut + 0.02, h);
			glow = exp(-abs(h - cut) * 22.0) * d * 1.4;
			return vec2(vis, glow);
		}

		if (mode < 2.5) {
			/** 2 Scan wipe along segment */
			float field = along + h * 0.08;
			float cut = d * 1.12;
			vis = smoothstep(cut - 0.06, cut + 0.02, field);
			glow = exp(-abs(field - cut) * 28.0) * d * 1.6;
			return vec2(vis, glow);
		}

		if (mode < 3.5) {
			/** 3 Spark burst — hold, flash, snuff */
			float hold = smoothstep(0.0, 0.25, d);
			float snuff = smoothstep(0.35, 1.0, d);
			vis = (1.0 - snuff) * mix(1.0, step(0.35, h2), hold * 0.55);
			glow = hold * (1.0 - snuff) * (0.8 + h) * 2.2;
			return vec2(vis, glow);
		}

		if (mode < 4.5) {
			/**
			 * 4 Ring collapse — outer first (PCB passes radial as along).
			 * Appear drives uDissolve 1→0 → center builds first, then out.
			 */
			float rim = mix(along, h, 0.12);
			float cut = d * 1.2;
			vis = smoothstep(cut - 0.1, cut + 0.02, 1.0 - rim);
			glow = exp(-abs((1.0 - rim) - cut) * 20.0) * d * 0.85;
			return vec2(vis, glow);
		}

		/** 5 Glitch shatter */
		float row = floor(along * 24.0 + h * 4.0);
		float slice = step(0.5, edgeHash11(row + floor(time * 18.0)));
		float field = h + slice * 0.28 * h2;
		float cut = d * 1.18;
		vis = smoothstep(cut - 0.05, cut + 0.02, field);
		glow = (1.0 - vis) * step(cut - 0.16, field) * (0.55 + slice) * d * 1.8;
		return vec2(vis, glow);
	}
`;
