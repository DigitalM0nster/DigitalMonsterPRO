import { digitalWhaleConfig } from "../digitalWhaleConfig.js";
import { getGraphicsTier } from "@/utils/getGraphicsTier.js";

/** Лимит сетки океана по tier (продакшен / perf). */
export function getOceanGridCap(tier = getGraphicsTier()) {
	if (tier === "high") {
		return [408, 110];
	}

	if (tier === "medium") {
		return [200, 88];
	}

	// Shader-плоскость: cols×rows только в fragment shader, не геометрия.
	return [640, 90];
}

/**
 * Запрошенный gridCols/gridRows → фактический размер сетки.
 * @param {number} gridCols
 * @param {number} gridRows
 * @param {string} [tier]
 * @param {{ bypassTierCap?: boolean }} [options] — dev-панель: без лимита tier
 */
export function resolveOceanGridSize(gridCols, gridRows, tier = getGraphicsTier(), options = {}) {
	const cols = Math.max(16, Math.round(gridCols));
	const rows = Math.max(12, Math.round(gridRows));

	if (options.bypassTierCap) {
		return [cols, rows];
	}

	const [capCols, capRows] = getOceanGridCap(tier);
	return [Math.min(cols, capCols), Math.min(rows, capRows)];
}

/** На low/medium — shader-плоскость; на high — классические Points + линии. */
export function shouldUseShaderOceanSurface(tier = getGraphicsTier()) {
	return tier !== "high";
}

/** Сегменты mesh плоскости для геометрических волн (отдельно от плотности точек в shader). */
export function getOceanMeshSegmentCap(tier = getGraphicsTier()) {
	if (tier === "high") {
		return [80, 62];
	}

	if (tier === "medium") {
		return [48, 36];
	}

	return [24, 18];
}

/**
 * Сколько разбить плоскость океана (widthSegments × heightSegments).
 * Точки сетки в fragment shader остаются cols×rows — это только геометрия волн.
 */
export function resolveOceanMeshSegments(gridCols, gridRows, tier = getGraphicsTier(), options = {}) {
	const [capX, capZ] = options.bypassTierCap ? [120, 94] : getOceanMeshSegmentCap(tier);
	const segX = Math.min(Math.max(Math.round(gridCols) - 1, 12), capX);
	const segZ = Math.min(Math.max(Math.round(gridRows) - 1, 10), capZ);
	return [segX, segZ];
}

/** Макс. тайлов океана по X (скролл-слои). C1: high — 3 вместо динамических 5–11. */
export function getOceanTileCountCap(tier = getGraphicsTier()) {
	if (tier === "high") {
		return 3;
	}

	return 11;
}

export function getOceanGridSizeFromConfig(config = digitalWhaleConfig, options = {}) {
	const o = config.ocean ?? {};
	return resolveOceanGridSize(o.gridCols, o.gridRows, getGraphicsTier(), options);
}

/** На low/medium кит — holo-shader на меше вместо edge-партиклов. */
export function shouldUseWhaleHologram(tier = getGraphicsTier()) {
	return tier === "low" || tier === "medium";
}

const AMBIENT_MUL = {
	// C2: −25% подводных частиц на high (базовые значения в конфиге — для dev-панели).
	high: 0.75,
	medium: 0.42,
	low: 0.16,
};

/** Меньше подводных частиц на low/medium (слабые ноуты). */
export function scaleAmbientConfigForTier(ambient, tier = getGraphicsTier()) {
	const mul = AMBIENT_MUL[tier] ?? AMBIENT_MUL.medium;

	return {
		...ambient,
		deepCount: Math.max(0, Math.round(ambient.deepCount * mul)),
		whaleAmbientCount: Math.max(0, Math.round(ambient.whaleAmbientCount * mul)),
	};
}

export function buildTierScaledWhaleConfig(config = digitalWhaleConfig) {
	return {
		...config,
		ambient: scaleAmbientConfigForTier(config.ambient),
	};
}
