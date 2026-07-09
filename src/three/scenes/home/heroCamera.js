/** Фиксированная точка взгляда (не настраивается в dev). */
export const HERO_LOOK_AT = Object.freeze({
	x: 10,
	y: -1.5,
	z: -38,
});

/** Базовая камера hero-сцены: якоря при p = −1, 0, +1. */
export const heroCamera = {
	/** X при p = −1 / 0 / +1. */
	xLeft: 10.2,
	x: -11.5,
	xRight: 4,
	/** Y при p = −1 / 0 / +1. */
	yTop: 5.4,
	y: 1.5,
	yBottom: 0.2,
	/** Z при p = −1 / 0 / +1. */
	zBack: 34,
	z: 26.5,
	zForward: 22,
	fov: 50,
	/**
	 * Easing между якорями: 1 = линейно, >1 = плавнее у −1 и +1.
	 * easePowerNeg — сегмент −1…0, easePowerPos — 0…+1.
	 */
	easePowerNeg: 2.2,
	easePowerPos: 2.2,
	parallaxX: 0.65,
	parallaxY: 0.45,
	parallaxLook: 0.15,
};

/** Ease-in-out с настраиваемой степенью (1 = линейно). */
export function easeInOutPower(t, power = 2) {
	const clamped = Math.max(0, Math.min(1, t));
	if (power <= 1) {
		return clamped;
	}
	if (clamped < 0.5) {
		return 0.5 * (2 * clamped) ** power;
	}
	return 1 - 0.5 * (2 * (1 - clamped)) ** power;
}

/** Ease-out: быстрый старт, нулевая скорость в конце (power = 1 → линейно). */
export function easeOutPower(t, power = 2) {
	const clamped = Math.max(0, Math.min(1, t));
	if (power <= 1) {
		return clamped;
	}
	return 1 - (1 - clamped) ** power;
}

/**
 * Линейный старт + мягкая посадка в конце.
 * outBias: чем больше, тем дольше сохраняется линейный характер в начале.
 */
export function easeLinearBlendOut(t, outPower = 5, outBias = 2.5) {
	const clamped = Math.max(0, Math.min(1, t));
	const linear = clamped;
	const easeOut = easeOutPower(clamped, outPower);
	const bias = Math.max(0.5, outBias);
	const blend = clamped ** bias;
	return linear * (1 - blend) + easeOut * blend;
}

/** Sin с настраиваемым смягчением (0 — обычный sin, 1 — smoothstep по огибающей). */
export function smoothSinePhase(phase, smoothness) {
	const s = Math.sin(phase);
	const smooth = Math.max(0, Math.min(1, smoothness ?? 0));
	if (smooth <= 0) {
		return s;
	}
	const u = s * 0.5 + 0.5;
	const softened = u * u * (3 - 2 * u);
	return s * (1 - smooth) + (softened * 2 - 1) * smooth;
}

/**
 * Кривая −1 → 0 → +1 через якоря при p = 0.
 * @param {number} p sceneProgress
 * @param {number} atZero значение при p = 0
 * @param {number} atNegOne значение при p = −1
 * @param {number} atPosOne значение при p = +1
 * @param {number} easePowerNeg
 * @param {number} easePowerPos
 */
export function lerpPiecewiseCurved(p, atZero, atNegOne, atPosOne, easePowerNeg, easePowerPos) {
	const clamped = Math.max(-1, Math.min(1, p));
	if (clamped <= 0) {
		const t = easeInOutPower(clamped + 1, easePowerNeg);
		return atNegOne + t * (atZero - atNegOne);
	}
	const t = easeInOutPower(clamped, easePowerPos);
	return atZero + t * (atPosOne - atZero);
}

/** @deprecated используй lerpPiecewiseCurved */
export function lerpPiecewise(p, atZero, atNegOne, atPosOne) {
	return lerpPiecewiseCurved(p, atZero, atNegOne, atPosOne, 1, 1);
}

/**
 * Камера по sceneProgress (−1…1): X, Y, Z по кривым; FOV фиксирован.
 * @param {number} sceneProgress
 */
export function getHeroCameraForSceneProgress(sceneProgress) {
	const p = Number.isFinite(sceneProgress) ? sceneProgress : 0;
	const { easePowerNeg, easePowerPos } = heroCamera;

	return {
		...heroCamera,
		x: lerpPiecewiseCurved(p, heroCamera.x, heroCamera.xLeft, heroCamera.xRight, easePowerNeg, easePowerPos),
		y: lerpPiecewiseCurved(p, heroCamera.y, heroCamera.yTop, heroCamera.yBottom, easePowerNeg, easePowerPos),
		z: lerpPiecewiseCurved(p, heroCamera.z, heroCamera.zBack, heroCamera.zForward, easePowerNeg, easePowerPos),
		fov: heroCamera.fov,
	};
}
