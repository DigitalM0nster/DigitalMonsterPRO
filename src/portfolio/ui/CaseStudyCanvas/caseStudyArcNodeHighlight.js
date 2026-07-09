import { getGraphicsTier } from "@/utils/getGraphicsTier.js";

/** Пульсация bloom центральной точки (px). */
const INNER_BLOOM_PULSE_MIN = 4;
const INNER_BLOOM_PULSE_MAX = 7;
const INNER_BLOOM_PULSE_PERIOD_SEC = 5;

let innerBloomPulsePhase = 0;
let innerBloomPulseReducedMotion = false;
/** Макс. яркость кружка от свечения дуги — для пульса центра. */
let arcGlowPulseGate = 0;

/**
 * @param {number} value
 */
export function setArcGlowPulseGate(value) {
	arcGlowPulseGate = value;
}

if (typeof window !== "undefined") {
	const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
	innerBloomPulseReducedMotion = motionQuery.matches;
	motionQuery.addEventListener("change", (event) => {
		innerBloomPulseReducedMotion = event.matches;
	});
}

function isInnerBloomPulseEnabled() {
	if (innerBloomPulseReducedMotion) {
		return false;
	}
	if (typeof document !== "undefined" && document.hidden) {
		return false;
	}
	return getGraphicsTier() !== "low";
}

/**
 * @param {number} dt — секунды
 * @returns {boolean} true, если нужна перерисовка из-за пульса bloom
 */
export function tickInnerBloomPulse(dt) {
	if (!isInnerBloomPulseEnabled()) {
		return false;
	}

	if (arcGlowPulseGate < 0.98) {
		return false;
	}

	innerBloomPulsePhase += dt;
	return true;
}

/** Пульс bloom активного кружка — держит rAF в покое на пункте. */
export function isInnerBloomPulseActive() {
	if (!isInnerBloomPulseEnabled()) {
		return false;
	}
	return arcGlowPulseGate >= 0.98;
}

/**
 * @param {number} highlight
 * @param {number} configBlur
 */
export function getInnerBloomPulseBlur(highlight, configBlur) {
	if (highlight < 0.02) {
		return 0;
	}

	if (!isInnerBloomPulseEnabled() || highlight < 0.98) {
		return configBlur * highlight;
	}

	const wave = 0.5 + 0.5 * Math.sin((innerBloomPulsePhase * Math.PI * 2) / INNER_BLOOM_PULSE_PERIOD_SEC);
	const pulsed = INNER_BLOOM_PULSE_MIN + (INNER_BLOOM_PULSE_MAX - INNER_BLOOM_PULSE_MIN) * wave;
	return pulsed * highlight;
}
