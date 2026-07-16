const DISTORTION_EPS = 0.002;
const BLUR_BLEND_EPS = 0.001;
const BLUR_RADIUS_EPS = 0.0001;

/**
 * Какие fullscreen-pass'ы постобработки реально нужны в этом кадре.
 * @param {object} params
 * @param {string} params.page — props.currentPage (displayPathname)
 * @param {boolean} params.transition — телепорт distortion
 * @param {number} params.powerDistortion
 * @param {number} params.blurBlend
 * @param {number} params.blurRadius
 */
export function getPostProcessPassFlags({
	page,
	transition,
	powerDistortion,
	blurBlend,
	blurRadius,
}) {
	const distortion = Boolean(transition || powerDistortion > DISTORTION_EPS);

	const onPortfolio = page.startsWith("/portfolio") || page === "/about";
	const blur =
		onPortfolio &&
		(blurBlend > BLUR_BLEND_EPS || blurRadius > BLUR_RADIUS_EPS);

	return {
		distortion,
		blur,
		bloom: true,
	};
}

/** Грубая оценка числа fullscreen-pass'ов bloom (mipmap). */
export function estimateBloomPassCount(levels, mipmapBlur = true) {
	if (!mipmapBlur) {
		return 2;
	}
	return Math.max(2, 1 + levels * 2);
}

export function estimateTotalPostPasses(flags, bloomLevels, mipmapBlur) {
	let n = estimateBloomPassCount(bloomLevels, mipmapBlur);
	if (flags.distortion) n += 1;
	if (flags.blur) n += 1;
	return n;
}
