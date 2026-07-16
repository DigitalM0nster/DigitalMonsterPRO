/**
 * Параметры орбиты ring_test.glb (Case1): R1 / R2 / R3.
 * Live-подгонка: /portfolio/01, клавиша 8 или ?case1Dev=1
 *
 * R1 — яркий белый; R2 — мягкий белый; R3 — синий с затуханием по глубине.
 */
export const case1RingConfig = {
	scale: 0.02,
	tiltX: 0.448,
	tiltY: -0.302,
	tiltZ: 0.298,
	spinAxis: "y",
	speedR1: 0.05,
	speedR2: 0.05,
	speedR3: 0.05,
	pointerSpinMul: 2.4,
	pointerTilt: 0.2,
	r1R: 0,
	r1G: 3.1,
	r1B: 4.95,
	r1Opacity: 0.56,
	r1CoreMix: 0.8,
	r1BloomBoost: 3,
	r1FadeNear: 1.84,
	r1FadeFar: 0,
	r2R: 1.1,
	r2G: 1.8,
	r2B: 2.65,
	r2Opacity: 0.7,
	r2CoreMix: 0.44,
	r2BloomBoost: 3,
	r2FadeNear: 0.98,
	r2FadeFar: 0.16,
	r3R: 0,
	r3G: 4,
	r3B: 6,
	r3Opacity: 1,
	r3CoreR: 0,
	r3CoreG: 1.05,
	r3CoreB: 6,
	r3CoreMix: 0.98,
	r3BloomBoost: 3,
	r3FadeNear: 1.52,
	r3FadeFar: 0.56,
	depthNear: 0.5,
	depthFar: 18.3,
	depthPower: 1.2,
};

export function cloneCase1RingConfig(source = case1RingConfig) {
	return { ...source };
}
