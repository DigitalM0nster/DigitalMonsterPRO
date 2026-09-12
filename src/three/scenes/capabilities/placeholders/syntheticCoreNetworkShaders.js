// Nodes and line endpoints share this deformation so their connections never detach.
const motion = /* glsl */ `
	attribute float aSeed;
	uniform float uTime;
	uniform float uAssembly;
	vec3 networkPosition(vec3 origin, float seed) {
		float spread = smoothstep(0.0, 0.8, uAssembly);
		vec3 p = origin * vec3(1.0 + spread * 0.5, 1.0 + spread * 0.42, 1.0);
		float phase = seed * 31.4;
		p += vec3(sin(uTime * 0.27 + phase), cos(uTime * 0.21 + phase * 1.3),
			sin(uTime * 0.18 + phase * 0.7)) * (0.055 + seed * 0.055);
		return p;
	}
`;

export const networkNodeVertex = motion + /* glsl */ `
	uniform float uPixelRatio;
	varying float vLight;
	void main() {
		vec4 mv = modelViewMatrix * vec4(networkPosition(position, aSeed), 1.0);
		gl_Position = projectionMatrix * mv;
		gl_PointSize = uPixelRatio * clamp((150.0 + aSeed * 90.0) / max(1.0, -mv.z), 7.0, 18.0);
		vLight = 0.65 + 0.25 * sin(uTime * 0.65 + aSeed * 40.0);
	}
`;

export const networkNodeFragment = /* glsl */ `
	varying float vLight;
	void main() {
		float r = length(gl_PointCoord - 0.5) * 2.0;
		if (r > 1.0) discard;
		float core = 1.0 - smoothstep(0.12, 0.34, r);
		float halo = exp(-r * r * 5.0) * (1.0 - smoothstep(0.65, 1.0, r));
		gl_FragColor = vec4(vec3(0.02, 0.9, 4.0), (core + halo * 0.55) * vLight);
	}
`;

export const networkLineVertex = motion + /* glsl */ `
	attribute float aAlong;
	attribute float aLength;
	attribute float aEdge;
	attribute vec3 aOther;
	attribute float aOtherSeed;
	attribute float aSide;
	uniform vec2 uViewport;
	varying float vAlong;
	varying float vDistance;
	varying float vEdge;
	varying float vSide;
	void main() {
		vAlong = aAlong;
		vDistance = aAlong * aLength;
		vEdge = aEdge;
		vSide = aSide;
		vec4 clip = projectionMatrix * modelViewMatrix * vec4(networkPosition(position, aSeed), 1.0);
		vec4 other = projectionMatrix * modelViewMatrix * vec4(networkPosition(aOther, aOtherSeed), 1.0);
		vec2 tangent = (other.xy / other.w - clip.xy / clip.w) * uViewport;
		tangent /= max(length(tangent), 0.001);
		vec2 normal = vec2(-tangent.y, tangent.x) * (1.0 - 2.0 * aAlong);
		clip.xy += normal * aSide * 2.5 / uViewport * clip.w;
		gl_Position = clip;
	}
`;

export const networkLineFragment = /* glsl */ `
	uniform float uTime;
	varying float vAlong;
	varying float vDistance;
	varying float vEdge;
	varying float vSide;
	void main() {
		float dash = abs(fract(vDistance * 24.0) - 0.5);
		float aa = max(fwidth(vDistance * 24.0), 0.04);
		float dots = 1.0 - smoothstep(0.16, 0.16 + aa, dash);
		// One short packet per connection, followed by several seconds of quiet.
		float cycle = mod(uTime * 0.24 + vEdge * 0.619, 2.4);
		float packet = exp(-pow((vAlong - cycle) * 17.0, 2.0));
		float light = 0.38 + 0.12 * sin(vEdge * 3.7 + uTime * 0.22);
		float edge = 1.0 - smoothstep(0.35, 1.0, abs(vSide));
		gl_FragColor = vec4(vec3(0.015, 0.7, 3.0), (dots * light + packet * 0.6) * edge);
	}
`;
