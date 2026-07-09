import { digitalWhaleConfig } from "../digitalWhaleConfig.js";

export const WHALE_BODY_LENGTH = 28;

function smoothstep(edge0, edge1, x) {
	const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
	return t * t * (3 - 2 * t);
}

export function getWhaleOffset() {
	const w = digitalWhaleConfig.whale;
	return { x: w.offsetX, y: w.offsetY, z: w.offsetZ };
}

export function whaleLengthT(x) {
	return x / WHALE_BODY_LENGTH + 0.5;
}

export function whaleRadii(x) {
	const t = whaleLengthT(x);
	let height = 2.8;
	let width = 4.6;

	const tailTaper = smoothstep(0.0, 0.28, t);
	height *= 0.15 + tailTaper * 0.85;
	width *= 0.12 + tailTaper * 0.88;

	if (t > 0.68) {
		const head = smoothstep(0.68, 0.96, t);
		height *= 1.0 + head * 0.55;
		width *= 1.0 + head * 0.5;
	}

	if (t > 0.38 && t < 0.72) {
		height *= 1.12;
		width *= 1.06;
	}

	return { height, width, t };
}

export function whaleSurfacePoint(x, angle, surface = 1) {
	const { height, width, t } = whaleRadii(x);
	const off = getWhaleOffset();
	const shell = 0.88 + surface * 0.12;

	let y = Math.sin(angle) * height * shell;
	let z = Math.cos(angle) * width * shell;

	if (t < 0.16) {
		const fluke = smoothstep(0.16, 0.0, t);
		y += Math.sin(angle) * fluke * 5.2;
		z *= 1.0 - fluke * 0.4;
	}

	if (t > 0.74 && angle > Math.PI * 0.38 && angle < Math.PI * 0.62) {
		y += smoothstep(0.74, 0.98, t) * 1.4;
	}

	if (angle > Math.PI * 0.42 && angle < Math.PI * 0.58 && t > 0.42 && t < 0.78) {
		y += 0.35;
	}

	return {
		x: x + off.x,
		y: y + off.y,
		z: z + off.z,
		t,
	};
}

export function whalePectoralFinPoint(side, u, v) {
	const off = getWhaleOffset();
	const finX = 3 - u * 8.5;
	const span = 6.2 * (1 - u * 0.5);
	const y = -0.8 - u * 5.2 - v * span;
	const z = side * (2.2 + u * 3.5 + v * 2.8);

	return {
		x: finX + off.x,
		y: y + off.y,
		z: z + off.z,
	};
}

export const WHALE_ACCENT_NODES = [
	{ x: 11, y: 0.5, z: 0, size: 2.8 },
	{ x: 7.5, y: -0.5, z: 2.0, size: 2.2 },
	{ x: 7.5, y: -0.5, z: -2.0, size: 2.2 },
	{ x: 2, y: 0.8, z: 0, size: 1.9 },
	{ x: -3, y: 0.3, z: 0, size: 1.7 },
	{ x: -9, y: 0, z: 0, size: 1.6 },
	{ x: -12.5, y: 3.2, z: 0, size: 2.1 },
	{ x: -12.5, y: -3.2, z: 0, size: 2.1 },
	{ x: 0.5, y: -3.2, z: 4.2, size: 2.3 },
	{ x: 0.5, y: -3.2, z: -4.2, size: 2.3 },
];
