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
uniform vec3 uOutlineBoost;
uniform float uOutlineThreshold;
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

vec2 uvToNDC(vec2 uv) {
	float aspectRatio = uResolution.x / uResolution.y;
	return vec2(-1.0 + 2.0 * uv.x + 2.0 * uPositionOffset.x, -1.0 + 2.0 * uv.y - 2.0 * uPositionOffset.y * aspectRatio);
}

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

	vec2 totalOffset = offsetMouse + offsetVirtual1 + offsetVirtual2 + offsetVirtual3;
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

	float edgeDetection = length(vec2(dFdx(displacedColor.a), dFdy(displacedColor.a * 0.5)));
	bool isOutline = edgeDetection > uOutlineThreshold && displacedColor.a > 0.3;

	if (isOutline) {
		if (uRenderPass < 0.5) {
			discard;
		}
		vec3 outline = displacedColor.rgb * uOutlineBoost;
		gl_FragColor = vec4(outline, displacedColor.a * visible * revealAlpha * uMasterAlpha);
	} else {
		if (uRenderPass > 0.5) {
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
