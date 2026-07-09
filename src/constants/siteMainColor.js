/** Акцент сайта — синхрон с `--mainColor` в src/css/style.scss */
export const SITE_MAIN_COLOR = "#00a9ff";
export const SITE_MAIN_RGB = { r: 0, g: 169, b: 255 };

/**
 * @param {number} alpha
 */
export function siteMainRgba(alpha) {
	return `rgba(${SITE_MAIN_RGB.r}, ${SITE_MAIN_RGB.g}, ${SITE_MAIN_RGB.b}, ${alpha})`;
}
