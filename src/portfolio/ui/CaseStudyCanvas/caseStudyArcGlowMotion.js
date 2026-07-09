import { getGraphicsTier } from "@/utils/getGraphicsTier.js";

/** Скорость «поездки» свечения по дуге. */
const GLOW_TRAVEL_LERP_SPEED = 5;

let glowAngleRad = 0;
let glowTargetAngleRad = 0;
let glowMotionInitialized = false;
let glowManualOverride = false;

function shouldSnapGlowMotion() {
	if (typeof window === "undefined") {
		return false;
	}
	try {
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			return true;
		}
	} catch {
		/* ignore */
	}
	return getGraphicsTier() === "low";
}

/**
 * @returns {boolean}
 */
export function isArcGlowManualOverride() {
	return glowManualOverride;
}

/**
 * @param {number | null | undefined} activeAngleRad
 */
export function syncArcGlowTargetFromActive(activeAngleRad) {
	if (activeAngleRad == null) {
		return;
	}

	glowTargetAngleRad = activeAngleRad;
	if (!glowMotionInitialized) {
		glowAngleRad = activeAngleRad;
		glowMotionInitialized = true;
	}
}

/**
 * Цель от скролла — сбрасывает ручной dev-оверрайд.
 * @param {number} angleRad
 */
export function syncArcGlowTargetFromScroll(angleRad) {
	glowManualOverride = false;
	syncArcGlowTargetFromActive(angleRad);
}

/**
 * Dev-слайдер: мгновенно ставит позицию без анимации.
 * @param {number} angleRad
 */
export function setArcGlowAngleImmediate(angleRad) {
	glowManualOverride = true;
	glowAngleRad = angleRad;
	glowTargetAngleRad = angleRad;
	glowMotionInitialized = true;
}

export function getArcGlowCenterAngleRad() {
	return glowAngleRad;
}

/**
 * @param {number} dt — секунды
 * @returns {boolean}
 */
export function tickArcGlowMotion(dt) {
	if (!glowMotionInitialized) {
		return false;
	}

	if (shouldSnapGlowMotion()) {
		if (Math.abs(glowAngleRad - glowTargetAngleRad) > 0.0003) {
			glowAngleRad = glowTargetAngleRad;
			return true;
		}
		return false;
	}

	const factor = 1 - Math.exp(-GLOW_TRAVEL_LERP_SPEED * dt);
	const next = glowAngleRad + (glowTargetAngleRad - glowAngleRad) * factor;

	if (Math.abs(next - glowTargetAngleRad) > 0.0003) {
		glowAngleRad = next;
		return true;
	}

	glowAngleRad = glowTargetAngleRad;
	return false;
}

/** Свечение ещё не доехало до цели — нужен ли rAF. */
export function isArcGlowAnimating() {
	if (!glowMotionInitialized) {
		return false;
	}
	return Math.abs(glowAngleRad - glowTargetAngleRad) > 0.0003;
}
