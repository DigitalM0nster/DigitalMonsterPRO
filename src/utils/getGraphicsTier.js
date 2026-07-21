/**
 * Оценка GPU/CPU для tier + облегчённый «litePipeline» на low/medium.
 * Цель: старые ноуты (4 ядра / 4 GB) не должны получать desktop-high настройки.
 */

let calibratedGraphicsTier = null;
let calibratedGraphicsDiagnostics = null;

export function isMobileGraphicsDevice() {
	if (typeof window === "undefined") {
		return false;
	}

	if (window.innerWidth <= 900) {
		return true;
	}

	try {
		return window.matchMedia("(pointer: coarse)").matches;
	} catch {
		return false;
	}
}

/** ?tier=low|medium|high — принудительный tier (dev / тест на слабом ноуте). */
export function getForcedGraphicsTierFromUrl() {
	if (typeof window === "undefined") {
		return null;
	}

	try {
		const forced = new URLSearchParams(window.location.search).get("tier");
		if (forced === "low" || forced === "medium" || forced === "high") {
			return forced;
		}
	} catch {
		/* ignore */
	}

	return null;
}

/** @returns {{ score: number, cores: number, memoryGb: number | null, mobile: boolean }} */
function computeGraphicsHardwareScore() {
	const mobile = isMobileGraphicsDevice();
	const cores = typeof navigator.hardwareConcurrency === "number" ? navigator.hardwareConcurrency : 4;
	const memoryGb = typeof navigator.deviceMemory === "number" ? navigator.deviceMemory : null;

	let score = 0;
	if (cores >= 8) score += 2;
	else if (cores >= 4) score += 1;

	if (memoryGb != null) {
		if (memoryGb >= 8) score += 2;
		else if (memoryGb >= 4) score += 1;
	} else if (!mobile) {
		// deviceMemory на Windows часто недоступен — ориентируемся на CPU, не занижаем desktop.
		if (cores >= 8) score += 2;
		else if (cores >= 4) score += 1;
	}

	return { score, cores, memoryGb, mobile };
}

function resolveTierFromScore(score, mobile) {
	let tier = "high";
	if (score <= 2) tier = "low";
	else if (score <= 3) tier = "medium";

	if (mobile) {
		if (tier === "high") {
			tier = "medium";
		}
		if (score <= 2) {
			tier = "low";
		}
	}

	return tier;
}

export function getGraphicsTier() {
	if (typeof window === "undefined") {
		return "medium";
	}

	const forced = getForcedGraphicsTierFromUrl();
	if (forced) {
		return forced;
	}
	if (calibratedGraphicsTier) {
		return calibratedGraphicsTier;
	}

	try {
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			return "low";
		}
	} catch {
		/* ignore */
	}

	const { score, mobile } = computeGraphicsHardwareScore();

	// Макс. score = 4. Раньше high требовал >4 — автоматически high был недостижим.
	return resolveTierFromScore(score, mobile);
}

/**
 * Final tier selected by the real-GPU calibration before scenes/RT warm-up.
 * URL `?tier=` remains authoritative for visual QA.
 */
export function setCalibratedGraphicsTier(tier, diagnostics = null) {
	if (tier !== "low" && tier !== "medium" && tier !== "high") {
		return;
	}
	calibratedGraphicsTier = tier;
	calibratedGraphicsDiagnostics = diagnostics;
}

/** Для лога при старте: почему выбран tier. */
export function getGraphicsTierDiagnostics() {
	if (typeof window === "undefined") {
		return { tier: "medium", score: 0, cores: 0, memoryGb: null, mobile: false };
	}

	const forced = getForcedGraphicsTierFromUrl();
	const { score, cores, memoryGb, mobile } = computeGraphicsHardwareScore();

	return {
		tier: forced ?? calibratedGraphicsTier ?? resolveTierFromScore(score, mobile),
		score,
		cores,
		memoryGb,
		mobile,
		forced: forced ?? null,
		calibration: calibratedGraphicsDiagnostics,
	};
}

export function getGraphicsConfig(tier) {
	const map = {
		low: {
			dprCap: 1,
			caseCanvasDprCap: 1,
			caseRenderFpsCap: 0,
			staticCaseRenderFpsCap: 0,
			sparkles: 240,
			litePipeline: true,
			/** Без bloom / liquid / grain на low; hex-mix карусели — всегда. */
			noPostProcess: true,
			/** Макс. частота тяжёлого render pass (update/анимации — каждый rAF). */
			renderFpsCap: 30,
			reduceBackgroundBlur: true,
			bloomMipmap: true,
			bloomLevels: 2,
			bloomRadius: 0.5,
			bloomResolutionScale: 0.25,
			bloomHdr: false,
			antialias: false,
			powerPreference: "low-power",
		},
		medium: {
			dprCap: 1.25,
			caseCanvasDprCap: 1,
			caseRenderFpsCap: 0,
			staticCaseRenderFpsCap: 0,
			sparkles: 400,
			litePipeline: true,
			reduceBackgroundBlur: true,
			bloomMipmap: true,
			bloomLevels: 4,
			bloomRadius: 0.68,
			bloomResolutionScale: 0.28,
			// Keep emissive energy above 1.0 until bloom. The cheaper level count and
			// resolution scale are the medium-tier saving; an 8-bit source RT is not.
			bloomHdr: true,
			antialias: false,
			powerPreference: "default",
		},
		high: {
			dprCap: 2,
			caseCanvasDprCap: 1,
			caseRenderFpsCap: 0,
			staticCaseRenderFpsCap: 0,
			sparkles: 1000,
			litePipeline: false,
			reduceBackgroundBlur: true,
			bloomMipmap: true,
			bloomLevels: 8,
			bloomRadius: 0.85,
			bloomResolutionScale: 0.35,
			bloomHdr: true,
			antialias: false,
			powerPreference: "default",
		},
	};
	return map[tier] || map.medium;
}

/**
 * DPR для WebGL.
 * low — 0.8 · medium — cap 1 · high — 2.
 */
export function resolveRendererPixelRatio(tier, devicePixelRatio = typeof window !== "undefined" ? window.devicePixelRatio : 1) {
	const gfx = getGraphicsConfig(tier);
	const device = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;

	if (tier === "low") {
		return gfx.dprCap ?? 0.8;
	}

	if (tier === "high") {
		return gfx.dprCap ?? 2;
	}

	// Medium keeps UI/WebGL typography clean on 1x desktop monitors without paying
	// high tier's fixed DPR 2 fill-rate cost.
	return Math.min(Math.max(device, 1.25), gfx.dprCap);
}
