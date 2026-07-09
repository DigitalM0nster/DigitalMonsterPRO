import * as THREE from "three";
import { WHALE_BODY_LENGTH, whaleSurfacePoint } from "./whaleShape.js";

/** Поперечные контуры — цифровые «срезы» тела. */
export function createWhaleGlowLines(lineCount) {
	const segmentsPerLine = 32;
	const positions = [];

	for (let line = 0; line < lineCount; line++) {
		const sliceT = line / Math.max(lineCount - 1, 1);
		const x = (sliceT - 0.5) * WHALE_BODY_LENGTH;
		const angleOffset = (line % 4) * 0.2;

		for (let seg = 0; seg < segmentsPerLine; seg++) {
			const t0 = (seg / segmentsPerLine) * Math.PI * 2 + angleOffset;
			const t1 = ((seg + 1) / segmentsPerLine) * Math.PI * 2 + angleOffset;
			const a = whaleSurfacePoint(x, t0, 0.95);
			const b = whaleSurfacePoint(x, t1, 0.95);
			positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
		}
	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));

	const material = new THREE.LineBasicMaterial({
		color: new THREE.Color("#4adfff"),
		transparent: true,
		opacity: 0.28,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
	});

	const lines = new THREE.LineSegments(geometry, material);

	return { lines, geometry, material };
}
