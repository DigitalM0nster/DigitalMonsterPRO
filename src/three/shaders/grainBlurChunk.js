/** Общий grain-blur (post-process blit + партиклы кита). */
export const grainBlurGlsl = /* glsl */ `
vec2 grainBlurOffset(vec2 uv, float radius) {
	if (radius < 0.0000001) {
		return vec2(0.0);
	}

	float horizontalShift =
		(5.0 * fract(sin(dot(uv.xy, vec2(12.9898, 78.233))) * 43758.5453) - 2.5) * radius;
	float verticalShift =
		(5.0 * fract(sin(dot(uv.yx, vec2(12.9898, 78.233))) * 43758.5453) - 2.5) * radius;

	return vec2(horizontalShift, verticalShift);
}
`;
