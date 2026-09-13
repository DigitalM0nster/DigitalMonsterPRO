import { Effect, BlendFunction } from "postprocessing";

// Applied after sampling the actual HalfFloat texture, never before its GPU conversion.
const finiteInputGlsl = /* glsl */ `
vec4 dmFiniteBloomInput(vec4 sampled) {
	bvec4 isNan = notEqual(sampled, sampled);
	bvec4 outsideHalfFloat = greaterThan(abs(sampled), vec4(65504.0));
	if (any(isNan) || any(outsideHalfFloat)) sampled = vec4(0.0);
	float alpha = clamp(sampled.a, 0.0, 1.0);
	return vec4(clamp(sampled.rgb, vec3(0.0), vec3(64.0)) * alpha, alpha);
}
`;

/** SRC replaces RGBA directly; NORMAL/SET's mix can preserve NaN through raw * 0. */
export function createFiniteBloomInputEffect(enabled) {
	return new Effect("FiniteBloomInput", /* glsl */ `
uniform float finiteInputEnabled;
${finiteInputGlsl}
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
	outputColor = finiteInputEnabled > 0.5 ? dmFiniteBloomInput(inputColor) : inputColor;
}
`, { blendFunction: BlendFunction.SRC, uniforms: new Map([["finiteInputEnabled", enabled]]) });
}

const INPUT_READ = /\bvec4\s+texel\s*=\s*texture2D\s*\(\s*inputBuffer\s*,\s*vUv\s*\)\s*;/g;
const hasSingleInputRead = source => typeof source === "string" && [...source.matchAll(INPUT_READ)].length === 1;

/** A bounded hook for the installed LuminanceMaterial. Unrecognized sources retain legacy copy. */
export function attachFiniteLuminanceInput(material, enabled) {
	const state = { ready: false };
	if (!hasSingleInputRead(material?.fragmentShader)) return state;
	const previous = material.onBeforeCompile;
	const previousKey = material.customProgramCacheKey.bind(material);
	material.onBeforeCompile = function (shader, renderer) {
		state.ready = false;
		previous.call(this, shader, renderer);
		if (!hasSingleInputRead(shader.fragmentShader)) return;
		shader.uniforms.dmFiniteInputEnabled = enabled;
		shader.fragmentShader = `uniform float dmFiniteInputEnabled;\n${finiteInputGlsl}\n`
			+ shader.fragmentShader.replace(INPUT_READ,
				"vec4 texel=texture2D(inputBuffer,vUv);if(dmFiniteInputEnabled>0.5)texel=dmFiniteBloomInput(texel);");
		state.ready = true;
	};
	material.customProgramCacheKey = () => `${previousKey()}|finite-bloom-input-v1`;
	return state;
}
