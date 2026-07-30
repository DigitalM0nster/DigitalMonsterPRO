/**
 * Позиции пунктов на полукруглой дуге (центр на правом краю экрана).
 * @param {number} count
 * @param {number} radiusPx
 */
export function getArcStepPositions(count, radiusPx) {
	if (count <= 0) {
		return [];
	}

	const spreadRad = Math.min(Math.PI * 0.72, Math.PI / 5 + count * (Math.PI / 18));

	return Array.from({ length: count }, (_, index) => {
		const t = count === 1 ? 0.5 : index / (count - 1);
		const angle = Math.PI - spreadRad + spreadRad * 2 * t;
		return {
			x: Math.cos(angle) * radiusPx,
			y: Math.sin(angle) * radiusPx,
			angle,
		};
	});
}

/**
 * SVG path дуги между первым и последним пунктом.
 * @param {number} radiusPx
 * @param {number} spreadRad
 */
export function getArcTrackPath(radiusPx, spreadRad) {
	const startAngle = Math.PI - spreadRad;
	const endAngle = Math.PI + spreadRad;
	const x1 = Math.cos(startAngle) * radiusPx;
	const y1 = Math.sin(startAngle) * radiusPx;
	const x2 = Math.cos(endAngle) * radiusPx;
	const y2 = Math.sin(endAngle) * radiusPx;
	const largeArc = spreadRad * 2 > Math.PI ? 1 : 0;

	return `M ${x1} ${y1} A ${radiusPx} ${radiusPx} 0 ${largeArc} 1 ${x2} ${y2}`;
}

/** @param {number} count */
export function getArcSpreadRad(count) {
	return Math.min(Math.PI * 0.72, Math.PI / 5 + count * (Math.PI / 18));
}

/**
 * @param {number} radiusPx
 * @param {number} spreadRad
 */
export function getArcLength(radiusPx, spreadRad) {
	return radiusPx * spreadRad * 2;
}
