import { KernelSize } from "postprocessing";

/**
 * Bloom моделей — site-wide.
 * levels / radius / mipmap — tier caps в getSiteBloomConfig(gfx).
 */
export const siteBloomArtDirection = {
	intensity: 1.75,
	/** HDR-only bloom: заливка hero-текста ≤ 1 не светится, контур > 1 — да. */
	threshold: 1,
	smoothing: 0.05,
	mipmapBlur: true,
	resolutionScale: 0.5,
	levels: 8,
	radius: 0.85,
	kernelSize: KernelSize.VERY_SMALL,
};

/** Необязательные runtime-overrides без перезагрузки. */
export const siteBloomDevOverrides = import.meta.env.DEV ? {} : null;

/**
 * @param {ReturnType<import("../../../utils/getGraphicsTier.js").getGraphicsConfig>} gfx
 */
export function getSiteBloomConfig(gfx) {
	const dev = siteBloomDevOverrides ?? {};

	return {
		intensity: dev.intensity ?? siteBloomArtDirection.intensity,
		threshold: dev.threshold ?? (gfx.bloomHdr === false ? 0.9 : siteBloomArtDirection.threshold),
		smoothing: dev.smoothing ?? siteBloomArtDirection.smoothing,
		mipmapBlur: dev.mipmapBlur ?? siteBloomArtDirection.mipmapBlur ?? gfx.bloomMipmap,
		levels: dev.levels ?? Math.min(siteBloomArtDirection.levels, gfx.bloomLevels),
		radius: dev.radius ?? Math.min(siteBloomArtDirection.radius, gfx.bloomRadius),
		resolutionScale: dev.resolutionScale ?? Math.min(siteBloomArtDirection.resolutionScale, gfx.bloomResolutionScale),
		kernelSize: dev.kernelSize ?? siteBloomArtDirection.kernelSize,
	};
}
