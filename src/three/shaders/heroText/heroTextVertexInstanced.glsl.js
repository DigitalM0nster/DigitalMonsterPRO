export const heroTextVertexInstancedShader = /* glsl */ `
uniform vec2 uPositionOffset;
uniform vec2 uResolution;

attribute vec3 instancePosition;
attribute vec2 instanceScale;
attribute vec2 instanceUvOffset;
attribute vec2 instanceUvScale;
attribute float instanceOrder;
attribute float instanceOrderAppear;

varying vec2 vUv;
varying float vOrder;
varying float vOrderAppear;
varying vec2 vNDC;

void main() {
	vec3 p = vec3(
		instancePosition.x + position.x * instanceScale.x,
		instancePosition.y + position.y * instanceScale.y,
		instancePosition.z
	);
	float aspectRatio = uResolution.x / uResolution.y;
	vec2 ndc = vec2(p.x + 2.0 * uPositionOffset.x, p.y - 2.0 * uPositionOffset.y * aspectRatio);
	gl_Position = vec4(ndc.x, ndc.y, 1.0, 1.0);

	vNDC = ndc;
	vUv = instanceUvOffset + uv * instanceUvScale;
	vOrder = instanceOrder;
	vOrderAppear = instanceOrderAppear;
}
`;
