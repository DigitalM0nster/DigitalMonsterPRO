import * as THREE from "three";

import { digitalWhaleConfig } from "../digitalWhaleConfig.js";

/** AABB всех партиклов (локальные координаты whale.root). */
export function computeParticleBounds(positionAttr, count) {
	const min = { x: Infinity, y: Infinity, z: Infinity };
	const max = { x: -Infinity, y: -Infinity, z: -Infinity };

	for (let i = 0; i < count; i++) {
		const x = positionAttr.getX(i);
		const y = positionAttr.getY(i);
		const z = positionAttr.getZ(i);
		min.x = Math.min(min.x, x);
		min.y = Math.min(min.y, y);
		min.z = Math.min(min.z, z);
		max.x = Math.max(max.x, x);
		max.y = Math.max(max.y, y);
		max.z = Math.max(max.z, z);
	}

	return { min, max };
}

/** Эвристика: середина тела, низ, сторона с max Z (правый борт в FBX). */
export function buildAutoFinRegion(bounds) {
	const lenX = bounds.max.x - bounds.min.x;
	const spanY = bounds.max.y - bounds.min.y;
	const spanZ = bounds.max.z - bounds.min.z;
	const centerY = (bounds.min.y + bounds.max.y) * 0.5;
	const centerZ = (bounds.min.z + bounds.max.z) * 0.5;

	return {
		minX: bounds.min.x + lenX * 0.28,
		maxX: bounds.min.x + lenX * 0.48,
		minY: bounds.min.y,
		maxY: centerY + spanY * 0.05,
		minZ: centerZ + spanZ * 0.12,
		maxZ: bounds.max.z,
	};
}

function hasManualRegion(region) {
	return (
		region.minX !== region.maxX ||
		region.minY !== region.maxY ||
		region.minZ !== region.maxZ
	);
}

export function resolveParticleFadeRegion(region, bounds) {
	if (!region?.enabled) {
		return null;
	}

	if (hasManualRegion(region)) {
		return {
			minX: Math.min(region.minX, region.maxX),
			maxX: Math.max(region.minX, region.maxX),
			minY: Math.min(region.minY, region.maxY),
			maxY: Math.max(region.minY, region.maxY),
			minZ: Math.min(region.minZ, region.maxZ),
			maxZ: Math.max(region.minZ, region.maxZ),
		};
	}

	if (region.autoFin && bounds) {
		return buildAutoFinRegion(bounds);
	}

	return null;
}

export function isInsideParticleFadeRegion(x, y, z, box) {
	return x >= box.minX && x <= box.maxX && y >= box.minY && y <= box.maxY && z >= box.minZ && z <= box.maxZ;
}

export function getWhaleParticleFadeRegion() {
	return digitalWhaleConfig.whale?.particleFade?.region ?? null;
}

export function getWhaleParticleFadeRegionIntensity(region) {
	return THREE.MathUtils.clamp(region?.intensity ?? 0.2, 0, 1);
}

/** Доп. затухание плавника: квадрат даёт более глубокий диапазон у низких значений слайдера. */
export function getWhaleParticleFadeRegionFadeMultiplier(region) {
	const intensity = getWhaleParticleFadeRegionIntensity(region);
	return intensity * intensity;
}
