import * as THREE from "three";
import { grainBlurGlsl } from "../../shaders/grainBlurChunk.js";

/** Linear HDR background + straight-alpha models, in one opaque RT draw. */
export function createSceneLayerCompositeMaterial() {
	return new THREE.ShaderMaterial({
		uniforms: {
			backgroundMap: { value: null },
			modelsMap: { value: null },
			grainBlurEnabled: { value: 0 },
			grainBlurRadius: { value: 0 },
		},
		vertexShader: /* glsl */ `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = vec4(position.xy, 0.0, 1.0);
}`,
		fragmentShader: /* glsl */ `
${grainBlurGlsl}
uniform sampler2D backgroundMap;
uniform sampler2D modelsMap;
uniform float grainBlurEnabled;
uniform float grainBlurRadius;
varying vec2 vUv;
void main() {
	vec2 modelUv = vUv;
	if (grainBlurEnabled > 0.5) modelUv += grainBlurOffset(vUv, grainBlurRadius);
	vec4 models = texture2D(modelsMap, modelUv);
	vec3 background = texture2D(backgroundMap, vUv).rgb;
	// Same source-alpha-over-opaque-background blend as the separate draws.
	gl_FragColor = vec4(models.rgb * models.a + background * (1.0 - models.a), 1.0);
}`,
		depthTest: false,
		depthWrite: false,
		toneMapped: false,
		blending: THREE.NoBlending,
	});
}
