import * as THREE from "three";
import { ModelsBloomPipeline } from "./ModelsBloomPipeline.js";

const BLOOM_REVEAL_EPS = 0.00001;

/**
 * Post-process слоя моделей: один bloom после hex-mix.
 */
export class ModelsPostProcessPipeline {
	constructor(renderer, gfx) {
		this.renderer = renderer;
		this.gfx = gfx;
		this.bloom = new ModelsBloomPipeline(renderer, gfx);
		this.size = { w: 0, h: 0 };
	}

	setSize(width, height) {
		if (width <= 0 || height <= 0) {
			return;
		}
		if (this.size.w === width && this.size.h === height) {
			return;
		}
		this.size = { w: width, h: height };
		this.bloom.setSize(width, height);
	}

	/** Bloom на уже смешанную hex-текстуру. */
	applyBloom(sourceTexture, delta, reveal = 1) {
		if (!sourceTexture) {
			return null;
		}
		// Плавное включение вместо бинарного порога ~0.001 (мгновенный «всплеск» bloom).
		const effectiveReveal = THREE.MathUtils.smoothstep(reveal, 0, 0.06);
		if (effectiveReveal <= BLOOM_REVEAL_EPS) {
			return sourceTexture;
		}
		return this.bloom.render(sourceTexture, delta, { reveal: effectiveReveal }) ?? sourceTexture;
	}

	applyConfigFromDev() {
		this.bloom.applyConfigFromDev();
	}

	dispose() {
		this.bloom.dispose();
	}
}
