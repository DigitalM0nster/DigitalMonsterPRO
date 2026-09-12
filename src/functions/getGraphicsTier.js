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
	const cores = Number.isFinite(navigator.hardwareConcurrency) && navigator.hardwareConcurrency > 0 ? navigator.hardwareConcurrency : 4;
	const memoryGb = Number.isFinite(navigator.deviceMemory) && navigator.deviceMemory > 0 ? navigator.deviceMemory : null;

	let score = 0;
	if (cores >= 8) score += 2;
	else if (cores >= 4) score += 1;

	if (memoryGb != null) {
		if (memoryGb >= 8) score += 2;
		else if (memoryGb >= 4) score += 1;
	}

	return { score, cores, memoryGb, mobile };
}

function resolveHardwareTier({ cores, memoryGb, mobile }) {
	// Independent ceilings: extra RAM cannot compensate for few CPU threads,
	// and extra threads cannot compensate for a known small memory budget.
	if (cores < 4 || (memoryGb !== null && memoryGb < 4)) return "low";
	if (cores < 8 && memoryGb !== null && memoryGb <= 4) return "low";
	// Unknown RAM is not invented from CPU data, nor treated as low memory.
	if (cores < 8 || (memoryGb !== null && memoryGb < 8) || mobile) return "medium";
	return "high";
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

	return resolveHardwareTier(computeGraphicsHardwareScore());
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
		tier: getGraphicsTier(),
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
			/** Match display cadence; AdaptiveFrameSkipper handles actual overload. */
			renderFpsCap: 0,
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
			dprCap: 1,
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
 * low — 1 · medium — 1 · high — 2.
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

	// Medium renders at DPR 1 on both standard and HiDPI displays.
	return Math.min(Math.max(device, 1), gfx.dprCap);
}
