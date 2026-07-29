/** About epic title — letter fill / stroke. Exit mosaic is fragment-only (no per-vert lift). */
export const aboutEpicTextVertexShader = /* glsl */ `
attribute float aEdgeDist;

varying vec2 vUv;
varying float vStrokeAlong;
varying float vStrokeV;

uniform vec4 uBounds;
uniform vec2 uPointer;
uniform float uParallax;
uniform float uAppear;
uniform float uLayer;

void main() {
	vStrokeV = uv.y;
	vStrokeAlong = uv.x;

	float dx = max(uBounds.y - uBounds.x, 1e-5);
	float dz = max(uBounds.w - uBounds.z, 1e-5);
	/** Planar letter UV for mosaic / fill. */
	vUv = vec2(
		(position.x - uBounds.x) / dx,
		1.0 - (position.z - uBounds.z) / dz
	);

	vec3 pos = position;
	float para = uParallax * (0.35 + 0.65 * uAppear);
	pos.x += uPointer.x * para;
	pos.z += uPointer.y * para;
	pos.y += uLayer * 0.0012;

	gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;
