export const CITY_FOG_EFFECTIVE_END_RATIO = 0.99;

export function getCityFogAmount(distance, settings) {
	const density = Math.max(0, Number(settings?.fogDensity) || 0);
	const near = Math.max(0, Number(settings?.fogNear) || 0);
	const power = Math.max(0.1, Number(settings?.fogPower) || 1);
	const opacity = Math.max(0, Math.min(1, Number(settings?.fogOpacity) || 0));
	const fogDistance = Math.max(0, Number(distance) - near);
	const exponential = 1 - Math.exp(-(density ** 2) * (fogDistance ** 2));
	return Math.max(0, Math.min(1, (exponential ** power) * opacity));
}

export function getCityFogEffectiveEnd(settings, ratio = CITY_FOG_EFFECTIVE_END_RATIO) {
	const density = Math.max(0, Number(settings?.fogDensity) || 0);
	const near = Math.max(0, Number(settings?.fogNear) || 0);
	const power = Math.max(0.1, Number(settings?.fogPower) || 1);
	const opacity = Math.max(0, Math.min(1, Number(settings?.fogOpacity) || 0));
	if (density <= 0 || opacity <= 0) return Infinity;
	const normalizedRatio = Math.max(0.001, Math.min(0.9999, Number(ratio) || 0.99));
	const exponentialAtEnd = normalizedRatio ** (1 / power);
	return near + Math.sqrt(-Math.log(Math.max(0.000001, 1 - exponentialAtEnd))) / density;
}
