/**
 * Сцена — разрез океана: сетка на y = 0 в локальных координатах oceanGroup.
 * Ambient-группы без поворота кита — local Y = глубина относительно поверхности.
 */

/** Y базовой плоскости океана (до волны в шейдере сетки). */
export const OCEAN_SURFACE_Y = 0;

/** Запас ниже визуальных пиков волн сетки. */
export function getSurfaceClipMargin(ambientConfig = {}, oceanConfig = {}) {
	const base = ambientConfig.surfaceMargin ?? 0.45;
	const waveAmp = oceanConfig.waveAmp ?? 0.9;
	const rippleAmp = oceanConfig.rippleAmp ?? 0.15;
	const waveHeadroom = waveAmp * 0.78 + rippleAmp * 0.55 + 0.4;
	return base + waveHeadroom;
}

/**
 * Макс. local Y в группе на anchorY (без поворота группы).
 * anchorY + localY ≤ OCEAN_SURFACE_Y − margin
 */
export function getAmbientLocalSurfaceY(anchorY = 0, ambientConfig = {}, oceanConfig = {}) {
	const margin = getSurfaceClipMargin(ambientConfig, oceanConfig);
	return OCEAN_SURFACE_Y - anchorY - margin;
}

/** Y-потолок в координатах oceanGroup (ниже пиков волн сетки). */
export function getOceanSpaceCeilingY(ambientConfig = {}, oceanConfig = {}) {
	return OCEAN_SURFACE_Y - getSurfaceClipMargin(ambientConfig, oceanConfig);
}
