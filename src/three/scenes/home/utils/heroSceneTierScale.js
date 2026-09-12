import { digitalWhaleConfig } from "../digitalWhaleConfig.js";
import { getGraphicsTier } from "@/functions/getGraphicsTier.js";

/** Лимит сетки океана по tier (продакшен / perf). */
export function getOceanGridCap(tier = getGraphicsTier()) {
	if (tier === "high") {
		return [408, 110];
	}

	if (tier === "medium") {
		return [280, 100];
	}

	// Low uses fewer real point rows while retaining the same wave deformation.
	return [192, 64];
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

/** All tiers use point waves; the procedural surface remains an optional factory. */
export function shouldUseShaderOceanSurface() {
	return false;
}

/** Сегменты mesh плоскости для геометрических волн (отдельно от плотности точек в shader). */
export function getOceanMeshSegmentCap(tier = getGraphicsTier()) {
	if (tier === "high") {
		return [80, 62];
	}

	if (tier === "medium") {
		return [48, 36];
	}

	return [48, 32];
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

/** Three centered tiles cover desktop; avoid spreading wave vertices over 11. */
export function getOceanTileCountCap(tier = getGraphicsTier()) {
	if (tier === "high" || tier === "medium") {
		return 3;
	}

	return 3;
}

export function getOceanGridSizeFromConfig(config = digitalWhaleConfig, options = {}) {
	const o = config.ocean ?? {};
	return resolveOceanGridSize(o.gridCols, o.gridRows, getGraphicsTier(), options);
}

/** All tiers use GPU particles; Low supplies its own density and LDR light profile. */
export function shouldUseWhaleHologram() {
	return false;
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
