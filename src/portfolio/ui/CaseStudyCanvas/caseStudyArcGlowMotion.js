import { getGraphicsTier } from "@/utils/getGraphicsTier.js";

/** Скорость «поездки» свечения к выбранному узлу (до поворота кольца). */
const GLOW_TRAVEL_LERP_SPEED = 3.25;
/** Считаем «доехало» — snap + можно клеить к узлу. */
const GLOW_ARRIVE_EPS_RAD = 0.08;
/** Можно стартовать спин кольца, пока хвост свечения ещё доезжает. */
const GLOW_SPIN_HANDOFF_EPS_RAD = 0.22;

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

/** Shortest signed delta on a full circle (rad). */
function shortestRadDelta(from, to) {
	let delta = to - from;
	while (delta > Math.PI) {
		delta -= Math.PI * 2;
	}
	while (delta < -Math.PI) {
		delta += Math.PI * 2;
	}
	return delta;
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
 * Цель от скролла / выбора проекта — сбрасывает ручной dev-оверрайд.
 * @param {number} angleRad
 */
export function syncArcGlowTargetFromScroll(angleRad) {
	glowManualOverride = false;
	syncArcGlowTargetFromActive(angleRad);
}

/**
 * Keep glow glued to a moving node (no travel lag).
 * @param {number} angleRad
 */
export function stickArcGlowToAngle(angleRad) {
	if (angleRad == null || !Number.isFinite(angleRad)) {
		return;
	}
	glowManualOverride = false;
	glowAngleRad = angleRad;
	glowTargetAngleRad = angleRad;
	glowMotionInitialized = true;
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

	const delta = shortestRadDelta(glowAngleRad, glowTargetAngleRad);

	if (shouldSnapGlowMotion()) {
		if (Math.abs(delta) > GLOW_ARRIVE_EPS_RAD) {
			glowAngleRad = glowTargetAngleRad;
			return true;
		}
		return false;
	}

	const factor = 1 - Math.exp(-GLOW_TRAVEL_LERP_SPEED * dt);
	const step = delta * factor;

	if (Math.abs(delta - step) > GLOW_ARRIVE_EPS_RAD && Math.abs(delta) > GLOW_ARRIVE_EPS_RAD) {
		glowAngleRad += step;
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
	return Math.abs(shortestRadDelta(glowAngleRad, glowTargetAngleRad)) > GLOW_ARRIVE_EPS_RAD;
}

/** Достаточно близко к цели, чтобы начать поворот кольца без паузы. */
export function isArcGlowReadyForFocusSpin() {
	if (!glowMotionInitialized) {
		return true;
	}
	return Math.abs(shortestRadDelta(glowAngleRad, glowTargetAngleRad)) <= GLOW_SPIN_HANDOFF_EPS_RAD;
}
