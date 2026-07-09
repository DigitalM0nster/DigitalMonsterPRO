import * as THREE from "three";
import {
	applyHubScreenWhiteTextGlow,
	applyHubScreenWhiteTextOpacity,
	createHubScreenWhiteTextMaterial,
	syncHubScreenWhiteTextGlowStep,
} from "./hubScreenWhiteTextMaterial.js";
import {
	applyHubScreenSnakeBloomUniform,
	applyHubScreenSnakeUniforms,
	createHubScreenSnakeTextMaterial,
	syncHubScreenSnakeTexture,
} from "./hubScreenSnakeTextMaterial.js";
import {
	applyHubPlateLabelRevealUniforms,
	createHubPlateLabelMaterial,
} from "../hubPlateLabelMaterial.js";

function hashLayerSeed(id = "text") {
	let hash = 0;
	for (let index = 0; index < id.length; index += 1) {
		hash = (hash << 5) - hash + id.charCodeAt(index);
		hash |= 0;
	}
	return (hash % 1000) / 1000;
}

const HUD_MATERIAL_PROPS = {
	transparent: true,
	depthTest: false,
	depthWrite: false,
	toneMapped: false,
	side: THREE.DoubleSide,
};

function createBasicScreenTextMaterial(texture) {
	return new THREE.MeshBasicMaterial({
		map: texture,
		...HUD_MATERIAL_PROPS,
	});
}

function createHudRevealScreenTextMaterial(texture, layerCfg) {
	const material = createHubPlateLabelMaterial(texture, {
		opacity: 1,
		reveal: { enabled: false, ...(layerCfg.reveal ?? {}) },
		blur: layerCfg.blur,
		glitch: layerCfg.glitch,
		revealSeed: hashLayerSeed(layerCfg.id),
	});

	Object.assign(material, HUD_MATERIAL_PROPS);
	return material;
}

function createWhiteTextScreenMaterial(texture) {
	return createHubScreenWhiteTextMaterial(texture);
}

/** Реестр шейдеров текстового слоя. */
export const SCREEN_TEXT_SHADERS = {
	basic: {
		create(texture, layerCfg) {
			void layerCfg;
			return createBasicScreenTextMaterial(texture);
		},
		setOpacity(material, alpha) {
			material.opacity = alpha;
		},
		setGlow(material, glow) {
			void material;
			void glow;
		},
	},
	whiteText: {
		create(texture, layerCfg) {
			void layerCfg;
			return createWhiteTextScreenMaterial(texture);
		},
		setOpacity(material, alpha) {
			applyHubScreenWhiteTextOpacity(material.uniforms, alpha);
		},
		setGlow(material, glow) {
			applyHubScreenWhiteTextGlow(material.uniforms, glow);
		},
		syncTexture(material, texture) {
			syncHubScreenWhiteTextGlowStep(material, texture);
		},
	},
	snakeText: {
		create(texture, layerCfg) {
			void layerCfg;
			return createHubScreenSnakeTextMaterial(texture);
		},
		setOpacity(material, alpha) {
			void material;
			void alpha;
		},
		setGlow(material, glow) {
			void material;
			void glow;
		},
		syncTexture(material, texture) {
			syncHubScreenSnakeTexture(material, texture);
		},
		applySnakeUniforms(material, cfg) {
			applyHubScreenSnakeUniforms(material, cfg);
		},
	},
	hudReveal: {
		create(texture, layerCfg) {
			return createHudRevealScreenTextMaterial(texture, layerCfg);
		},
		setOpacity(material, alpha, layerCfg) {
			const reveal = Math.max(0, Math.min(1, alpha));
			const fullyVisible = reveal >= 0.999;
			material.uniforms.opacity.value = reveal;
			applyHubPlateLabelRevealUniforms(
				material.uniforms,
				fullyVisible ? 1 : reveal,
				{ entering: fullyVisible, linear: fullyVisible ? 1 : reveal },
				layerCfg.reveal,
			);
		},
		setGlow(material, glow) {
			void material;
			void glow;
		},
	},
};

export function createScreenTextMaterial(shaderType, texture, layerCfg) {
	const factory = SCREEN_TEXT_SHADERS[shaderType] ?? SCREEN_TEXT_SHADERS.whiteText;
	return factory.create(texture, layerCfg);
}

export function applyScreenTextOpacity(shaderType, material, alpha, layerCfg) {
	const factory = SCREEN_TEXT_SHADERS[shaderType] ?? SCREEN_TEXT_SHADERS.whiteText;
	factory.setOpacity(material, alpha, layerCfg);
}

export function applyScreenTextGlow(shaderType, material, glow) {
	const factory = SCREEN_TEXT_SHADERS[shaderType] ?? SCREEN_TEXT_SHADERS.whiteText;
	factory.setGlow?.(material, glow);
}

export function syncScreenTextTexture(shaderType, material, texture) {
	const factory = SCREEN_TEXT_SHADERS[shaderType] ?? SCREEN_TEXT_SHADERS.whiteText;
	factory.syncTexture?.(material, texture);
}
