/**
 * Reserved bottom band for desktop case-to-case navigation.
 * It tracks the CSS node/bottom sizing and always leaves a visual gap above it.
 */
export function resolveCaseProjectNavigationReservePx(viewportWidth, viewportHeight) {
	const width = Math.max(0, Number(viewportWidth) || 0);
	const height = Math.max(0, Number(viewportHeight) || 0);

	if (width < 768) {
		return 0;
	}

	const heightBasedReserve = height * 0.15;
	const compactAdjustment = width < 1180 ? 8 : 0;
	return Math.round(Math.min(164, Math.max(118, heightBasedReserve + compactAdjustment)));
}
