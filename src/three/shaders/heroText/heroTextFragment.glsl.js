import { heroPageRevealFunctionsGlsl, heroPageRevealUniformsGlsl } from "./heroPageReveal.glsl.js";

export const heroTextFragmentShader = /* glsl */ `
uniform sampler2D uTexture;
${heroPageRevealUniformsGlsl}
uniform vec2 uMouse;
uniform vec2 uVirtualCursor1;
uniform vec2 uVirtualCursor2;
uniform vec2 uVirtualCursor3;
uniform vec2 uPlaneSize;
uniform vec2 uResolution;
uniform float uTime;
uniform float uGlowTime;
#ifdef MEDIUM_TITLE_COVERAGE
uniform vec3 uMediumGlowColor;
uniform float uMediumFill, uMediumGlow, uMediumGlowWidth, uMediumEdgeSoftness;
uniform float uMediumMotion, uMediumMotionSpeed;
#endif
uniform float uProgress;
uniform float uCharCount;
uniform vec2 uPositionOffset;
uniform float uInfluenceRadiusNDC;
uniform float uCharWidthNDC;
uniform float uCharHeightNDC;
uniform float uIsAppearing;
uniform float uFillBrightness;
uniform float uMasterAlpha;
uniform float uGlitchStrength;
#define CLICK_WAVE_COUNT 8
uniform vec2 uClickPositions[CLICK_WAVE_COUNT];
uniform float uClickStrengths[CLICK_WAVE_COUNT];
uniform float uClickAges[CLICK_WAVE_COUNT];
uniform float uClickRadiusNDC;
uniform float uClickWaveSpeedNDC;
uniform float uClickWaveWidthNDC;
uniform float uClickOffset;
uniform float uClickMaxStrength;
uniform vec3 uOutlineBoost;
uniform float uOutlineThreshold;
uniform float uOutlinePixelScale;
uniform vec3 uFillGradientTop;
uniform vec3 uFillGradientBottom;
uniform float uTitleShimmer;
uniform float uRenderPass;
varying vec2 vUv;
varying float vOrder;
varying float vOrderAppear;
varying vec2 vNDC;

${heroPageRevealFunctionsGlsl}

float random(vec2 st) {
	return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

vec2 calculateCursorOffsetNDC(vec2 cursorNDC, vec2 fragmentNDC, float radiusNDC, float aspectRatio, vec2 randomDirection) {
	vec2 delta = cursorNDC - fragmentNDC;
	float d = length(vec2(delta.x * aspectRatio * 0.75, delta.y * 0.75));
	vec2 offset = vec2(0.0);
	if (d < radiusNDC) {
		float influence = (radiusNDC - d) / radiusNDC;
		float baseOffset = 0.0015 * uGlitchStrength;
		float dynamicOffset = 0.0015 * abs(sin(uTime * 2.0)) * uGlitchStrength;
		offset = randomDirection * influence * (baseOffset + dynamicOffset);
	}
	return offset;
}

vec2 calculateVirtualCursorOffsetNDC(vec2 cursorNDC, vec2 fragmentNDC, float bandHalfWidth, float bandHalfHeight, vec2 randomDirection) {
	vec2 delta = cursorNDC - fragmentNDC;
	float influenceX = 1.0 - smoothstep(0.0, bandHalfWidth, abs(delta.x));
	float inBandY = 1.0 - step(bandHalfHeight, abs(delta.y));
	float influence = influenceX * inBandY;
	float baseOffset = 0.0015 * uGlitchStrength;
	float dynamicOffset = 0.0015 * abs(sin(uTime * 2.0)) * uGlitchStrength;
	return randomDirection * influence * (baseOffset + dynamicOffset);
}

float calculateClickWaveInfluenceNDC(vec2 clickNDC, vec2 fragmentNDC, float aspectRatio, float strength, float age) {
	vec2 delta = clickNDC - fragmentNDC;
	float d = length(vec2(delta.x * aspectRatio * 0.75, delta.y * 0.75));
	float core = 1.0 - smoothstep(0.0, uClickRadiusNDC, d);
	float waveFront = age * uClickWaveSpeedNDC;
	float ring = 1.0 - smoothstep(0.0, uClickWaveWidthNDC, abs(d - waveFront));
	float influence = max(core * 0.62, ring);
	return influence * strength;
}

vec2 uvToNDC(vec2 uv) {
	float aspectRatio = uResolution.x / uResolution.y;
	return vec2(-1.0 + 2.0 * uv.x + 2.0 * uPositionOffset.x, -1.0 + 2.0 * uv.y - 2.0 * uPositionOffset.y * aspectRatio);
}

#ifdef LOW_TITLE_LOCAL
varying vec4 vGlyphBounds;
float lowTitleInk(vec2 uv) {
	if (any(lessThan(uv, vGlyphBounds.xy)) || any(greaterThan(uv, vGlyphBounds.zw))) return 0.0;
	return texture2D(uTexture, uv).a;
}
#endif

void main() {
	vec2 sampleUv = vUv;
	float revealAlpha = heroPageApplyReveal(sampleUv);
	if (revealAlpha <= 0.0) {
		discard;
	}

	float cubeSize = 0.005;
	vec2 cubeIndex = floor(sampleUv / cubeSize);
	float randomAngle = random(cubeIndex) * 6.283185 + 2.0;
	vec2 randomDirection = vec2(cos(randomAngle), sin(randomAngle));

	float aspectRatio = uResolution.x / uResolution.y;
	vec2 cursorNDC = 2.0 * uMouse - 1.0;

	vec2 offsetMouse = calculateCursorOffsetNDC(cursorNDC, vNDC, uInfluenceRadiusNDC, aspectRatio, randomDirection);
	float bandHalfW = uCharWidthNDC * 1.25;
	float bandHalfH = uCharHeightNDC * 0.5;
	vec2 offsetVirtual1 = calculateVirtualCursorOffsetNDC(uvToNDC(uVirtualCursor1), vNDC, bandHalfW, bandHalfH, randomDirection);
	vec2 offsetVirtual2 = calculateVirtualCursorOffsetNDC(uvToNDC(uVirtualCursor2), vNDC, bandHalfW, bandHalfH, randomDirection);
	vec2 offsetVirtual3 = calculateVirtualCursorOffsetNDC(uvToNDC(uVirtualCursor3), vNDC, bandHalfW, bandHalfH, randomDirection);
	float clickInfluence = 0.0;
	for (int i = 0; i < CLICK_WAVE_COUNT; i++) {
		clickInfluence += calculateClickWaveInfluenceNDC(
			2.0 * uClickPositions[i] - 1.0,
			vNDC,
			aspectRatio,
			uClickStrengths[i],
			uClickAges[i]
		);
	}
	vec2 offsetClick = randomDirection * uClickOffset * min(clickInfluence, uClickMaxStrength);

	vec2 totalOffset = offsetMouse + offsetVirtual1 + offsetVirtual2 + offsetVirtual3 + offsetClick;
	vec2 autoOffset = vec2(sin(uTime * 0.5 + sampleUv.y * 5.0) * 0.00115 * uGlitchStrength, 0.0);
	vec2 offset = totalOffset + autoOffset;

	vec2 displacedUV = clamp(sampleUv + offset, vec2(0.0), vec2(1.0));
	vec4 displacedColor = texture2D(uTexture, displacedUV);

	float maxOrder = max(uCharCount - 1.0, 0.0);
	float fadeWidth = 1.0;
	float order = (uIsAppearing > 0.5) ? vOrderAppear : vOrder;
	float visible = 1.0;
	if (uRevealUsePartReveal < 0.5) {
		if (uIsAppearing > 0.5) {
			float C = -fadeWidth + uProgress * (maxOrder + 2.0 * fadeWidth);
			visible = 1.0 - smoothstep(C - fadeWidth, C + fadeWidth, order);
		} else {
			float threshold = (1.0 - uProgress) * (maxOrder + fadeWidth);
			visible = smoothstep(threshold - fadeWidth, threshold + fadeWidth, order);
		}
	}
	float alpha = displacedColor.a * visible * revealAlpha * uMasterAlpha;
	// Slow travelling light, shared by every tier. Glyph positions/fill stay put.
	float lightTravel = 0.92 + 0.16 * (0.5 + 0.5 * sin(displacedUV.x * 19.0 + displacedUV.y * 8.0 - uGlowTime * 0.72));

#ifdef LOW_TITLE_LOCAL
	// Local halo only on the title quads. The fill samples the clean atlas;
	// no fullscreen bloom, canvas repaint or blurred text fill is needed.
	if (uRenderPass < 0.5) {
		gl_FragColor = vec4(vec3(0.87, 0.92, 1.0), alpha);
	} else {
		vec2 dx = dFdx(vUv);
		vec2 dy = dFdy(vUv);
		float halo = 0.0;
		float weight = 0.0;
		for (int x = -2; x <= 2; x++) {
			for (int y = -2; y <= 2; y++) {
				float w = exp(-float(x*x+y*y) * 0.38);
				halo += lowTitleInk(vUv + offset + (float(x) * dx + float(y) * dy) * 3.2) * w;
				weight += w;
			}
		}
		halo /= weight;
		gl_FragColor = vec4(vec3(0.34, 0.46, 1.0), halo * 1.8 * lightTravel * visible * revealAlpha * uMasterAlpha);
	}
	return;
#endif

#ifdef MEDIUM_TITLE_COVERAGE
	// Resolve four High-sized subpixels inside this ONE scene pixel. This is
	// coverage antialiasing, not a halo/blur kernel outside the glyph boundary.
	vec2 quarterPixel = vec2(0.25) / uResolution;
	vec4 a = vec4(
		texture2D(uTexture, displacedUV + vec2(-quarterPixel.x, -quarterPixel.y)).a,
		texture2D(uTexture, displacedUV + vec2( quarterPixel.x, -quarterPixel.y)).a,
		texture2D(uTexture, displacedUV + vec2(-quarterPixel.x,  quarterPixel.y)).a,
		texture2D(uTexture, displacedUV + vec2( quarterPixel.x,  quarterPixel.y)).a
	);
	// The same x/y derivative pairs as a High 2x2 fragment quad.
	vec2 dx = vec2(a.y - a.x, a.w - a.z);
	vec2 dy = vec2(a.z - a.x, a.w - a.y) * 0.5;
	vec4 edge = vec4(length(vec2(dx.x, dy.x)), length(vec2(dx.x, dy.y)),
		length(vec2(dx.y, dy.x)), length(vec2(dx.y, dy.y)));
	// Smooth the edge classification, keeping fill/emission complementary.
	// This does not spread a blur outside the prepared glyph coverage.
	float threshold = uOutlineThreshold / uMediumGlowWidth;
	vec4 outlineMask = smoothstep(vec4(threshold - uMediumEdgeSoftness), vec4(threshold + uMediumEdgeSoftness), edge)
		* smoothstep(vec4(0.3 - uMediumEdgeSoftness), vec4(0.3 + uMediumEdgeSoftness), a);
	bool lightPass = uRenderPass > 0.5;
	float coverage = dot(a * (lightPass ? outlineMask : vec4(1.0) - outlineMask), vec4(0.25));
	if (coverage <= 0.0) discard;
	vec3 fill = mix(uFillGradientBottom, uFillGradientTop, clamp(displacedUV.y, 0.0, 1.0));
	float shimmer = uTitleShimmer * sin(uTime * 1.35 + displacedUV.x * 48.0 + displacedUV.y * 12.0);
	float mediumTravel = 1.0 + uMediumMotion * sin(displacedUV.x * 19.0 + displacedUV.y * 8.0 - uGlowTime * uMediumMotionSpeed);
	vec3 baseColor = min((fill * uFillBrightness + shimmer) * uMediumFill, vec3(1.0));
	// Turning glow off restores the ordinary fill, without holes in its edges.
	vec3 color = lightPass ? max(baseColor, uMediumGlowColor * uMediumGlow * mediumTravel) : baseColor;
	gl_FragColor = vec4(color, coverage * visible * revealAlpha * uMasterAlpha);
	return;
#endif

	float edgeDetection = length(vec2(dFdx(displacedColor.a), dFdy(displacedColor.a * 0.5))) * uOutlinePixelScale;
	bool isOutline = edgeDetection > uOutlineThreshold && displacedColor.a > 0.3;

	if (isOutline && uRenderPass < 1.5) {
		if (uRenderPass < 0.5) {
			discard;
		}
		vec3 outline = displacedColor.rgb * uOutlineBoost * lightTravel;
		gl_FragColor = vec4(outline, displacedColor.a * visible * revealAlpha * uMasterAlpha);
	} else {
		if (uRenderPass > 0.5 && uRenderPass < 1.5) {
			discard;
		}
		float gradT = clamp(displacedUV.y, 0.0, 1.0);
		vec3 fillColor = mix(uFillGradientBottom, uFillGradientTop, gradT);
		float shimmer = uTitleShimmer * sin(uTime * 1.35 + displacedUV.x * 48.0 + displacedUV.y * 12.0);
		fillColor = min(fillColor * uFillBrightness + shimmer, vec3(1.0));
		gl_FragColor = vec4(fillColor, alpha);
	}
}
`;
