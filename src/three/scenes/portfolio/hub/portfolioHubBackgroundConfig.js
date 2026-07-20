/** Liquid HDR на /portfolio: фиксированные scale, цвет и яркость для всех кейсов. */
export const portfolioHubBackgroundConfig = {
	/** Без приближения/отдаления (всегда одно значение). */
	liquidScale: 1,
	/** Плавность смены яркости/цвета при заходе на hub, сек. */
	smoothDuration: 0.75,
	/** TEMP: brighter liquid site-wide — restore to 0.01 when done reviewing. */
	brightness: 0.08,
	distortionColor: "#1b476f",
};
