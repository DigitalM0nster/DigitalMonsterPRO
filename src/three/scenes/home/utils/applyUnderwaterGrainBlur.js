import { digitalWhaleConfig } from "../digitalWhaleConfig.js";

/** Радиус grain blur партиклов кита (post-process шкала 0…~0.08). */
export function getUnderwaterGrainBlurRadius(config = digitalWhaleConfig) {
	return config.underwater?.grainBlurRadius ?? config.whale?.grainBlurRadius ?? 0;
}

export function applyUnderwaterGrainToMaterial(material, radius) {
	if (!material?.uniforms?.uGrainBlurRadius) {
		return;
	}

	material.uniforms.uGrainBlurRadius.value = radius;
}
