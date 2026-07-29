export default /* glsl */ `
uniform float uTime;
uniform float uDistort;
uniform float uBreath;
uniform float uWaveSpeed;
uniform float uPetalCount;
uniform float uPointSize;
uniform float uPixelRatio;

attribute float aSeed;
attribute float aRadius;
attribute float aAngle;
attribute float aSize;
attribute float aColorMix;
attribute float aEdge;

varying float vRadius;
varying float vSeed;
varying float vEdge;
varying float vBright;
varying float vColorMix;

void main() {
	vSeed = aSeed;
	vRadius = aRadius;
	vBright = aSize;
	vColorMix = aColorMix;
	vEdge = clamp(aEdge, 0.0, 1.0);

	float petal = max(1.0, uPetalCount);
	float t = uTime * uWaveSpeed;

	float breath = sin(t * 0.5 + aRadius * 2.2) * uBreath;
	float armWave = sin(aAngle * petal + t * 0.7 + aSeed * 1.4);
	float ribWave = sin(aRadius * 7.5 - t + aAngle * petal * 0.35);

	float distort = uDistort * smoothstep(0.1, 0.95, aRadius);
	vec3 p = position;
	p.xy *= 1.0 + breath;
	p.z += (armWave * 0.65 + ribWave * 0.35) * distort;
	float shear = armWave * distort * 0.16;
	p.x += cos(aAngle + 1.5707963) * shear;
	p.y += sin(aAngle + 1.5707963) * shear;

	vec4 mv = modelViewMatrix * vec4(p, 1.0);
	gl_Position = projectionMatrix * mv;

	float atten = uPointSize * aSize * uPixelRatio * (200.0 / max(-mv.z, 0.35));
	float rimBoost = 1.0 + vEdge * 0.35;
	gl_PointSize = clamp(atten * rimBoost, 1.0, 22.0);
}
`;
