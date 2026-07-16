import * as THREE from "three";

const vertexShader = /* glsl */ `
varying float vViewDepth;

void main() {
	vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
	vViewDepth = -mvPosition.z;
	gl_Position = projectionMatrix * mvPosition;
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uCoreColor;
uniform float uOpacity;
uniform float uDepthNear;
uniform float uDepthFar;
uniform float uFadeNear;
uniform float uFadeFar;
uniform float uDepthPower;
uniform float uCoreMix;
uniform float uBloomBoost;
varying float vViewDepth;

void main() {
	float span = max(uDepthFar - uDepthNear, 1e-4);
	float t = clamp((vViewDepth - uDepthNear) / span, 0.0, 1.0);
	t = t * t * (3.0 - 2.0 * t);
	t = pow(t, max(uDepthPower, 0.01));

	float fade = mix(uFadeNear, uFadeFar, t);
	float nearness = 1.0 - t;
	vec3 lit = mix(uColor, uCoreColor, clamp(uCoreMix * nearness, 0.0, 1.0));
	vec3 rgb = lit * fade * max(uBloomBoost, 0.0);
	float alpha = uOpacity * clamp(fade, 0.0, 1.0);
	gl_FragColor = vec4(rgb, alpha);
}
`;

/**
 * Line/Mesh орбиты: глубинное затухание + HDR ядро под site bloom.
 */
export function createCase1RingFadeMaterial(options) {
	const {
		color,
		opacity,
		coreColor = color,
		coreMix = 0,
		bloomBoost = 1,
		depthNear = 5.2,
		depthFar = 15.5,
		fadeNear = 1.02,
		fadeFar = 0.28,
		depthPower = 1,
	} = options;

	const material = new THREE.ShaderMaterial({
		uniforms: {
			uColor: { value: color.clone() },
			uCoreColor: { value: coreColor.clone() },
			uOpacity: { value: opacity },
			uDepthNear: { value: depthNear },
			uDepthFar: { value: depthFar },
			uFadeNear: { value: fadeNear },
			uFadeFar: { value: fadeFar },
			uDepthPower: { value: depthPower },
			uCoreMix: { value: coreMix },
			uBloomBoost: { value: bloomBoost },
		},
		vertexShader,
		fragmentShader,
		transparent: true,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
		toneMapped: false,
		side: THREE.DoubleSide,
	});
	material.userData.isCase1RingFade = true;
	return material;
}

/**
 * @param {"R1" | "R2" | "R3"} layer
 */
export function resolveCase1RingLayerStyle(config, layer) {
	if (layer === "R1") {
		return {
			color: new THREE.Color(config.r1R, config.r1G, config.r1B),
			coreColor: new THREE.Color(config.r1R, config.r1G, config.r1B),
			opacity: config.r1Opacity,
			coreMix: config.r1CoreMix,
			bloomBoost: config.r1BloomBoost,
			fadeNear: config.r1FadeNear,
			fadeFar: config.r1FadeFar,
		};
	}
	if (layer === "R2") {
		return {
			color: new THREE.Color(config.r2R, config.r2G, config.r2B),
			coreColor: new THREE.Color(config.r2R, config.r2G, config.r2B),
			opacity: config.r2Opacity,
			coreMix: config.r2CoreMix,
			bloomBoost: config.r2BloomBoost,
			fadeNear: config.r2FadeNear,
			fadeFar: config.r2FadeFar,
		};
	}
	return {
		color: new THREE.Color(config.r3R, config.r3G, config.r3B),
		coreColor: new THREE.Color(config.r3CoreR, config.r3CoreG, config.r3CoreB),
		opacity: config.r3Opacity,
		coreMix: config.r3CoreMix,
		bloomBoost: config.r3BloomBoost,
		fadeNear: config.r3FadeNear,
		fadeFar: config.r3FadeFar,
	};
}

/** @param {THREE.ShaderMaterial} material */
export function applyCase1RingFadeUniforms(material, config, layer) {
	const uniforms = material?.uniforms;
	if (!uniforms?.uColor) {
		return;
	}
	const style = resolveCase1RingLayerStyle(config, layer);
	uniforms.uColor.value.copy(style.color);
	uniforms.uCoreColor.value.copy(style.coreColor);
	uniforms.uOpacity.value = style.opacity;
	uniforms.uCoreMix.value = style.coreMix;
	uniforms.uBloomBoost.value = style.bloomBoost;
	uniforms.uFadeNear.value = style.fadeNear;
	uniforms.uFadeFar.value = style.fadeFar;
	uniforms.uDepthNear.value = config.depthNear;
	uniforms.uDepthFar.value = config.depthFar;
	uniforms.uDepthPower.value = config.depthPower;
}
