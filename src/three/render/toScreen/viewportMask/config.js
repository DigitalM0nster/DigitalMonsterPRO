/**
 * Область «окна» — legacy, больше не используется (контент на весь экран).
 * Оставлено для совместимости импортов в dev-tools.
 */
export const VIEWPORT_MASK = {
	centerWidth: 1,
	centerHeight: 1,
	borderRadius: 0,
};

/** Маска «окна» отключена глобально — модели и фон на весь canvas. */
export function isViewportMaskEnabled() {
	return false;
}
