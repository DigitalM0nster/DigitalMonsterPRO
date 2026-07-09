/** V-образный след за плывущей рыбой (не радиальная «капля»). */
export const oceanSwimWakeRippleGlsl = /* glsl */ `
float oceanSwimWakeRipple(vec2 surfaceXZ, vec2 rippleCenter, vec2 rippleDir, float time) {
	vec2 rel = surfaceXZ - rippleCenter;
	float along = dot(rel, rippleDir);
	float across = dot(rel, vec2(-rippleDir.y, rippleDir.x));

	float behind = smoothstep(-2.0, 3.0, along);
	float trail = (1.0 - smoothstep(6.0, 50.0, along)) * behind;
	float lateral = exp(-abs(across) * 0.1);

	float chevron = sin(along * 0.4 + abs(across) * 0.82 - time * 2.1);
	float streak = sin(along * 0.55 - time * 1.7) * exp(-abs(across) * 0.085);

	return (chevron * 0.65 + streak * 0.35) * trail * lateral * 0.55;
}
`;
