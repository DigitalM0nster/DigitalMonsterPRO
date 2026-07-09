import * as THREE from "three";
import {
	applyHeroTextRevealUniforms,
	heroTextRevealConfig,
} from "./heroTextRevealConfig.js";

export { heroTextRevealConfig };

export function createHeroTextRevealUniforms(revealSeed = heroTextRevealConfig.titleRevealSeed) {
	return {
		uRevealProgress: { value: 0 },
		uRevealLinear: { value: 0 },
		uRevealEnter: { value: 0 },
		uRevealPartSize: { value: heroTextRevealConfig.partSize },
		uRevealSeed: { value: revealSeed },
		uRevealShiftRatio: { value: heroTextRevealConfig.shiftRatio },
		uRevealDropMin: { value: heroTextRevealConfig.dropMin },
		uRevealDropMax: { value: heroTextRevealConfig.dropMax },
		uRevealSweepSpread: { value: heroTextRevealConfig.sweepSpread },
		uRevealUsePartReveal: { value: heroTextRevealConfig.enabled ? 1 : 0 },
		uRevealGlitchProgress: { value: 0 },
		uRevealGlitchTime: { value: 0 },
		uRevealGlitchIntensity: { value: heroTextRevealConfig.glitchIntensity },
		uRevealGlitchSliceCount: { value: heroTextRevealConfig.glitchSliceCount },
		uRevealGlitchRgbShift: { value: heroTextRevealConfig.glitchRgbShift },
		uRevealGlitchColor: { value: new THREE.Color(heroTextRevealConfig.glitchColor) },
	};
}

function easeInOutCubic(t) {
	return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/**
 * Анимация heroPageReveal на ShaderMaterial главной страницы.
 */
export class HeroTextRevealController {
	constructor(materials = [], { revealSeed = heroTextRevealConfig.titleRevealSeed } = {}) {
		this.materials = materials.filter(Boolean);
		this.revealSeed = revealSeed;
		this._anim = null;
		this._manualScrub = false;
		this._glitchTime = 0;
	}

	setManualScrub(active) {
		this._manualScrub = Boolean(active);
		if (this._manualScrub) {
			this._anim = null;
		}
	}

	isManualScrub() {
		return this._manualScrub;
	}

	/** Ручной прогресс 0–1 для dev-scrub (останавливает авто-анимацию). */
	setScrubProgress(progress, { entering = true, glitchProgress = 0 } = {}) {
		this._anim = null;
		const linear = Math.max(0, Math.min(1, progress));
		const glitch = Math.max(0, Math.min(1, glitchProgress));

		this._applyToAll((uniforms) => {
			if (!uniforms.uRevealProgress) {
				return;
			}
			uniforms.uRevealLinear.value = linear;
			uniforms.uRevealProgress.value = entering ? (linear > 0 ? 1 : 0) : linear;
			uniforms.uRevealEnter.value = entering ? 1 : 0;
			uniforms.uRevealGlitchProgress.value = glitch;
		});
	}

	getScrubProgress() {
		return this.materials[0]?.uniforms?.uRevealLinear?.value ?? 0;
	}

	setMaterials(materials) {
		this.materials = materials.filter(Boolean);
	}

	syncFromConfig(config = heroTextRevealConfig) {
		this._applyToAll((uniforms) => {
			applyHeroTextRevealUniforms(uniforms, config, this.revealSeed);
		});
	}

	_applyToAll(fn) {
		for (const material of this.materials) {
			if (material?.uniforms) {
				fn(material.uniforms);
			}
		}
	}

	prepareHidden() {
		this._anim = null;
		this._applyToAll((uniforms) => {
			if (!uniforms.uRevealProgress) {
				return;
			}
			uniforms.uRevealProgress.value = 0;
			uniforms.uRevealLinear.value = 0;
			uniforms.uRevealEnter.value = 0;
			uniforms.uRevealGlitchProgress.value = 0;
		});
		this.syncFromConfig();
	}

	playEnter(durationMs = heroTextRevealConfig.enterDurationMs, { glitch } = {}) {
		this._manualScrub = false;
		if (!heroTextRevealConfig.enabled) {
			this._applyToAll((uniforms) => {
				if (uniforms.uRevealProgress) {
					uniforms.uRevealProgress.value = 1;
					uniforms.uRevealLinear.value = 1;
					uniforms.uRevealEnter.value = 1;
				}
			});
			return Promise.resolve();
		}

		return this._runAnim({
			from: 0,
			to: 1,
			entering: true,
			durationMs,
			glitchOnEnter: glitch ?? heroTextRevealConfig.enterGlitch,
			glitchOnExit: false,
		});
	}

	playExit(durationMs = heroTextRevealConfig.exitDurationMs, { glitch } = {}) {
		this._manualScrub = false;
		if (!heroTextRevealConfig.enabled) {
			this.prepareHidden();
			return Promise.resolve();
		}

		const current = this.materials[0]?.uniforms?.uRevealProgress?.value ?? 1;

		return this._runAnim({
			from: current,
			to: 0,
			entering: false,
			durationMs,
			glitchOnEnter: false,
			glitchOnExit: glitch ?? heroTextRevealConfig.exitGlitch,
		});
	}

	_runAnim({ from, to, entering, durationMs, glitchOnEnter = false, glitchOnExit = false }) {
		this._anim = {
			from,
			to,
			entering,
			durationMs,
			glitchOnEnter,
			glitchOnExit,
			startedAt: performance.now(),
		};
		this.syncFromConfig();
		this._applyToAll((uniforms) => {
			if (uniforms.uRevealEnter) {
				uniforms.uRevealEnter.value = entering ? 1 : 0;
			}
		});

		return new Promise((resolve) => {
			this._anim.resolve = resolve;
		});
	}

	update(deltaTime) {
		this._glitchTime += deltaTime;

		if (this._manualScrub) {
			this._applyToAll((uniforms) => {
				if (uniforms.uRevealGlitchTime) {
					uniforms.uRevealGlitchTime.value = this._glitchTime;
				}
			});
			return;
		}

		if (this._anim) {
			const anim = this._anim;
			const t = Math.min(1, (performance.now() - anim.startedAt) / anim.durationMs);
			const linear = anim.from + (anim.to - anim.from) * t;
			const eased = anim.from + (anim.to - anim.from) * easeInOutCubic(t);
			let glitchProgress = 0;
			if (anim.glitchOnEnter && anim.entering) {
				// Enter: glitch в начале, затухает к концу reveal.
				glitchProgress = 1 - easeInOutCubic(t);
			} else if (anim.glitchOnExit && !anim.entering && anim.to < anim.from) {
				// Exit: glitch нарастает к концу.
				glitchProgress = easeInOutCubic(t);
			}

			this._applyToAll((uniforms) => {
				if (!uniforms.uRevealProgress) {
					return;
				}
				// uRevealLinear — линейное время (как partLinear на плитах); easing один раз в шейдере.
				uniforms.uRevealLinear.value = linear;
				if (anim.entering) {
					uniforms.uRevealProgress.value = linear > 0 ? 1 : 0;
				} else {
					uniforms.uRevealProgress.value = eased;
				}
				uniforms.uRevealGlitchProgress.value = glitchProgress;
				uniforms.uRevealGlitchTime.value = this._glitchTime;
			});

			if (t >= 1) {
				const resolve = anim.resolve;
				this._anim = null;
				resolve?.();
			}
		} else {
			this._applyToAll((uniforms) => {
				if (uniforms.uRevealGlitchTime) {
					uniforms.uRevealGlitchTime.value = this._glitchTime;
				}
			});
		}
	}
}
