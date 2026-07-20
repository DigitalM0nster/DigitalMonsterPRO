/**
 * Подготовка canvas: CSS-размер, pixel buffer, DPR transform.
 */

import { getGraphicsConfig, resolveRendererPixelRatio } from "@/utils/getGraphicsTier.js";

/** Множитель bleed справа — на слабых tier меньше площадь отрисовки. */
const CASE_STUDY_BLEED_MUL = {
	low: 0.7,
	medium: 0.85,
	high: 1,
};

/**
 * @param {'low' | 'medium' | 'high'} [graphicsTier]
 */
export function resolveCaseStudyCanvasPixelRatio(graphicsTier = "medium") {
	const device = typeof window !== "undefined" && Number.isFinite(window.devicePixelRatio) ? window.devicePixelRatio : 1;

	const resolved = resolveRendererPixelRatio(graphicsTier, device);
	const cap = getGraphicsConfig(graphicsTier).caseCanvasDprCap ?? resolved;
	return Math.min(resolved, cap);
}

/**
 * WebGL panel HUD only — match drawing-buffer DPR. Safe because textures upload on content change, not scroll.
 * @param {'low' | 'medium' | 'high'} [graphicsTier]
 */
export function resolveCaseStudyPanelHudPixelRatio(graphicsTier = "medium") {
	const device = typeof window !== "undefined" && Number.isFinite(window.devicePixelRatio) ? window.devicePixelRatio : 1;
	return resolveRendererPixelRatio(graphicsTier, device);
}

/**
 * @param {'low' | 'medium' | 'high'} [graphicsTier]
 * @param {number} [baseBleed]
 */
export function resolveCaseStudyCanvasBleedRight(graphicsTier = "medium", baseBleed = 0) {
	const mul = CASE_STUDY_BLEED_MUL[graphicsTier] ?? CASE_STUDY_BLEED_MUL.medium;
	return Math.max(160, Math.round(baseBleed * mul));
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {number} cssW
 * @param {number} cssH
 * @param {number} [pixelRatio] — уже разрешённый DPR (см. resolveCaseStudyCanvasPixelRatio)
 * @returns {CanvasRenderingContext2D | null}
 */
export function prepareCaseStudyCanvasContext(canvas, cssW, cssH, pixelRatio = 1) {
	canvas.style.width = `${cssW}px`;
	canvas.style.height = `${cssH}px`;

	const dpr = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
	const pixelW = Math.max(1, Math.round(cssW * dpr));
	const pixelH = Math.max(1, Math.round(cssH * dpr));

	if (canvas.width !== pixelW || canvas.height !== pixelH) {
		canvas.width = pixelW;
		canvas.height = pixelH;
	}

	const ctx = canvas.getContext("2d");
	if (!ctx) {
		return null;
	}

	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	return ctx;
}

/**
 * @param {HTMLCanvasElement | null} canvas
 * @returns {{ viewportW: number, viewportH: number, container: HTMLElement | null }}
 */
export function readCaseStudyCanvasViewport(canvas) {
	const host = canvas?.parentElement ?? null;
	const viewportW = host?.clientWidth ?? canvas?.clientWidth ?? 0;
	const viewportH = host?.clientHeight ?? canvas?.clientHeight ?? 0;

	return { viewportW, viewportH, host, canvas };
}

/**
 * @param {HTMLCanvasElement | null | undefined} canvas
 * @param {HTMLElement | null | undefined} [host]
 */
export function resolveCaseStudyCanvasOriginPx(canvas, host = canvas?.parentElement ?? null) {
	const el = canvas ?? host;
	if (!el || typeof el.getBoundingClientRect !== "function") {
		return { x: 0, y: 0 };
	}

	const rect = el.getBoundingClientRect();
	return { x: rect.left, y: rect.top };
}
