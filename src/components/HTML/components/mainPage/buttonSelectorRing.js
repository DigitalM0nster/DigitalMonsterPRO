/** Геометрия кольца button-selector: 3 дуги между точками, каждая — 2 половины от центра. */

const RING_CX = 54.015;
const RING_CY = 54;
const RING_R = 52;

/** Зазор у каждой точки: дуги не сходятся, между ними отступ (рад). */
const ARC_VERTEX_GAP = 0.14;

/** Углы трёх точек на кольце (aten7). */
const DOT_ANGLES = [
	Math.atan2(1.5 - RING_CY, 54.01 - RING_CX),
	Math.atan2(79.58 - RING_CY, 99.88 - RING_CX),
	Math.atan2(79.58 - RING_CY, 8.15 - RING_CX),
];

export const BUTTON_SELECTOR_DOTS = [
	{ cx: 54.01, cy: 1.5 },
	{ cx: 99.88, cy: 79.58 },
	{ cx: 8.15, cy: 79.58 },
];

function polar(cx, cy, r, angle) {
	return {
		x: cx + r * Math.cos(angle),
		y: cy + r * Math.sin(angle),
	};
}

function normalizeDelta(startAngle, endAngle) {
	let delta = endAngle - startAngle;
	if (delta <= 0) {
		delta += Math.PI * 2;
	}
	return delta;
}

/** SVG-дуга от startAngle к endAngle. */
function describeArc(startAngle, endAngle, clockwise = true) {
	const start = polar(RING_CX, RING_CY, RING_R, startAngle);
	const end = polar(RING_CX, RING_CY, RING_R, endAngle);
	let delta = endAngle - startAngle;

	if (clockwise) {
		if (delta < 0) {
			delta += Math.PI * 2;
		}
	} else if (delta > 0) {
		delta -= Math.PI * 2;
	}

	const sweep = clockwise ? 1 : 0;
	const largeArc = Math.abs(delta) > Math.PI ? 1 : 0;

	return `M ${start.x} ${start.y} A ${RING_R} ${RING_R} 0 ${largeArc} ${sweep} ${end.x} ${end.y}`;
}

/**
 * Три сегмента кольца; каждый — две половины от середины дуги к точкам.
 * @returns {Array<{ halfA: string, halfB: string }>}
 */
export function buildButtonSelectorRingSegments() {
	const segments = [];

	for (let i = 0; i < DOT_ANGLES.length; i += 1) {
		const cornerAngle = DOT_ANGLES[i];
		const nextCornerAngle = DOT_ANGLES[(i + 1) % DOT_ANGLES.length];
		// Дуга короче: отступ от каждой точки треугольника
		const startAngle = cornerAngle + ARC_VERTEX_GAP;
		const endAngle = nextCornerAngle - ARC_VERTEX_GAP;
		const delta = normalizeDelta(startAngle, endAngle);
		const midAngle = startAngle + delta * 0.5;

		segments.push({
			fullArc: describeArc(startAngle, endAngle, true),
			halfA: describeArc(midAngle, startAngle, false),
			halfB: describeArc(midAngle, endAngle, true),
		});
	}

	return segments;
}

export const BUTTON_SELECTOR_RING_VIEWBOX = "0 0 108.03 108";
