export default /* glsl */ `
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uOpacity;
uniform float uGlowBoost;
uniform float uTime;
uniform sampler2D uMap;

varying float vRadius;
varying float vSeed;
varying float vEdge;
varying float vBright;
varying float vColorMix;

void main() {
	vec2 uv = gl_PointCoord;
	float mask = texture2D(uMap, uv).a;
	if (mask < 0.04) discard;

	float tip = smoothstep(0.55, 0.98, vRadius);
	float tipDim = 1.0 - tip * 0.45;
	float coreFade = smoothstep(0.03, 0.14, vRadius);
	float spark = 0.9 + 0.1 * sin(uTime * 10.0 + vSeed * 40.0);
	float rim = pow(clamp(vEdge, 0.0, 1.0), 1.35);
	float intensity = (0.28 + rim * 1.55) * tipDim * coreFade * spark * mask;
	intensity *= mix(0.9, 1.15, clamp(vBright, 0.0, 1.5));
	intensity *= max(0.2, uGlowBoost);

	float mixAmt = clamp(vColorMix * 0.55 + rim * 0.55 + vSeed * 0.08, 0.0, 1.0);
	vec3 col = mix(uColorA, uColorB, mixAmt);

	float alpha = clamp(uOpacity * intensity, 0.0, 1.0);
	gl_FragColor = vec4(col * intensity, alpha);
}
`;
