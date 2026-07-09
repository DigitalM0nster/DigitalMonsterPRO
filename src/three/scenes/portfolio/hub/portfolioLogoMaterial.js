import * as THREE from "three";
import { portfolioHubPlatesConfig } from "./portfolioHubConfig.js";
import { portfolioHubLogoConfig } from "./portfolioHubLogoConfig.js";
import { DEFAULT_LOGO_ACCENT } from "./projectsData.js";
/** Размер плоскины логотипа в world-единицах (как PlaneGeometry). */
export function getLogoPlaneSizeForAspect(textureAspect) {
	const { plateSize } = portfolioHubPlatesConfig;
	const maxSize = plateSize * 0.72;
	const aspect = Math.max(textureAspect, 0.001);

	if (aspect >= 1) {
		return new THREE.Vector2(maxSize, maxSize / aspect);
	}

	return new THREE.Vector2(maxSize * aspect, maxSize);
}

const vertexShader = /* glsl */ `
varying vec2 vUv;

void main() {
	vUv = uv;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = /* glsl */ `
uniform sampler2D map;
uniform float opacity;
uniform float blur;
uniform float bloomBoost;
uniform vec3 channelBoost;
uniform vec3 accentTargetColor;
uniform float accentTolerance;
uniform float accentEnabled;
uniform vec2 blurStep;
uniform float revealProgress;
uniform float revealLinear;
uniform float revealEnter;
uniform float partSize;
uniform vec2 logoPlaneSize;
uniform float revealSeed;
uniform float shiftRatio;
uniform float dropMin;
uniform float dropMax;
uniform float usePartReveal;

varying vec2 vUv;

vec4 sampleLogo(vec2 uv) {
	if (blur < 0.001) {
		return texture2D(map, uv);
	}

	vec4 sum = vec4(0.0);
	float weightSum = 0.0;

	for (float x = -2.0; x <= 2.0; x += 1.0) {
		for (float y = -2.0; y <= 2.0; y += 1.0) {
			vec2 offset = vec2(x, y) * blurStep * blur;
			float weight = 1.0 - length(vec2(x, y)) * 0.12;
			vec4 sampleColor = texture2D(map, uv + offset);
			sum += sampleColor * weight;
			weightSum += weight;
		}
	}

	return sum / max(weightSum, 0.0001);
}

float hash21(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}

float easeOutCubic(float t) {
	float c = clamp(t, 0.0, 1.0);
	return 1.0 - pow(1.0 - c, 3.0);
}

float easeInOutCubic(float t) {
	float c = clamp(t, 0.0, 1.0);
	return c < 0.5
		? 4.0 * c * c * c
		: 1.0 - pow(-2.0 * c + 2.0, 3.0) / 2.0;
}

