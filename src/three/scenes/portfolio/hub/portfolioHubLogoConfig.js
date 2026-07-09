/**
 * Единый конфиг логотипов на плитах хаба (/portfolio).
 * Постобработка bloom — siteBloomConfig.js (общий для всего сайта).
 */
export const portfolioHubLogoConfig = {
	/** Reveal: сетка частей, часть смещена вниз и поднимается с progress. */
	reveal: {
		enabled: true,
		partSize: 0.075,
		shiftRatio: 0.35,
		dropMin: 0.35,
		dropMax: 0.65,
	},

	/** Три слоя логотипа на плите. */
	layers: {
		front: { opacity: 0.1, blur: 0.0 },
		back: { opacity: 0.035, blur: 2.5 },
		frontFloat: { opacity: 1, blur: 0 },
	},

	/** Выезд frontFloat от передней грани плиты. */
	floatZOffset: 0.2,

	/** HDR-яркость слоёв логотипа (>1 усиливает свечение в материале). */
	logoEmissiveBoost: {
		front: 1,
		back: 1,
		frontFloat: 1.1,
	},
};

/** @deprecated Используй portfolioHubLogoConfig.reveal */
export function getLogoBrickConfig() {
	return portfolioHubLogoConfig.reveal;
}

export function getLogoLayerConfig(layerId) {
	return portfolioHubLogoConfig.layers[layerId] ?? portfolioHubLogoConfig.layers.frontFloat;
}

export function getLogoEmissiveBoostConfig() {
	return portfolioHubLogoConfig.logoEmissiveBoost;
}

/** @deprecated Используй getLogoEmissiveBoostConfig */
export function getLogoBloomConfig() {
	return portfolioHubLogoConfig.logoEmissiveBoost;
}
