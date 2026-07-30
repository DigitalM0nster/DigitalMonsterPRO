/**
 * Автодоводка скролла кейса к scrollAnchor этапов — аналог rest-snap карусели (SceneCarousel).
 */

/** Порог сегмента: ближе к началу → к предыдущему anchor, иначе к следующему. */
export const CASE_SCROLL_SEGMENT_MIDPOINT = 0.5;

/** Скорость дотягивания target к anchor (exp decay, 1/с). Как CAROUSEL_PROGRESS_TARGET_RETURN_SMOOTH. */
export const CASE_SCROLL_SNAP_REST_SMOOTH = 1.5;

/** Финальная зона — ускоренное дотягивание. */
export const CASE_SCROLL_SNAP_FINAL_ZONE = 0.02;

export const CASE_SCROLL_SNAP_FINAL_SMOOTH_MUL = 15;

/**
 * @param {import('./types.js').PortfolioState[]} states
 * @returns {number[]}
 */
export function buildCaseScrollSnapAnchors(states) {
	if (!states?.length) {
		return [];
	}

	return states.map(
		(state, index) => state.scrollAnchor ?? index / Math.max(states.length - 1, 1),
	);
}

/**
 * Якорь этапа, на котором «стоим» — наибольший anchor ≤ progress.
 *
 * @param {number} progress
 * @param {number[]} anchors
 */
export function getSettledScrollAnchor(progress, anchors) {
	if (!anchors?.length) {
		return progress;
	}

	const sorted = [...anchors].sort((a, b) => a - b);
	const p = Math.max(0, Math.min(1, progress));
	let settled = sorted[0];

	for (let i = 0; i < sorted.length; i += 1) {
		if (p >= sorted[i] - 1e-5) {
			settled = sorted[i];
		} else {
			break;
		}
	}

	return settled;
}

/**
 * К какому normalized scroll (0…1) дотянуть — ближайший anchor по правилу полусегмента.
 *
 * @param {number} progress
 * @param {number[]} anchors
 * @param {{ scrollIntent?: 'forward' | 'backward' | null, gestureStartAnchor?: number }} [options]
 */
export function getCaseScrollSnapRestTarget(progress, anchors, options = {}) {
	if (!anchors?.length) {
		return progress;
	}

	const sorted = [...anchors].sort((a, b) => a - b);
	const p = Math.max(0, Math.min(1, progress));

	if (p <= sorted[0]) {
		return sorted[0];
	}

	let rest = sorted[sorted.length - 1];

	for (let i = 0; i < sorted.length; i += 1) {
		const segmentStart = sorted[i];
		const segmentEnd = i < sorted.length - 1 ? sorted[i + 1] : 1;

		if (p < segmentStart) {
			continue;
		}

		if (p > segmentEnd && i < sorted.length - 1) {
			continue;
		}

		const span = segmentEnd - segmentStart;
		if (span < 1e-6) {
			rest = segmentStart;
			break;
		}

		const clamped = Math.min(p, segmentEnd);
		const localT = (clamped - segmentStart) / span;
		rest = localT < CASE_SCROLL_SEGMENT_MIDPOINT ? segmentStart : segmentEnd;
		break;
	}

	// Скролл вверх без движения вниз — не дотягиваем к следующему этапу (как scrollIntent у карусели).
	if (options.scrollIntent === "backward" && options.gestureStartAnchor != null) {
		rest = Math.min(rest, options.gestureStartAnchor);
	}

	return rest;
}

/**
 * Плавно дотягивает progress к rest-target (каждый кадр в rAF).
 *
 * @param {number} progress
 * @param {number[]} anchors
 * @param {number} dt — секунды
 * @param {{ scrollIntent?: 'forward' | 'backward' | null, gestureStartAnchor?: number }} [snapOptions]
 */
export function applyCaseScrollTargetRest(progress, anchors, dt, snapOptions = {}) {
	if (!anchors?.length || !Number.isFinite(dt) || dt <= 0) {
		return progress;
	}

	const rest = getCaseScrollSnapRestTarget(progress, anchors, snapOptions);
	if (Math.abs(progress - rest) < 0.00005) {
		return rest;
	}

	const dist = Math.abs(rest - progress);
	const finalMul =
		dist <= CASE_SCROLL_SNAP_FINAL_ZONE ? CASE_SCROLL_SNAP_FINAL_SMOOTH_MUL : 1;
	const t = 1 - Math.exp(-CASE_SCROLL_SNAP_REST_SMOOTH * finalMul * dt);

	return progress + (rest - progress) * t;
}

/**
 * @param {number} progress
 * @param {number[]} anchors
 * @param {{ scrollIntent?: 'forward' | 'backward' | null, gestureStartAnchor?: number }} [snapOptions]
 */
export function isCaseScrollSnapSettled(progress, anchors, snapOptions = {}) {
	if (!anchors?.length) {
		return true;
	}

	const rest = getCaseScrollSnapRestTarget(progress, anchors, snapOptions);
	return Math.abs(progress - rest) < 0.00005;
}
