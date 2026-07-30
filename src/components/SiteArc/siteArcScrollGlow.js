const DEG = Math.PI / 180;

/** В пределах этого угла от кружка цель плавно «дотягивается» до центра пункта. */
const NODE_SNAP_THRESHOLD_DEG = 5;

/**
 * @param {number} t
 */
function smoothstep(t) {
	const x = Math.max(0, Math.min(1, t));
	return x * x * (3 - 2 * x);
}

/**
 * Угол свечения по scrollProgress: интерполяция между пунктами + магнит к кружку вблизи.
 *
 * @param {number} scrollProgress
 * @param {number[]} nodeAnglesRad
 * @param {number[]} nodeScrollAnchors
 * @param {number} [snapThresholdDeg]
 * @returns {number | null}
 */
export function resolveArcGlowAngleFromScroll(
	scrollProgress,
	nodeAnglesRad,
	nodeScrollAnchors,
	snapThresholdDeg = NODE_SNAP_THRESHOLD_DEG,
) {
	if (!nodeAnglesRad.length) {
		return null;
	}
	if (nodeAnglesRad.length === 1) {
		return nodeAnglesRad[0];
	}

	const progress = Math.max(0, Math.min(1, scrollProgress));
	let rawAngle = nodeAnglesRad[0];

	if (progress <= nodeScrollAnchors[0]) {
		rawAngle = nodeAnglesRad[0];
	} else if (progress >= nodeScrollAnchors[nodeScrollAnchors.length - 1]) {
		rawAngle = nodeAnglesRad[nodeAnglesRad.length - 1];
	} else {
		for (let i = 0; i < nodeScrollAnchors.length - 1; i += 1) {
			const anchorStart = nodeScrollAnchors[i];
			const anchorEnd = nodeScrollAnchors[i + 1];
			if (progress < anchorStart || progress > anchorEnd) {
				continue;
			}

			const span = anchorEnd - anchorStart;
			const t = span > 1e-6 ? (progress - anchorStart) / span : 0;
			rawAngle = nodeAnglesRad[i] + (nodeAnglesRad[i + 1] - nodeAnglesRad[i]) * t;
			break;
		}
	}

	const snapRad = snapThresholdDeg * DEG;
	let nearestAngle = nodeAnglesRad[0];
	let nearestDist = Math.abs(rawAngle - nearestAngle);

	for (const nodeAngle of nodeAnglesRad) {
		const dist = Math.abs(rawAngle - nodeAngle);
		if (dist < nearestDist) {
			nearestDist = dist;
			nearestAngle = nodeAngle;
		}
	}

	if (nearestDist >= snapRad) {
		return rawAngle;
	}

	const snapWeight = smoothstep(1 - nearestDist / snapRad);
	return rawAngle + (nearestAngle - rawAngle) * snapWeight;
}
