/**
 * About epic title — fill + contour.
 * Story leave (uExit) = upward mosaic dissolve.
 * Locale swap (uLocale + uLocaleRole) = neon signal rewrite scan (separate look).
 */
export const aboutEpicTextFragmentShader = /* glsl */ `
precision highp float;

uniform float uTime;
uniform float uAppear;
uniform float uExit;
uniform float uLocale;
uniform float uLocaleRole;
uniform float uIntensity;
uniform float uGlow;
uniform float uOutlineBoost;
uniform float uFillDark;
uniform float uFillOpacity;
uniform float uFlowSpeed;
uniform float uDashCount;
uniform float uDashLength;
uniform float uDashSoft;
uniform float uLayer;
uniform vec3 uTint;
uniform vec3 uCore;
uniform vec3 uOutline;

varying vec2 vUv;
varying float vStrokeAlong;
varying float vStrokeV;

float easeOutCubic(float t) {
	float u = 1.0 - clamp(t, 0.0, 1.0);
	return 1.0 - u * u * u;
}

float easeInOutCubic(float t) {
	float x = clamp(t, 0.0, 1.0);
	return x < 0.5 ? 4.0 * x * x * x : 1.0 - pow(-2.0 * x + 2.0, 3.0) / 2.0;
}

float hash21(vec2 p) {
	p = fract(p * vec2(123.34, 456.21));
	p += dot(p, p + 45.32);
	return fract(p.x * p.y);
}

float appearMask(float appear) {
	return easeOutCubic(appear);
}

float strokeTravelMask(float along) {
	float speed = max(uFlowSpeed, 0.05);
	float count = max(uDashCount, 2.0);
	float arc = clamp(uDashLength, 0.04, 0.8);
	float soft = max(uDashSoft * 0.35 + arc * 0.25, 0.02);
	float t = uTime * speed * 0.12;

	float x = fract(along * count - t);
	float d = min(x, 1.0 - x);
	float mask = exp(-(d * d) / (soft * soft));

	float x2 = fract(along * max(count * 0.35, 2.0) + uTime * speed * 0.07);
	float d2 = min(x2, 1.0 - x2);
	mask = max(mask, exp(-(d2 * d2) / (soft * soft * 2.2)) * 0.65);

	return clamp(mask, 0.0, 1.0);
}

/**
 * Contacts leave: tiles dissolve upward — fragment only.
 */
float exitMosaic(vec2 uv, float exitP, out vec2 warpedUv, out float liftAmt) {
	warpedUv = uv;
	liftAmt = 0.0;
	if (exitP < 0.001) return 1.0;

	vec2 grid = vec2(18.0, 12.0);
	vec2 cell = floor(uv * grid);
	float n = hash21(cell);
	float n2 = hash21(cell + 7.3);

	float wave = exitP * 1.55 - uv.y * 0.9 - n * 0.38;
	float local = clamp(wave, 0.0, 1.0);
	local = 1.0 - pow(1.0 - local, 2.1);
	liftAmt = local;

	float hold = 1.0 - smoothstep(0.12, 0.9, local + (n2 - 0.5) * 0.2);
	vec2 dir = vec2(n - 0.5, 0.35 + n2 * 0.65);
	warpedUv = uv + dir * local * 0.12;
	warpedUv.y += local * 0.18;

	float spark = exp(-abs(fract(uv.x * 48.0 + n * 3.0 - exitP * 2.0) - 0.5) * 16.0);
	hold *= 1.0 - local * spark * 0.4;

	return clamp(hold, 0.0, 1.0);
}

/**
 * Locale signal rewrite — horizontal neon blade.
 * role 1 = out (alive → dead L→R), role 2 = in (dead → alive L→R).
 * Returns hold alpha; writes blade edge energy + soft UV shear.
 */
float localeSignal(
	vec2 uv,
	float p,
	float role,
	float layer,
	out vec2 warpedUv,
	out float bladeGlow,
	out float ghost
) {
	warpedUv = uv;
	bladeGlow = 0.0;
	ghost = 0.0;
	if (role < 0.5) return 1.0;
	/** Out starts solid; in starts invisible. */
	if (p < 0.001) return role < 1.5 ? 1.0 : 0.0;

	float isIn = step(1.5, role);
	float isOut = 1.0 - isIn;

	/** Contour leads assemble / trails dissolve. */
	float layerBias = mix(-0.1, 0.12, layer);
	float prog = clamp(p + layerBias * mix(1.0, -1.0, isOut), 0.0, 1.0);
	prog = easeInOutCubic(prog);

	float n = hash21(floor(uv * vec2(48.0, 22.0)));
	float nFine = hash21(uv * vec2(90.0, 40.0) + n);

	/** Blade position along X — soft staggered columns. */
	float blade = prog * 1.28 - uv.x - n * 0.1 - nFine * 0.03;
	/** Optional slight diagonal for depth. */
	blade -= (uv.y - 0.5) * 0.08;

	float hold;
	if (isOut > 0.5) {
		/** Still solid ahead of blade; dies behind. */
		hold = 1.0 - smoothstep(-0.04, 0.42, blade);
	} else {
		/** Invisible ahead; solid behind. */
		hold = smoothstep(-0.06, 0.38, blade);
	}

	/** Bright scan lip. */
	float edge = exp(-pow(blade - 0.08, 2.0) * 95.0);
	float edgeSoft = exp(-pow(blade - 0.02, 2.0) * 28.0);
	bladeGlow = max(edge, edgeSoft * 0.45);

	/** Fine horizontal data lines on the lip. */
	float lines = pow(abs(sin(uv.y * 110.0 + uTime * 14.0 + n * 6.0)), 8.0);
	bladeGlow *= 0.65 + lines * 0.7;

	/** Soft shear / chromatic settle — never tile shatter. */
	float deform = bladeGlow * 0.035 + (1.0 - hold) * 0.02 * isOut + (1.0 - hold) * 0.015 * isIn;
	warpedUv.x += (n - 0.5) * deform * 1.8;
	warpedUv.y += sin(uv.x * 28.0 + n * 4.0) * deform * 0.9;

	/** Ghost afterimage trailing the rewrite. */
	ghost = bladeGlow * mix(0.55, 0.85, isIn);

	/** Incoming fill blooms slightly after the lip; outgoing fill dies first. */
	if (layer < 0.5) {
		if (isIn > 0.5) {
			hold *= smoothstep(0.0, 0.55, hold + bladeGlow * 0.35);
		} else {
			hold *= 0.35 + 0.65 * smoothstep(0.15, 0.85, hold);
		}
	}

	return clamp(hold, 0.0, 1.0);
}

void main() {
	float appear = clamp(uAppear, 0.0, 1.0);
	if (appear < 0.004) discard;

	float am = appearMask(appear);
	if (am < 0.02) discard;

	float exitP = clamp(uExit, 0.0, 1.0);
	vec2 mosaicUv;
	float liftAmt;
	float exitHold = exitMosaic(vUv, exitP, mosaicUv, liftAmt);
	if (exitHold < 0.02) discard;

	float localeP = clamp(uLocale, 0.0, 1.0);
	float localeRole = uLocaleRole;
	vec2 localeUv;
	float bladeGlow;
	float ghost;
	float localeHold = localeSignal(
		vUv,
		localeP,
		localeRole,
		uLayer,
		localeUv,
		bladeGlow,
		ghost
	);
	if (localeHold < 0.02 && bladeGlow < 0.04) discard;

	/** Prefer locale shear while swapping; mosaic warp on contacts leave. */
	vec2 sampleUv = mix(mosaicUv, localeUv, step(0.5, localeRole));

	vec3 col = vec3(0.0);
	float alpha = 0.0;
	float travelBoost = 1.0 + bladeGlow * 1.8 + ghost * 0.6;

	if (uLayer > 0.5) {
		float across = clamp(vStrokeV, 0.0, 1.0);
		float profile = exp(-across * across * 7.5) * (1.0 - smoothstep(0.75, 1.0, across));
		float travel = strokeTravelMask(vStrokeAlong);
		float travelMix = mix(travel, max(travel, 0.55), max(exitP, bladeGlow));
		float vis = profile * travelMix * travelBoost;
		if (vis < 0.02 && bladeGlow < 0.05) discard;

		float hot = mix(0.55, 1.0, travelMix);
		col = uOutline * hot * uOutlineBoost;
		col += uCore * hot * (0.35 + uGlow * 0.5);
		col += uCore * liftAmt * 0.9;
		col += uCore * bladeGlow * (1.4 + uGlow);
		col += uOutline * ghost * 0.8;
		col *= uIntensity * (1.0 + travelMix * 0.35);
		alpha = am * max(vis * localeHold, bladeGlow * 0.85);
	} else {
		float fillOpacity = clamp(uFillOpacity, 0.0, 1.0);
		if (fillOpacity < 0.02 && bladeGlow < 0.05) discard;

		float band = 0.92 + 0.08 * sin(uTime * 0.7 + sampleUv.x * 2.0);
		col = mix(uTint, uCore, 0.55 + uFillDark * 0.2) * uIntensity * band;
		col = mix(col, uCore, liftAmt * 0.4);
		/** Signal rewrite bleaches fill toward core on the blade. */
		col = mix(col, uCore * (1.2 + uGlow * 0.4), bladeGlow * 0.75);
		col += uOutline * ghost * 0.25;
		alpha = am * fillOpacity * (0.4 + uFillDark * 0.35) * localeHold;
		alpha = max(alpha, bladeGlow * 0.35 * am);
	}

	col = mix(col, uCore, liftAmt * 0.35);

	alpha *= exitHold * (1.0 - liftAmt * 0.75);
	alpha = clamp(alpha, 0.0, 1.0);
	if (alpha < 0.02) discard;

	gl_FragColor = vec4(col, alpha);
}
`;
