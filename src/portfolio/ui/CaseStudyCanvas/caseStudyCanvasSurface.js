/**
 * Подготовка canvas: CSS-размер, pixel buffer, DPR transform.
 */

/** HUD 2D поверх 3D — ниже DPR, чем WebGL (меньше пикселей на shadowBlur). */
const CASE_STUDY_DPR_CAP = {
	low: 1,
	medium: 1,
	high: 1.5,
};

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
	const cap = CASE_STUDY_DPR_CAP[graphicsTier] ?? CASE_STUDY_DPR_CAP.medium;
	const device =
		typeof window !== "undefined" && Number.isFinite(window.devicePixelRatio)
			? window.devicePixelRatio
			: 1;

	return Math.min(device, cap);
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
