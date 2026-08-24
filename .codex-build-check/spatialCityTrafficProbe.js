import * as THREE from "three";
import { createSpatialCityTrafficSystem } from "../src/three/scenes/capabilities/spatialCity/spatialCityTraffic.js";

const traffic = createSpatialCityTrafficSystem({
	fogColor: new THREE.Color(0x02060d),
	fogNear: 6,
	fogFar: 25.5,
});
const result = {
	created: traffic.group instanceof THREE.Group,
	children: traffic.group.children.length,
	drawCalls: traffic.metrics.drawCallCount,
	triangles: traffic.metrics.triangleEstimate,
	simulation45: traffic.simulationValidation.valid,
	simulation120: traffic.stressValidation.valid,
	adversarial: traffic.adversarialValidation.valid,
	projection: traffic.qaProjectionValidation.valid,
	renderContract: traffic.renderValidation.valid,
	runtimeBoundary45: traffic.simulationValidation.runtimeReservationBoundary.valid,
	runtimeBoundary120: traffic.stressValidation.runtimeReservationBoundary.valid,
	productionCapabilityDecisions45:
		traffic.simulationValidation.productionCapabilityDecisionCallCount,
	testCapabilityDecisions45: traffic.simulationValidation.testCapabilityDecisionCallCount,
	capabilityViolations45: traffic.simulationValidation.reservationCapabilityViolationCount,
	minimumSimultaneousVisibleFragments:
		traffic.qaProjectionValidation.visibilityCoverage.minimumSimultaneousVisibleFragments,
};
if (!Object.values(result).every((value) => (
	typeof value !== "boolean" || value
))) {
	throw new Error(`spatial-city-traffic-minified-smoke:${JSON.stringify(result)}`);
}
traffic.group.traverse((object) => {
	object.geometry?.dispose?.();
	if (Array.isArray(object.material)) {
		for (const material of object.material) material.dispose?.();
	} else {
		object.material?.dispose?.();
	}
});
console.log(`SPATIAL_CITY_TRAFFIC_MINIFIED_SMOKE ${JSON.stringify(result)}`);