void main() {
	if (revealProgress <= 0.0) {
		discard;
	}

	vec2 sampleUv = vUv;
	float buildT = easeInOutCubic(revealLinear);
	float riseT = easeOutCubic(buildT);
	float alphaT;

	if (revealEnter > 0.5) {
		alphaT = buildT;
	} else {
		alphaT = revealProgress;
	}

	if (usePartReveal > 0.5) {
		float cellW = partSize / max(logoPlaneSize.x, 0.001);
		float cellH = partSize / max(logoPlaneSize.y, 0.001);
		vec2 cellId = vec2(floor(vUv.x / cellW), floor(vUv.y / cellH));
		vec2 seedOffset = vec2(revealSeed, revealSeed * 1.37);

		float shiftRoll = hash21(cellId + seedOffset);
		if (shiftRoll < shiftRatio) {
			float dropRoll = hash21(cellId + seedOffset * 2.11 + vec2(5.1, 9.3));
			float dropUv = mix(dropMin, dropMax, dropRoll) / max(logoPlaneSize.y, 0.001);
			sampleUv.y += dropUv * (1.0 - riseT);
		}
	}

	if (sampleUv.x < 0.0 || sampleUv.x > 1.0 || sampleUv.y < 0.0 || sampleUv.y > 1.0) {
		discard;
	}

	vec4 tex = sampleLogo(sampleUv);

	if (tex.a < 0.001) {
		discard;
	}

	vec3 c = tex.rgb;

	if (accentEnabled > 0.5) {
		float dist = length(c - accentTargetColor);
		float accentMask = 1.0 - smoothstep(0.0, accentTolerance, dist);
		c *= mix(vec3(1.0), channelBoost, accentMask);
	}

	vec3 rgb = c * bloomBoost;
	float alpha = tex.a * opacity * alphaT;

	if (alpha < 0.0001) {
		discard;
	}

	gl_FragColor = vec4(rgb, alpha);
}
`;

function getRevealUniformDefaults(logoPlaneSize) {
	const cfg = portfolioHubLogoConfig.reveal;
	return {
		partSize: cfg.partSize ?? 0.075,
		shiftRatio: cfg.shiftRatio ?? 0.35,
		dropMin: cfg.dropMin ?? 0.35,
		dropMax: cfg.dropMax ?? 0.65,
		usePartReveal: cfg.enabled !== false ? 1 : 0,
		logoPlaneSize,
	};
}

/** ShaderMaterial логотипа на плите хаба (bloom через HDR-яркость в rgb). */
export function createPortfolioLogoMaterial(texture, options = {}) {
	const opacity = options.opacity ?? 1;
	const blur = options.blur ?? 0;
	const bloomBoost = options.bloomBoost ?? 1;
	const accent = options.accent ?? DEFAULT_LOGO_ACCENT;
	const revealSeed = options.revealSeed ?? 0;

	const width = texture.image?.width || 1024;
	const height = texture.image?.height || 512;
	const logoPlaneSize = options.logoPlaneSize?.clone?.() ?? getLogoPlaneSizeForAspect(width / height);
	const revealDefaults = getRevealUniformDefaults(logoPlaneSize);

	const partReveal = options.partReveal !== false && portfolioHubLogoConfig.reveal.enabled !== false;

	const material = new THREE.ShaderMaterial({
		name: "PortfolioLogoMaterial",
		uniforms: {
			map: { value: texture },
			opacity: { value: opacity },
			blur: { value: blur },
			bloomBoost: { value: bloomBoost },
			channelBoost: {
				value: new THREE.Vector3(
					accent.channelBoost[0],
					accent.channelBoost[1],
					accent.channelBoost[2],
				),
			},
			accentTargetColor: {
				value: new THREE.Vector3(
					accent.targetColor[0],
					accent.targetColor[1],
					accent.targetColor[2],
				),
			},
			accentTolerance: { value: accent.tolerance },
			accentEnabled: { value: accent.enabled ? 1 : 0 },
			blurStep: { value: new THREE.Vector2(1 / width, 1 / height) },
			revealProgress: { value: 0 },
			revealLinear: { value: 0 },
			revealEnter: { value: 0 },
			partSize: { value: revealDefaults.partSize },
			logoPlaneSize: { value: logoPlaneSize.clone() },
			revealSeed: { value: revealSeed },
			shiftRatio: { value: revealDefaults.shiftRatio },
			dropMin: { value: revealDefaults.dropMin },
			dropMax: { value: revealDefaults.dropMax },
			usePartReveal: { value: partReveal ? 1 : 0 },
		},
		vertexShader,
		fragmentShader,
		transparent: true,
		depthTest: true,
		depthWrite: false,
		fog: false,
		side: THREE.DoubleSide,
		toneMapped: false,
	});

	if (options.polygonOffset) {
		material.polygonOffset = true;
		material.polygonOffsetFactor = options.polygonOffset;
		material.polygonOffsetUnits = options.polygonOffset;
	}

	return material;
}

export function applyLogoAccent(uniforms, accent = DEFAULT_LOGO_ACCENT) {
	const channelBoost = accent.channelBoost ?? [1, 1, 1];
	const targetColor = accent.targetColor ?? [1, 1, 1];
	uniforms.channelBoost.value.set(channelBoost[0], channelBoost[1], channelBoost[2]);
	uniforms.accentTargetColor.value.set(targetColor[0], targetColor[1], targetColor[2]);
	uniforms.accentTolerance.value = accent.tolerance ?? 0.35;
	uniforms.accentEnabled.value = accent.enabled ? 1 : 0;
}

/** @deprecated */
export function applyLogoChannelBoost(uniforms, channelBoost) {
	applyLogoAccent(uniforms, {
		enabled: true,
		targetColor: [1, 1, 1],
		tolerance: 1,
		channelBoost: channelBoost ?? [1, 1, 1],
	});
}
export function applyLogoRevealConfig(uniforms, logoPlaneSize, revealSeed) {
	const cfg = portfolioHubLogoConfig.reveal;
	uniforms.partSize.value = cfg.partSize ?? 0.075;
	uniforms.shiftRatio.value = cfg.shiftRatio ?? 0.35;
	uniforms.dropMin.value = cfg.dropMin ?? 0.35;
	uniforms.dropMax.value = cfg.dropMax ?? 0.65;
	uniforms.usePartReveal.value = cfg.enabled !== false ? 1 : 0;
	if (logoPlaneSize) {
		uniforms.logoPlaneSize.value.copy(logoPlaneSize);
	}
	if (revealSeed !== undefined) {
		uniforms.revealSeed.value = revealSeed;
	}
}

/** @deprecated */
export const applyLogoBrickConfig = applyLogoRevealConfig;
