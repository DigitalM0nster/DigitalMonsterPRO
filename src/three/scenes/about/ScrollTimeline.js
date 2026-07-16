import * as THREE from "three";
import { ABOUT_LAYER_SEPARATION, ABOUT_SCROLL_RANGES } from "./aboutSceneConfig.js";

function clamp01(value) {
	return THREE.MathUtils.clamp(value, 0, 1);
}

function smooth01(value) {
	const t = clamp01(value);
	return t * t * (3 - 2 * t);
}

/** Smooth blend across [start, end]. */
function blend(progress, start, end) {
	if (end <= start) return progress >= end ? 1 : 0;
	return smooth01((progress - start) / (end - start));
}

/** Bell curve peaking in the middle of [start, end]. */
function peak(progress, start, end) {
	const mid = (start + end) * 0.5;
	const half = (end - start) * 0.5;
	if (half <= 0) return 0;
	const t = 1 - Math.abs(progress - mid) / half;
	return smooth01(t);
}

/**
 * Sample every scroll-driven pose/material uniform from one normalized progress.
 * Fully reversible — no direction-dependent state.
 */
export function sampleScrollTimeline(rawProgress) {
	const p = clamp01(Number(rawProgress) || 0);
	const [s1a, s1b] = ABOUT_SCROLL_RANGES.scene1;
	const [s2a, s2b] = ABOUT_SCROLL_RANGES.scene2;
	const [s3a, s3b] = ABOUT_SCROLL_RANGES.scene3;
	const [s4a, s4b] = ABOUT_SCROLL_RANGES.scene4;

	const into2 = blend(p, s1b - 0.04, s2a + 0.08);
	const into3 = blend(p, s2b - 0.05, s3a + 0.1);
	const into4 = blend(p, s3b - 0.04, s4a + 0.12);
	const scene2Peak = peak(p, s2a, s2b);
	const scene3Peak = peak(p, s3a, s3b);
	const scene4Amount = blend(p, s4a, s4b);

	// Root orientation: slight yaw → face camera → three-quarter → hold
	const rootYaw =
		THREE.MathUtils.lerp(-0.42, -0.18, into2) +
		THREE.MathUtils.lerp(0, 0.55, into3) +
		THREE.MathUtils.lerp(0, -0.08, into4);
	const rootPitch =
		THREE.MathUtils.lerp(0.12, 0.04, into2) +
		THREE.MathUtils.lerp(0, -0.08, into3) +
		THREE.MathUtils.lerp(0, 0.02, into4);
	const rootRoll = THREE.MathUtils.lerp(0.06, 0.02, into2) + THREE.MathUtils.lerp(0, -0.04, into3);

	const rootScale =
		1 +
		into2 * 0.08 +
		into3 * 0.04 -
		into4 * 0.06;

	const cameraZ =
		8.4 -
		into2 * 0.55 -
		into3 * 0.35 +
		into4 * 0.9;

	const cameraX = into3 * -0.25 + into4 * 0.15;
	const cameraY = into3 * 0.2 + into4 * -0.05;

	// Shell glass / opacity
	const glassAmount = THREE.MathUtils.clamp(into2 * 0.85 + scene2Peak * 0.35 - into4 * 0.15, 0, 1);
	const shellOpacity = THREE.MathUtils.lerp(0.94, 0.48, glassAmount);
	const shellTransmission = glassAmount * 0.4;
	const shellMetalness = THREE.MathUtils.lerp(0.58, 0.35, glassAmount);
	const shellRoughness = THREE.MathUtils.lerp(0.18, 0.12, glassAmount);

	const networkVisibility = THREE.MathUtils.clamp(
		Math.max(0, into2 - 0.15) * 0.7 + scene2Peak * 0.55 + into3 * 0.4 + scene4Amount * 0.3,
		0,
		1,
	);
	const networkPulse = 0.7 + scene2Peak * 0.55 + scene3Peak * 0.35;

	const energyVisibility = THREE.MathUtils.clamp(scene2Peak * 1.35 - into3 * 0.95, 0, 1);
	const insetOpacity = Math.max(0, 1 - into2 * 1.35);
	const groundRings = THREE.MathUtils.clamp(1.05 - into3 * 1.1, 0, 1);
	const groundGlow = THREE.MathUtils.clamp(into3 * 1.05 + scene3Peak * 0.4 - into4 * 0.3, 0, 1);

	const contourOuter = 0.95 + into2 * 0.15 + into3 * 0.4 + scene4Amount * 0.2;
	const contourInner = 1.05 + into2 * 0.1 + into3 * 0.45;
	const innerRingGlow = 0.9 + into3 * 0.55 + scene3Peak * 0.35;
	const engineeringGlow = 0.55 + into2 * 0.2 + into3 * 0.55 + scene4Amount * 0.35;

	const sep = ABOUT_LAYER_SEPARATION;
	const layerSpread = scene4Amount;

	return {
		progress: p,
		rootYaw,
		rootPitch,
		rootRoll,
		rootScale,
		cameraZ,
		cameraX,
		cameraY,
		shellOpacity,
		shellTransmission,
		shellMetalness,
		shellRoughness,
		glassAmount,
		networkVisibility,
		networkPulse,
		energyVisibility,
		insetOpacity,
		groundRings,
		groundGlow,
		contourOuter,
		contourInner,
		innerRingGlow,
		engineeringGlow,
		shellOffsetX: sep.shell.x * layerSpread,
		shellOffsetZ: sep.shell.z * layerSpread,
		shellExtraYaw: sep.shellYaw * layerSpread,
		networkOffsetX: sep.network.x * layerSpread,
		networkOffsetZ: sep.network.z * layerSpread,
		engineeringOffsetX: sep.engineering.x * layerSpread,
		engineeringOffsetZ: sep.engineering.z * layerSpread,
		engineeringExtraYaw: sep.engineeringYaw * layerSpread,
		idleStrength: 1 - scene4Amount * 0.55,
	};
}

export { clamp01, smooth01, blend, peak };
