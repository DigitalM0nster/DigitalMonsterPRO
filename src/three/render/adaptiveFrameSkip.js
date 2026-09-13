import { isMobileGraphicsDevice } from "../../functions/getGraphicsTier.js";

const MIN_DESKTOP_WIDTH = 768;
const FPS_THRESHOLD_DESKTOP = 50;
const FPS_THRESHOLD_LITE = 42;
const FPS_THRESHOLD_LOW_TIER = 32;

/**
 * Adaptive frame skip + опциональный renderFpsCap из tier-конфига.
 * Update/анимации идут каждый rAF — режется только тяжёлый GPU render pass.
 */
export class AdaptiveFrameSkipper {
	constructor() {
		this.frameCount = 0;
		this.lastFrameTime = performance.now();
		this.lastRenderTime = 0;
		this.fps = 60;
	}

	getFps() {
		return this.fps;
	}

	/**
	 * @param {{ tier?: "low"|"medium"|"high", renderFpsCap?: number, mobile?: boolean }} [options]
	 * @returns {boolean} true — пропустить render этого кадра
	 */
	shouldSkipRender(options = {}) {
		const { tier = "medium", renderFpsCap = 0, mobile = isMobileGraphicsDevice() } = options;
		const now = performance.now();
		const elapsed = Math.max(1, now - this.lastFrameTime);
		this.lastFrameTime = now;
		this.fps = this.fps * 0.85 + (1000 / elapsed) * 0.15;
		this.frameCount++;

		// An explicitly configured cap is separate from adaptive frame skipping.
		if (renderFpsCap > 0 && this.lastRenderTime > 0) {
			const minInterval = 1000 / renderFpsCap;
			if (now - this.lastRenderTime < minInterval) {
				return true;
			}
		}

		// Mobile presents every available RAF, including Safari's native 30 Hz
		// power-saving cadence. Applying the desktop low-tier 1/7 policy there
		// reduced the visible hex transition to roughly four frames per second.
		if (mobile) {
			this.lastRenderTime = now;
			return false;
		}

		const isDesktop = window.innerWidth >= MIN_DESKTOP_WIDTH;
		const threshold = tier === "low" ? FPS_THRESHOLD_LOW_TIER : tier === "medium" ? FPS_THRESHOLD_LITE : isDesktop ? FPS_THRESHOLD_DESKTOP : 48;

		if (this.fps >= threshold) {
			this.lastRenderTime = now;
			return false;
		}

		// Desktop overload: low — 1 render из 7, остальные tier — 1 из 2.
		const skip = tier === "low" ? this.frameCount % 7 !== 0 : this.frameCount % 2 === 0;

		if (!skip) {
			this.lastRenderTime = now;
		}

		return skip;
	}
}
