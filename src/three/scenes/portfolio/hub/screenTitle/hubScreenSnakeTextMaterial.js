import * as THREE from "three";
import { getPortfolioHubGlitchConfig } from "@/three/scenes/portfolio/hub/portfolioHubGlitchConfig.js";

const vertexShader = /* glsl */ `
varying vec2 vUv;

void main() {
	vUv = uv;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * Glitch-змейка: canvas даёт форму (alpha), цвет и bloom — из uniform'ов.
 * Как hero: uSnakeColor * uSnakeBloomBoost → HDR для site bloom (threshold ≈ 1).
 */
const fragmentShader = /* glsl */ `
uniform sampler2D map;
uniform float uSnakeBloomBoost;
uniform vec3 uSnakeColor;
uniform float opacity;

varying vec2 vUv;

void main() {
	vec4 tex = texture2D(map, vUv);

	if (tex.a <= 0.001) {
		discard;
	}

	vec3 rgb = uSnakeColor * uSnakeBloomBoost;
	gl_FragColor = vec4(rgb, tex.a * opacity);
}
`;

const HUD_SNAKE_PROFILE = () => getPortfolioHubGlitchConfig();

function createSnakeUniforms(profile = HUD_SNAKE_PROFILE()) {
	return {
		uSnakeBloomBoost: { value: profile.snakeBloomBoost ?? 3.2 },
		uSnakeColor: { value: new THREE.Color(profile.snakeLetterColor ?? "#00ccff") },
		opacity: { value: 1 },
	};
}

export function createHubScreenSnakeTextMaterial(texture) {
	return new THREE.ShaderMaterial({
		uniforms: {
			map: { value: texture },
			...createSnakeUniforms(),
		},
		vertexShader,
		fragmentShader,
		transparent: true,
		depthTest: false,
		depthWrite: false,
		toneMapped: false,
		side: THREE.DoubleSide,
	});
}

/** Цвет + HDR-множитель bloom (dev-панель и конфиг). */
export function applyHubScreenSnakeUniforms(material, cfg = HUD_SNAKE_PROFILE()) {
	const uniforms = material?.uniforms;
	if (!uniforms?.uSnakeBloomBoost) {
		return;
	}

	uniforms.uSnakeBloomBoost.value = cfg.snakeBloomBoost ?? 3.2;
	if (uniforms.uSnakeColor) {
		uniforms.uSnakeColor.value.set(cfg.snakeLetterColor ?? "#00ccff");
	}
}

export function applyHubScreenSnakeOpacity(material, opacity = 1) {
	const uniforms = material?.uniforms;
	if (!uniforms?.opacity) {
		return;
	}

	uniforms.opacity.value = Math.max(0, Math.min(1, opacity));
}

export function applyHubScreenSnakeBloomUniform(material, snakeBloomBoost) {
	applyHubScreenSnakeUniforms(material, {
		...getPortfolioHubGlitchConfig(),
		snakeBloomBoost,
	});
}

export function syncHubScreenSnakeTexture(material, texture) {
	if (material?.uniforms?.map) {
		material.uniforms.map.value = texture;
	}
}
