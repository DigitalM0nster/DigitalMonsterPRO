import { portfolioHubBackgroundConfig } from "@/three/scenes/portfolio/hub/portfolioHubBackgroundConfig.js";

/** Сброс focus hub (заход на /portfolio, intro). */
export function resetPortfolioHubBackgroundFocus(store) {
	store.portfolioHubFocusIndex = -1;
}

/** Смена focus в меню / на плитах (без влияния на фон). */
export function commitPortfolioHubFocusIndex(store, nextIndex) {
	const next = nextIndex ?? -1;
	if ((store.portfolioHubFocusIndex ?? -1) === next) {
		return;
	}
	store.portfolioHubFocusIndex = next;
}

/** Целевые параметры liquid-фона на hub /portfolio — одинаковые для всех кейсов. */
export function getPortfolioHubBackgroundTargets() {
	const cfg = portfolioHubBackgroundConfig;
	return {
		brightness: cfg.brightness,
		distortionColor: cfg.distortionColor,
		scale: cfg.liquidScale ?? 1,
		smoothDuration: Math.max(cfg.smoothDuration ?? 0.75, 0.001),
	};
}
