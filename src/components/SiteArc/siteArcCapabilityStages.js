import { wrapDegToPeriod } from "./siteArcCycle.js";

const CAPABILITY_STAGE_GAP_RAD = 6.5 * (Math.PI / 180);
const CAPABILITY_NODE_SCALE = 0.5;
const DEG = Math.PI / 180;

export const SITE_ARC_CAPABILITY_STAGE_COUNT = 4;

/**
 * Capabilities permanently occupy four compact nodes below Portfolio. Keeping
 * this geometry static avoids a route-dependent layout shift in the site arc.
 */
export function resolveSiteArcCapabilityStages(navStates, {
	focusDeg,
	ringGapDeg,
	rotationRad,
}) {
	const capabilitiesIndex = navStates.findIndex((item) => item.id === "capabilities");
	if (capabilitiesIndex < 0 || navStates.length === 0 || !(ringGapDeg > 0)) {
		const routeAngles = navStates.map((_, index) => (
			wrapDegToPeriod(index * ringGapDeg - focusDeg, navStates.length * ringGapDeg)
				* DEG + rotationRad
		));
		return {
			routeAngles,
			routeRadiusScales: navStates.map(() => 1),
			extraNodes: [],
			capabilitiesIndex,
			stageAngles: [],
		};
	}

	const stageGapDeg = CAPABILITY_STAGE_GAP_RAD / DEG;
	const totalGapDeg = stageGapDeg * (SITE_ARC_CAPABILITY_STAGE_COUNT - 1);
	const basePeriodDeg = navStates.length * ringGapDeg;
	const expandedPeriodDeg = basePeriodDeg + totalGapDeg;
	const capabilityOffsetDeg = capabilitiesIndex * ringGapDeg;
	const nextRouteOffsetDeg = capabilityOffsetDeg + ringGapDeg;
	const expandedSegmentDeg = ringGapDeg + totalGapDeg;

	// Map the old continuous focus onto the expanded ring before wrapping.
	// Shifting already-wrapped angles made About overlap Home and Contacts
	// overlap Portfolio whenever the cyclic seam sat after Capabilities.
	const focusCycle = Math.floor(focusDeg / basePeriodDeg);
	const focusLocalDeg = focusDeg - focusCycle * basePeriodDeg;
	let expandedFocusLocalDeg;
	if (focusLocalDeg <= capabilityOffsetDeg) {
		expandedFocusLocalDeg = focusLocalDeg;
	} else if (focusLocalDeg < nextRouteOffsetDeg) {
		const segmentProgress = (focusLocalDeg - capabilityOffsetDeg) / ringGapDeg;
		expandedFocusLocalDeg = capabilityOffsetDeg + expandedSegmentDeg * segmentProgress;
	} else {
		expandedFocusLocalDeg = focusLocalDeg + totalGapDeg;
	}
	const expandedFocusDeg = focusCycle * expandedPeriodDeg + expandedFocusLocalDeg;
	const toAngle = (logicalOffsetDeg) => (
		wrapDegToPeriod(logicalOffsetDeg - expandedFocusDeg, expandedPeriodDeg)
			* DEG + rotationRad
	);
	const routeAngles = navStates.map((_, index) => toAngle(
		index * ringGapDeg + (index > capabilitiesIndex ? totalGapDeg : 0),
	));
	const firstStageOffsetDeg = capabilityOffsetDeg;
	const stageAngles = Array.from(
		{ length: SITE_ARC_CAPABILITY_STAGE_COUNT },
		(_, index) => toAngle(firstStageOffsetDeg + stageGapDeg * index),
	);

	return {
		routeAngles,
		routeRadiusScales: navStates.map((_, index) => (
			index === capabilitiesIndex ? CAPABILITY_NODE_SCALE : 1
		)),
		extraNodes: stageAngles.slice(1).map((angle) => ({
			angle,
			radiusScale: CAPABILITY_NODE_SCALE,
			opacity: 1,
		})),
		capabilitiesIndex,
		stageAngles,
	};
}
