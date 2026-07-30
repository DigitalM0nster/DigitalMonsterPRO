/** Длительность `hidingBlock` у `.startApp .block*` в loader.css (все блоки — 1s). */
export const LOADER_CURTAIN_HIDE_MS = 1000;

/**
 * Сколько ещё ждать завершения curtain-анимации лоадера с момента `appStartedAt`.
 * Если timestamp не задан — возвращаем полную длительность.
 */
export function getLoaderCurtainRemainingMs(appStartedAt) {
	if (appStartedAt == null) {
		return LOADER_CURTAIN_HIDE_MS;
	}

	const elapsed = Date.now() - appStartedAt;
	return Math.max(0, LOADER_CURTAIN_HIDE_MS - elapsed);
}
