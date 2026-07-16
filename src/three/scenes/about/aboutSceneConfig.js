/**
 * Artistic / performance knobs for the About WebGL scene.
 * Motion keyframes live in ScrollTimeline.js; this file holds static design values.
 */

export const ABOUT_COLORS = {
	backgroundNear: 0x010308,
	backgroundFar: 0x030812,
	shell: 0x050a14,
	shellTint: 0x0a1628,
	metalBlue: 0x0c1a2e,
	keyBlue: 0x1a6bff,
	cyan: 0x3ad7ff,
	rimCyan: 0x5ee7ff,
	innerRing: 0xd8f0ff,
	innerRingEmissive: 0xa8d8ff,
	networkLine: 0x2a9fff,
	networkNode: 0x7adfff,
	energy: 0x3eb8ff,
	engineering: 0x1e8cff,
	groundGlow: 0x0a3a80,
	halo: 0x061428,
};

export const ABOUT_GEOMETRY = {
	outerSize: 3.65,
	innerHole: 1.5,
	depth: 0.58,
	outerRadius: 0.55,
	holeRadius: 0.35,
	bevelSize: 0.12,
	bevelThickness: 0.11,
	bevelSegments: 3,
	curveSegments: 24,
	engineeringScale: 0.92,
	engineeringDepth: 0.28,
	innerRingSize: 1.72,
	innerRingHole: 1.42,
	innerRingDepth: 0.12,
	innerRingBevel: 0.04,
	insetSize: 1.38,
	insetDepth: 0.08,
};

export const ABOUT_LAYOUT = {
	/** World-space offset so visual center sits ~65–70% across the viewport. */
	desktop: {
		rootX: 1.75,
		rootY: 0.05,
		rootScale: 1,
		cameraZ: 8.2,
		cameraY: 0.12,
		lookAtX: 1.25,
		lookAtY: 0.05,
		fov: 34,
	},
	short: {
		rootX: 1.35,
		rootY: 0,
		rootScale: 0.9,
		cameraZ: 8.8,
		cameraY: 0.1,
		lookAtX: 1.0,
		lookAtY: 0,
		fov: 36,
	},
	mobile: {
		rootX: 0.08,
		rootY: 0.12,
		rootScale: 0.72,
		cameraZ: 9.6,
		cameraY: 0.2,
		lookAtX: 0.05,
		lookAtY: 0.08,
		fov: 38,
	},
};

export const ABOUT_LIGHTS = {
	ambient: { color: 0x0a1528, intensity: 0.35 },
	hemisphere: { sky: 0x1a3a6a, ground: 0x010308, intensity: 0.45 },
	key: { color: 0x2a6fff, intensity: 1.6, position: [4.5, 5.2, 3.2] },
	rim: { color: 0x3ad7ff, intensity: 1.15, position: [-4.2, 2.4, -3.5] },
	front: { color: 0xb8d8ff, intensity: 0.4, position: [0.8, 1.2, 6.5] },
	bottom: { color: 0x1a5cff, intensity: 0.45, position: [1.2, -3.8, 1.5] },
	halo: { color: 0x0a2860, intensity: 0.35, position: [1.4, 0.2, -3.4], distance: 10, decay: 2 },
};

export const ABOUT_MATERIALS = {
	shell: {
		color: ABOUT_COLORS.shell,
		metalness: 0.55,
		roughness: 0.2,
		clearcoat: 0.92,
		clearcoatRoughness: 0.08,
		envMapIntensity: 0.35,
	},
	shellGlass: {
		transmissionPeak: 0.42,
		opacityFloor: 0.42,
		opacityPeak: 0.92,
	},
	engineering: {
		color: ABOUT_COLORS.engineering,
		emissive: ABOUT_COLORS.engineering,
		emissiveIntensity: 1.35,
		metalness: 0.2,
		roughness: 0.35,
	},
	innerRing: {
		color: ABOUT_COLORS.innerRing,
		emissive: ABOUT_COLORS.innerRingEmissive,
		emissiveIntensity: 1.55,
		metalness: 0.3,
		roughness: 0.25,
		clearcoat: 0.6,
	},
	contour: {
		outerIntensity: 2.4,
		innerIntensity: 2.1,
		scaleOffset: 1.008,
	},
};

export const ABOUT_NETWORK = {
	desktop: { points: 110, maxDistance: 0.95, maxConnections: 240 },
	mobile: { points: 64, maxDistance: 1.05, maxConnections: 130 },
	lineOpacity: 0.55,
	nodeSize: 0.035,
	nodeOpacity: 0.85,
};

export const ABOUT_ENERGY = {
	desktop: { streams: 22, particles: 180 },
	mobile: { streams: 11, particles: 80 },
	curvePoints: 48,
	particleSize: 0.045,
};

export const ABOUT_GROUND = {
	ringCount: 4,
	ringRadii: [1.4, 1.95, 2.55, 3.25],
	ringY: -2.15,
	glowScale: 4.2,
	glowY: -2.05,
};

export const ABOUT_SCROLL_RANGES = {
	scene1: [0.0, 0.22],
	scene2: [0.22, 0.47],
	scene3: [0.47, 0.72],
	scene4: [0.72, 1.0],
};

export const ABOUT_LAYER_SEPARATION = {
	shell: { x: 1.45, z: 0.75 },
	network: { x: 0, z: 0.05 },
	engineering: { x: -1.45, z: -0.65 },
	shellYaw: 0.05,
	engineeringYaw: -0.04,
};

export const ABOUT_PARALLAX = {
	pitch: 0.028,
	yaw: 0.035,
};

export const ABOUT_IDLE = {
	floatAmplitude: 0.035,
	floatSpeed: 0.35,
	spinSpeed: 0.04,
};
