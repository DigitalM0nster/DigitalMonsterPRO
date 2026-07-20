import { getSceneCarousel } from "@/three/render/transition/carouselPage.js";
import { getHexRevealFromTop, getHexShaderProgress } from "./hexShaderProgress.js";

/**
 * Screen-Y hit ownership during hex / carousel mix.
 *
 * Visual wipe is hex-cell based; hit bands are a cheap product approximation:
 * - forward (reveal from bottom): top (1−P) → source, bottom P → target
 * - backward (reveal from top): top P → target, bottom (1−P) → source
 *
 * At P=0.8 forward → top 20% current, bottom 80% next.
 */

/**
 * @param {number} clientY
 * @param {number} [viewportH]
 */
export function yNormFromTopFromClientY(clientY, viewportH = typeof window !== "undefined" ? window.innerHeight : 1) {
	if (!(viewportH > 0) || !Number.isFinite(clientY)) {
		return 0.5;
	}
	return Math.min(1, Math.max(0, clientY / viewportH));
}

/**
 * Viewport NDC Y: +1 top, −1 bottom (DigitalMonsterThreeApp.viewportPointer).
 * @param {number} ndcY
 */
export function yNormFromTopFromNdcY(ndcY) {
	if (!Number.isFinite(ndcY)) {
		return 0.5;
	}
	return Math.min(1, Math.max(0, (1 - ndcY) * 0.5));
}

/**
 * @param {{
 *   yNormFromTop: number,
 *   mixProgress: number,
 *   revealFromTop?: boolean,
 *   sourceId?: string | null,
 *   targetId?: string | null,
 * }} opts
 * @returns {string | null}
 */
export function resolveHexHitOwnerSceneId({
	yNormFromTop,
	mixProgress,
	revealFromTop = false,
	sourceId = null,
	targetId = null,
}) {
	const p = Math.min(1, Math.max(0, Number(mixProgress) || 0));
	const source = sourceId || null;
	const target = targetId || null;

	if (p <= 0.001) {
		return source ?? target;
	}
	if (p >= 0.999) {
		return target ?? source;
	}
	if (!source && !target) {
		return null;
	}
	if (!source || !target || source === target) {
		return source ?? target;
	}

	const y = Math.min(1, Math.max(0, Number(yNormFromTop) || 0));
	if (revealFromTop) {
		return y < p ? target : source;
	}
	return y < (1 - p) ? source : target;
}

/**
 * Live owner for a pointer Y (carousel mix + hex click).
 * @param {number} clientY
 * @param {number} [viewportH]
 * @returns {string | null}
 */
export function getHexHitOwnerSceneIdAtClientY(clientY, viewportH) {
	const carousel = getSceneCarousel();
	const { sourceId, targetId } = carousel.getMixSourceTargetIds();
	return resolveHexHitOwnerSceneId({
		yNormFromTop: yNormFromTopFromClientY(clientY, viewportH),
		mixProgress: getHexShaderProgress(),
		revealFromTop: getHexRevealFromTop(),
		sourceId,
		targetId,
	});
}

/**
 * @param {string | null | undefined} sceneId
 * @param {number} clientY
 * @param {number} [viewportH]
 */
export function sceneOwnsHexHitAtClientY(sceneId, clientY, viewportH) {
	if (!sceneId) {
		return false;
	}
	return getHexHitOwnerSceneIdAtClientY(clientY, viewportH) === sceneId;
}

/**
 * Shared case chrome (arc / panel HUD).
 * At rest the carousel source is usually a ring page (hub/about), not `case*` —
 * the overlay is still the active case UI, so hits must work. Y-band only mid-mix.
 * @param {number} clientY
 * @param {number} [viewportH]
 */
export function caseChromeOwnsHexHitAtClientY(clientY, viewportH) {
	const mixProgress = getHexShaderProgress();
	if (mixProgress <= 0.001) {
		return true;
	}
	const owner = getHexHitOwnerSceneIdAtClientY(clientY, viewportH);
	return typeof owner === "string" && owner.startsWith("case");
}
