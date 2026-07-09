/** @deprecated Таймеры intro сняты — no-op для совместимости. */
export function cancelPortfolioHubFocusIntro() {}

/**
 * @deprecated Сброс focus плит перенесён в PortfolioHubScene.resetCarouselState / _ensureDormantState.
 * Не привязываем к URL — иначе логотип гаснет при scroll/hex до ресета сцены.
 */
export function usePortfolioHubFocusIntro() {}
