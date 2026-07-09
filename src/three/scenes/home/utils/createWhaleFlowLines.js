import * as THREE from "three";
import { WHALE_BODY_LENGTH, whalePectoralFinPoint, whaleSurfacePoint } from "./whaleShape.js";

/**
 * Линии вдоль тела — «поток» по брюху, спине и плавникам (как на референсе).
 */
export function createWhaleFlowLines(flowCount) {
	const segments = 36;
	const positions = [];

	const addCurve = (sampleFn) => {
		for (let i = 0; i < segments; i++) {
			const a = sampleFn(i / segments);
			const b = sampleFn((i + 1) / segments);
			positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
		}
	};

	// Спина
	for (let f = 0; f < flowCount; f++) {
		const angle = Math.PI * 0.5 + (f - flowCount * 0.5) * 0.08;
		addCurve((t) => {
			const x = (t - 0.5) * WHALE_BODY_LENGTH;
			return whaleSurfacePoint(x, angle, 0.92);
		});
	}

	// Брюхо — несколько параллельных линий
	for (let f = 0; f < flowCount + 2; f++) {
		const angle = Math.PI * 1.5 + (f - flowCount * 0.5) * 0.11;
		addCurve((t) => {
			const x = (t - 0.5) * WHALE_BODY_LENGTH;
			return whaleSurfacePoint(x, angle, 0.88);
		});
	}

	// Грудные плавники
	for (const side of [-1, 1]) {
		addCurve((t) => whalePectoralFinPoint(side, t, 0.08));
		addCurve((t) => whalePectoralFinPoint(side, t, 0.92));
		addCurve((t) => {
			const p = whalePectoralFinPoint(side, t, 0.5);
			return p;
		});
	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));

	const material = new THREE.LineBasicMaterial({
		color: new THREE.Color("#5ce9ff"),
		transparent: true,
		opacity: 0.42,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
	});

	const lines = new THREE.LineSegments(geometry, material);

	return { lines, geometry, material };
}
