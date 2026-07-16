/** Настройки click-перехода (меню → другой роут карусели). */
export const carouselClickTransitionConfig = {
	/** Фиксированная длительность reset, если progress не на 0 и не на 1 (с). */
	resetDurationS: 0.3,
	/** Фаза enter: progress 0 → 1 (с). Меняй для тестов скорости. */
	enterDurationS: 1,
};

/** Плавный click-progress с нулевой скоростью на обоих концах перехода. */
export function easeCarouselClickProgress(value) {
	const t = Math.max(0, Math.min(1, value));
	return t < 0.5
		? 4 * t * t * t
		: 1 - Math.pow(-2 * t + 2, 3) / 2;
}
