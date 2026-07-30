/**
 * Cyclic project ring on the case arc — angles wrap; focus takes the shortest path.
 */

/**
 * @param {number} deg
 * @param {number} periodDeg
 */
export function wrapDegToPeriod(deg, periodDeg) {
	if (!(periodDeg > 0) || !Number.isFinite(deg)) {
		return deg;
	}
	return deg - periodDeg * Math.round(deg / periodDeg);
}

/**
 * Shortest signed delta from → to on a cyclic period.
 * @param {number} fromDeg
 * @param {number} toDeg
 * @param {number} periodDeg
 */
export function shortestDegDelta(fromDeg, toDeg, periodDeg) {
	return wrapDegToPeriod(toDeg - fromDeg, periodDeg);
}

/**
 * Ring angle for project `index` given continuous focus (degrees), wrapped to (-period/2, period/2].
 * @param {number} index
 * @param {number} focusDeg
 * @param {number} gapDeg
 * @param {number} count
 */
export function getCyclicItemRelativeDeg(index, focusDeg, gapDeg, count) {
	if (count <= 0) {
		return 0;
	}
	const periodDeg = count * gapDeg;
	return wrapDegToPeriod(index * gapDeg - focusDeg, periodDeg);
}
