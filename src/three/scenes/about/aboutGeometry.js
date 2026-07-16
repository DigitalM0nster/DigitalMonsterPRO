import * as THREE from "three";
import { ABOUT_GEOMETRY } from "./aboutSceneConfig.js";

/**
 * Rounded rectangle path (outer or hole). Coordinates centered on origin.
 */
export function roundedRectPath(size, radius, path = new THREE.Path()) {
	const half = size * 0.5;
	const r = Math.min(radius, half - 0.001);
	path.moveTo(-half + r, -half);
	path.lineTo(half - r, -half);
	path.quadraticCurveTo(half, -half, half, -half + r);
	path.lineTo(half, half - r);
	path.quadraticCurveTo(half, half, half - r, half);
	path.lineTo(-half + r, half);
	path.quadraticCurveTo(-half, half, -half, half - r);
	path.lineTo(-half, -half + r);
	path.quadraticCurveTo(-half, -half, -half + r, -half);
	return path;
}

/**
 * Thick rounded-square frame with central hole, extruded with bevel.
 */
export function createFrameGeometry({
	outerSize = ABOUT_GEOMETRY.outerSize,
	innerHole = ABOUT_GEOMETRY.innerHole,
	depth = ABOUT_GEOMETRY.depth,
	outerRadius = ABOUT_GEOMETRY.outerRadius,
	holeRadius = ABOUT_GEOMETRY.holeRadius,
	bevelSize = ABOUT_GEOMETRY.bevelSize,
	bevelThickness = ABOUT_GEOMETRY.bevelThickness,
	bevelSegments = ABOUT_GEOMETRY.bevelSegments,
	curveSegments = ABOUT_GEOMETRY.curveSegments,
} = {}) {
	const shape = new THREE.Shape();
	roundedRectPath(outerSize, outerRadius, shape);
	const hole = new THREE.Path();
	roundedRectPath(innerHole, holeRadius, hole);
	shape.holes.push(hole);

	const geometry = new THREE.ExtrudeGeometry(shape, {
		depth,
		bevelEnabled: true,
		bevelThickness,
		bevelSize,
		bevelOffset: 0,
		bevelSegments,
		curveSegments,
	});

	geometry.center();
	geometry.computeVertexNormals();
	return geometry;
}

/**
 * Closed outline of a rounded square in the XY plane (for glowing edges).
 */
export function createRoundedRectLoopGeometry(size, radius, segments = 64) {
	const half = size * 0.5;
	const r = Math.min(radius, half - 0.001);
	const points = [];
	const corner = (cx, cy, startAngle, endAngle) => {
		for (let i = 0; i <= segments / 4; i += 1) {
			const t = i / (segments / 4);
			const angle = startAngle + (endAngle - startAngle) * t;
			points.push(new THREE.Vector3(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r, 0));
		}
	};

	// Bottom edge left→right, then corners CCW
	for (let i = 0; i <= 8; i += 1) {
		const t = i / 8;
		points.push(new THREE.Vector3(THREE.MathUtils.lerp(-half + r, half - r, t), -half, 0));
	}
	corner(half - r, -half + r, -Math.PI / 2, 0);
	for (let i = 1; i <= 8; i += 1) {
		const t = i / 8;
		points.push(new THREE.Vector3(half, THREE.MathUtils.lerp(-half + r, half - r, t), 0));
	}
	corner(half - r, half - r, 0, Math.PI / 2);
	for (let i = 1; i <= 8; i += 1) {
		const t = i / 8;
		points.push(new THREE.Vector3(THREE.MathUtils.lerp(half - r, -half + r, t), half, 0));
	}
	corner(-half + r, half - r, Math.PI / 2, Math.PI);
	for (let i = 1; i <= 8; i += 1) {
		const t = i / 8;
		points.push(new THREE.Vector3(-half, THREE.MathUtils.lerp(half - r, -half + r, t), 0));
	}
	corner(-half + r, -half + r, Math.PI, Math.PI * 1.5);

	return new THREE.BufferGeometry().setFromPoints(points);
}

export function disposeObject(root) {
	root.traverse((node) => {
		node.geometry?.dispose?.();
		if (node.material) {
			if (Array.isArray(node.material)) {
				for (const material of node.material) material.dispose?.();
			} else {
				node.material.dispose?.();
			}
		}
	});
}
