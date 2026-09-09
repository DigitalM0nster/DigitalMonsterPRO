import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { splitPlateMaterialGroups } from "./splitPlateMaterialGroups.js";

export function createPlateGeometry(cfg) {
	return splitPlateMaterialGroups(new RoundedBoxGeometry(
		cfg.plateSize, cfg.plateSize, cfg.depth, cfg.cornerSegments, cfg.cornerRadius,
	));
}

export function createPlateMaterial(m, role = "project") {
	const typeKey = role === "decor" ? (m.decorType ?? m.type) : m.type;
	const type = ["basic", "standard", "physical"].includes(typeKey) ? typeKey : "standard";
	const common = {
		color: new THREE.Color(m.color), transparent: true, opacity: m.opacity ?? 1,
		fog: true, depthWrite: false,
	};
	if (type === "basic") return new THREE.MeshBasicMaterial(common);
	const surface = { ...common, roughness: m.roughness ?? 0.07, metalness: m.metalness ?? 0 };
	if (type === "standard") return new THREE.MeshStandardMaterial(surface);
	return new THREE.MeshPhysicalMaterial({
		...surface, transmission: m.transmission ?? 0, thickness: m.thickness ?? 0,
		clearcoat: m.clearcoat ?? 0, clearcoatRoughness: m.clearcoatRoughness ?? 0.15,
		ior: m.ior ?? 1.45,
	});
}

export function createPlateMaterials(m, role = "project") {
	return [createPlateMaterial(m, role), createPlateMaterial({ ...m, ...(m.sides ?? {}) }, role)];
}
