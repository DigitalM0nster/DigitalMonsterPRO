import { grainBlurGlsl } from "./grainBlurChunk.js";

/** Grain blur для point-спрайтов под водой (кит, глубина, ambient, пузырьки). */
export const underwaterPointGrainGlsl = /* glsl */ `
${grainBlurGlsl}

float underwaterGrainSoft(float radius) {
	return radius * 45.0;
}

float underwaterGrainTap(float radius, float pointSizePx) {
	return radius * (320.0 / max(pointSizePx, 1.0));
}
`;
