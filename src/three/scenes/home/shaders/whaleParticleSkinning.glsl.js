export const whaleParticleSkinningGlsl = /* glsl */ `
uniform sampler2D uWhaleBones;
uniform float uWhaleBoneRows;
attribute vec3 aEndpointB;
attribute vec4 aSkinIndicesA;
attribute vec4 aSkinIndicesB;
attribute vec4 aSkinWeightsA;
attribute vec4 aSkinWeightsB;
attribute vec2 aEdge;

vec3 whaleBonePosition(float index, vec3 position) {
	float y = (index + 0.5) / uWhaleBoneRows;
	vec4 p = vec4(position, 1.0);
	return vec3(
		dot(texture2D(uWhaleBones, vec2(1.0 / 6.0, y)), p),
		dot(texture2D(uWhaleBones, vec2(0.5, y)), p),
		dot(texture2D(uWhaleBones, vec2(5.0 / 6.0, y)), p)
	);
}

vec3 whaleSkinEndpoint(vec3 position, vec4 indices, vec4 weights) {
	vec3 result = vec3(0.0);
	if (weights.x != 0.0) result += weights.x * whaleBonePosition(indices.x, position);
	if (weights.y != 0.0) result += weights.y * whaleBonePosition(indices.y, position);
	if (weights.z != 0.0) result += weights.z * whaleBonePosition(indices.z, position);
	if (weights.w != 0.0) result += weights.w * whaleBonePosition(indices.w, position);
	// CPU applyBoneTransform adds post-bind translation after the weighted sum.
	float correction = 1.0 - dot(weights, vec4(1.0));
	if (correction != 0.0) result += correction * whaleBonePosition(aEdge.y, vec3(0.0));
	return result;
}

vec3 whaleParticlePosition() {
	vec3 a = whaleSkinEndpoint(position, aSkinIndicesA, aSkinWeightsA);
	vec3 b = whaleSkinEndpoint(aEndpointB, aSkinIndicesB, aSkinWeightsB);
	return mix(a, b, aEdge.x);
}
`;
