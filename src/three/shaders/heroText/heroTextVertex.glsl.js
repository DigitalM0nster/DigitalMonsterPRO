export const heroTextVertexShader = /* glsl */ `
uniform vec2 uPositionOffset;
uniform vec2 uResolution;

varying vec2 vUv;

void main() {
	vUv = uv;
	float aspectRatio = uResolution.x / uResolution.y;
	vec3 pos = position;
	pos.x += 2.0 * uPositionOffset.x;
	pos.y -= 2.0 * uPositionOffset.y * aspectRatio;

	gl_Position = vec4(pos.x, pos.y, 1.0, 1.0);
}
`;
