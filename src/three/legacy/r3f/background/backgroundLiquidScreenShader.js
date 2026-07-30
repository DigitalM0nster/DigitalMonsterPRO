/**
 * Тот же визуал, что liquid + border blur в postprocessing, но один ShaderMaterial (без composer).
 */
export const backgroundScreenVertexShader = /* glsl */ `
varying vec2 vUv;

void main() {
	vUv = uv;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const backgroundScreenFragmentShader = /* glsl */ `
uniform sampler2D inputTexture;
uniform float distortionPower;
uniform float liquidScale;
uniform float brightness;
uniform vec3 distortionColor;
uniform vec2 iResolution;
uniform float iTime;

uniform float borderBlurEnabled;
uniform float blurRadius;
uniform float centerWidth;
uniform float centerHeight;
uniform float borderRadius;

varying vec2 vUv;

float rand(vec2 p) {
	return fract(sin(dot(p, vec2(12.543, 514.123))) * 4732.12);
}

float noise(vec2 p) {
	vec2 f = smoothstep(0.0, 1.0, fract(p));
	vec2 i = floor(p);
	float a = rand(i);
	float b = rand(i + vec2(1.0, 0.0));
	float c = rand(i + vec2(0.0, 1.0));
	float d = rand(i + vec2(1.0, 1.0));
	return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void applyLiquidUv(inout vec2 uv) {
	vec2 center = vec2(0.5);
	uv = center + (uv - center) * vec2(liquidScale, liquidScale);

	float aspectX = iResolution.x / iResolution.y;
	float aspectY = 1.0;
	if (aspectX > 1.0) {
		aspectY = 1.0 / aspectX;
		aspectX = 1.0;
	}
	float xOffset = (1.0 - aspectX) * 0.5;
	float yOffset = (1.0 - aspectY) * 0.5;
	uv.x = uv.x * aspectX + xOffset;
	uv.y = uv.y * aspectY + yOffset;
	uv += distortionPower * vec2(noise(uv * 25.0 + iTime), noise(uv * 35.0 + iTime));
}

void applyBorderBlurUv(inout vec2 uv) {
	vec2 center = vec2(0.5, 0.5);
	vec2 size = vec2(centerWidth, centerHeight);
	vec2 minBounds = center - size * 0.5;
	vec2 maxBounds = center + size * 0.5;

	if (uv.x < minBounds.x || uv.x > maxBounds.x || uv.y < minBounds.y || uv.y > maxBounds.y) {
		vec2 nearestCorner = clamp(uv, minBounds, maxBounds);
		if (distance(uv, nearestCorner) > borderRadius) {
			float horizontalShift =
				(5.0 * fract(sin(dot(uv.xy, vec2(12.9898, 78.233))) * 43758.5453) - 2.5) * blurRadius;
			float verticalShift =
				(5.0 * fract(sin(dot(uv.yx, vec2(12.9898, 78.233))) * 43758.5453) - 2.5) * blurRadius;
			uv += vec2(horizontalShift, verticalShift);
		}
	}
}

void main() {
	vec2 uv = vUv;
	if (borderBlurEnabled > 0.5) {
		applyBorderBlurUv(uv);
	}
	applyLiquidUv(uv);

	vec4 color = texture2D(inputTexture, uv);
	color.rgb *= distortionColor * brightness;
	gl_FragColor = color;
}
`;
