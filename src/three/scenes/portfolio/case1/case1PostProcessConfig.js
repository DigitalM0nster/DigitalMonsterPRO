/** Liquid-фон карусели + grain blur (/ · /portfolio · … и /portfolio/01). Bloom — siteBloomConfig.js. */

export const case1PostProcessConfig = {
	/** Зернистый blur на весь кадр; radius от store.scroll (сглаженного). */
	grainBlur: {
		enabled: false,

		blurRadiusMax: 0.002,

		/** Множитель scroll → radius (было 0.05: max уже при ~0.03). */
		scrollGain: 0.012,

		/** Плавность нарастания / затухания grain (maath damp). */
		rampSmooth: 2.8,

		fadeSmooth: 0.65,

		/** Доля скролла, после которой grain снова гаснет. */
		scrollFadeStart: 0.55,
	},

	background: {
		brightness: 0.01,

		liquidScale: 1,

		distortionColor: "#1b476f",

		smoothDuration: 0.75,
	},
};
