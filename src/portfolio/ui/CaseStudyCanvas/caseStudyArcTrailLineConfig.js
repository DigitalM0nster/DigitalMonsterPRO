import { getArcLineStrokeStyle } from "./caseStudyArcConfig.js";

/**
 * Вторая линия на дуге — «след» от начала до позиции свечения активного пункта.
 */
export const caseStudyArcTrailLineConfig = {
	opacity: 0.65,
	glowBlur: 8,
	glowStrength: 1.75,
};

export const ARC_TRAIL_ACTIVE_HIGHLIGHT_THRESHOLD = 0.55;

function smoothstep(t) {
	const x = Math.max(0, Math.min(1, t));
	return x * x * (3 - 2 * x);
}

/**
 * 0 = активный вид, 1 = trail. Прошлый стиль — только после смены activeNavIndex.
 */
export function getArcNodeTrailBlend(navIndex, activeNavIndex, glowCenterAngleRad, nodeAnglesRad) {
	if (activeNavIndex < 0 || navIndex >= activeNavIndex) {
		return 0;
	}

	if (navIndex < activeNavIndex - 1) {
		return 1;
	}

	const fromAngle = nodeAnglesRad[navIndex];
	const toAngle = nodeAnglesRad[activeNavIndex];
	if (glowCenterAngleRad == null || fromAngle == null || toAngle == null) {
		return 0;
	}

	const span = toAngle - fromAngle;
	if (Math.abs(span) < 1e-6) {
		return 1;
	}

	const travelT = Math.max(0, Math.min(1, (glowCenterAngleRad - fromAngle) / span));
	return smoothstep(travelT);
}

/**
 * Текущий пункт: 0 = яркий актив, 1 = trail-синий, пока свечение уезжает к следующему.
 */
export function getArcActiveNodeExitBlend(activeNavIndex, glowCenterAngleRad, nodeAnglesRad) {
	const fromAngle = nodeAnglesRad[activeNavIndex];
	const toAngle = nodeAnglesRad[activeNavIndex + 1];
	if (glowCenterAngleRad == null || fromAngle == null || toAngle == null) {
		return 0;
	}

	const span = toAngle - fromAngle;
	if (Math.abs(span) < 1e-6) {
		return 0;
	}

	const travelT = Math.max(0, Math.min(1, (glowCenterAngleRad - fromAngle) / span));
	return smoothstep(travelT);
}

/**
 * Единый trail-blend: прошлые пункты + угасание текущего при отходе линии.
 */
export function resolveArcNodeTrailBlend(navIndex, activeNavIndex, glowCenterAngleRad, nodeAnglesRad) {
	if (activeNavIndex < 0 || navIndex > activeNavIndex) {
		return 0;
	}

	if (navIndex < activeNavIndex) {
		return getArcNodeTrailBlend(navIndex, activeNavIndex, glowCenterAngleRad, nodeAnglesRad);
	}

	return getArcActiveNodeExitBlend(activeNavIndex, glowCenterAngleRad, nodeAnglesRad);
}

/**
 * Яркость кружка: активный bloom → trail-синий, не серый inactive.
 */
export function resolveArcNodeMarkerHighlight(navIndex, activeNavIndex, glowHighlight, trailBlend) {
	if (navIndex > activeNavIndex) {
		return glowHighlight;
	}

	if (trailBlend >= 0.999) {
		return 0;
	}

	const activePeak = navIndex < activeNavIndex ? Math.max(glowHighlight, 1) : 1;
	if (trailBlend <= 0.001) {
		return activePeak;
	}

	return activePeak * (1 - trailBlend);
}

export function blendArcNavLabelColor(hex, activeAlpha, trailAlpha, trailBlend) {
	const alpha = activeAlpha + (trailAlpha - activeAlpha) * trailBlend;
	return getArcLineStrokeStyle(hex, alpha);
}

/**
 * Подпись: inactive → active по glowHighlight (0…1).
 */
export function blendArcNavLabelByGlow(hex, inactiveAlpha, glowHighlight) {
	return blendArcNavLabelColor(hex, 1, inactiveAlpha, 1 - Math.max(0, Math.min(1, glowHighlight)));
}

export function getTrailNodeBloomAlpha(trailCfg) {
	return Math.min(1, trailCfg.opacity * trailCfg.glowStrength);
}
