/**
 * Artistic / framing knobs for the About WebGL scene.
 */

export const ABOUT_MODEL_URL = "/models/aboutModel/AboutUsModel.glb";

/**
 * If > 0, scale the GLB so its longest axis equals this (world meters).
 * Use 0 to keep native GLB scale — required for Blender pose/camera parity
 * (Blender imports AboutUsModel.glb unscaled under AboutModelAsset).
 */
export const ABOUT_MODEL_TARGET_SIZE = 0;

/**
 * Extra Euler (degrees, Three.js XYZ) applied to the loaded GLB before centering.
 * Was historically +90° X (flat XZ asset → face camera). Current Blender authoring
 * is already upright after glTF — keep 0 so site matches Blender.
 */
export const ABOUT_MODEL_ASSET_EULER_DEG = { x: 0, y: 0, z: 0 };

export const ABOUT_COLORS = {
	halo: 0x061428,
	dark: 0x050a14,
	darkEmissive: 0x061428,
	edge: 0x1a6bff,
	edgeEmissive: 0x3ad7ff,
	particle: 0x7adfff,
};

/**
 * Microchip / PCB layer inside the InsideLarge frame band
 * (orthogonal traces, vias, substrate dots — not organic plexus).
 */
export const ABOUT_PARTICLES = {
	/** Volumetric neon PCB on `InsideLarge` only (mesh itself stays hidden / no glass). */
	size: 0.04,
	maxPointSizePx: 12,
	opacity: 1,
	color: ABOUT_COLORS.particle,
	/**
	 * White PCB appears on stage 2.5→3 (story 1.5→2), fixed yaw −45°.
	 * appearMode: 0 soft · 1 seed · 2 scan · 3 spark · 4 center→out · 5 glitch.
	 */
	revealStoryStart: 1.5,
	revealStoryEnd: 2,
	yawDeg: -45,
	yawAxis: [0, 1, 0],
	appearMode: 4,
	/**
	 * Inner rim = outer silhouette × innerScale.
	 * (InsideLarge / EdgeForParticles are often outer-rim shells without hole verts.)
	 */
	innerScale: 0.52,
	shellInset: 0.04,
	/** Y resolution of the single 3D chip grid (edges also run along X and Z). */
	yLayers: 4,
	thicknessInset: 0.1,
	/** Legacy ratio fallbacks for older callers. */
	outerHalf: 0.94,
	innerHalf: 0.48,
	travelers: 90,
	travelSpeed: 1.15,
	pulseSpeed: 1.7,
	lineIntensity: 2.4,
	linePulseIntensity: 3.0,
	nodeIntensity: 3.8,
};

/** Editable material recipe for AboutUsModel (dev panel + runtime). */
export const ABOUT_MATERIALS = {
	/** Sci-fi glass — Front / Back. */
	frontGlass: {
		color: "#010408",
		rimColor: "#00b3ff",
		opacity: 1,
		rimPower: 2.5,
		rimIntensity: 12,
		innerGlow: 0.1,
		gridScale: 64,
		gridOpacity: 0.65,
		speckDensity: 65,
		speckOpacity: 1,
		specIntensity: 0,
		specPower: 70,
		energyOpacity: 0.37,
		energyScale: 1.3,
		energySpeed: 0.8,
		thickness: 0.35,
		/** Face-on opacity floor — liquidBackground must not read through the plate. */
		faceOpacity: 1,
	},
	/** Side plates — HUD grid + micro-specks only (`FrontBackSide` / `BackBackSide`). */
	sideHud: {
		color: "#050a14",
		hudColor: "#00b3ff",
		opacity: 1,
		gridScale: 64,
		gridOpacity: 0.65,
		speckDensity: 65,
		speckOpacity: 1,
		flicker: 0.35,
	},
	dark: {
		color: "#050a14",
		metalness: 0.52,
		roughness: 0.28,
		clearcoat: 0.35,
		clearcoatRoughness: 0.45,
		emissive: "#061428",
		emissiveIntensity: 0.28,
		envMapIntensity: 0.4,
	},
	/**
	 * Futuristic processor / silicon-die body for HeartMain / HeartCenter.
	 */
	heartBody: {
		color: "#070c14",
		sheenColor: "#1a3348",
		rimColor: "#5ee7ff",
		accentColor: "#7b5cff",
		traceColor: "#00b3ff",
		rimPower: 6,
		rimIntensity: 1.95,
		sheen: 0.98,
		iridescence: 0.58,
		gridScale: 34,
		gridOpacity: 0.55,
		traceOpacity: 0.5,
		speckDensity: 70,
		speckOpacity: 0.1,
		energyOpacity: 0.14,
		energySpeed: 0.3,
	},
	/**
	 * OUTER_cell* — clean faces; sharp angular fibers on baked thickness ribs only.
	 */
	outerCell: {
		color: "#070c14",
		sheenColor: "#142536",
		rimColor: "#5ee7ff",
		fiberColor: "#7adfff",
		rimPower: 2.6,
		rimIntensity: 0.85,
		sheen: 0.45,
		fiberScale: 48,
		fiberDensity: 0.62,
		fiberIntensity: 4.2,
	},
	/**
	 * Neon for thin Heart lines only (`NeonMaterial` / `HeartNeon*`).
	 * `color` tracks `edgeParticles.color` at apply-time.
	 */
	neon: {
		color: "#00b3ff",
		coreColor: "#b8ecff",
		intensity: 1.5,
		coreIntensity: 2.2,
		rimPower: 1.35,
		rimIntensity: 3,
		pulse: 0.18,
		pulseSpeed: 1.8,
		opacity: 1,
	},
	/**
	 * Scroll scatter for `OUTER_cell*` (driven by aboutExperience.progress).
	 * Detach during stage 1 (story 0→1).
	 */
	outerCellScatter: {
		start: 0,
		end: 1,
		distance: 0.45,
		lift: 0.14,
		scaleOut: 0.85,
		/** Extra push during stage 2→3 (story 1→2). */
		stage2Distance: 0.55,
		stage2Lift: 0.12,
	},
	/**
	 * Front plate advance toward camera (stage 1 + further on stage 2).
	 */
	frontAdvance: {
		start: 0,
		end: 1,
		distance: 0.55,
		stage2Distance: 0.7,
	},
	/**
	 * Back plate retreat away from camera on stage 2→3 (story 1→2).
	 */
	backRetreat: {
		storyStart: 1,
		storyEnd: 2,
		distance: 0.65,
	},
	/**
	 * Processor (Heart*) rotates on stage 2→3 (story 1→2).
	 * Blue EdgeForParticles do not spin — dissolve in place.
	 */
	heartScale: {
		storyStart: 1,
		storyEnd: 2,
		angleDeg: -225,
		axis: [0, 1, 0],
	},
	/**
	 * Disappear shader during stage 1 (local 0.5→1.0).
	 * mode: Front + FrontBackSide (0 = hexTransition)
	 * cellMode: OUTER_cell (1 = scan wipe)
	 * backMode: Back + BackBackSide on stage 2→3 (3 = Energy vapor = anim 4)
	 * Modes: 0 hexTransition · 1 scan · 2 glitch · 3 vapor · 4 grid · 5 radial
	 */
	stage2Dissolve: {
		mode: 0,
		cellMode: 1,
		backMode: 3,
		edge: 0.08,
		glow: 1.45,
	},
	/**
	 * Neon lattice on `EdgeForParticles` only
	 * (rings × spokes × Y + travelers). PCB lives on InsideLarge separately.
	 */
	edgeParticles: {
		color: "#00b3ff",
		rings: 5,
		spokes: 36,
		yLayers: 3,
		loopSegments: 72,
		travelers: 72,
		/** Innermost ring vs real silhouette (0.44/0.94 ≈ previous frame band). */
		innerScale: 0.47,
		pointSize: 0.07,
		maxPointSizePx: 16,
		/** Match About PCB brightness (outer must not outshine inner). */
		lineIntensity: 1.35,
		nodeIntensity: 2.7,
		travelSpeed: 1.05,
		pulseSpeed: 1.85,
		opacity: 1,
		/**
		 * Blue lattice disappears on stage 2.0→3.0 (story 1→2).
		 * dissolveMode 5 = Glitch shatter (anim 6).
		 */
		hideStoryStart: 1,
		hideStoryEnd: 2,
		dissolveMode: 5,
	},
};

export function cloneAboutMaterialsConfig(source = ABOUT_MATERIALS) {
	return {
		frontGlass: { ...source.frontGlass },
		sideHud: { ...source.sideHud },
		dark: { ...source.dark },
		heartBody: { ...source.heartBody },
		outerCell: { ...(source.outerCell ?? ABOUT_MATERIALS.outerCell) },
		neon: { ...source.neon },
		outerCellScatter: { ...source.outerCellScatter },
		frontAdvance: { ...(source.frontAdvance ?? ABOUT_MATERIALS.frontAdvance) },
		backRetreat: { ...(source.backRetreat ?? ABOUT_MATERIALS.backRetreat) },
		heartScale: { ...(source.heartScale ?? ABOUT_MATERIALS.heartScale) },
		stage2Dissolve: { ...(source.stage2Dissolve ?? ABOUT_MATERIALS.stage2Dissolve) },
		edgeParticles: { ...source.edgeParticles },
	};
}

/**
 * Pointer parallax on the About model (NDC pointer −1…1).
 * Camera stays on the authored pose; the model rotates around lookAt
 * as if the camera had orbited around it.
 */
export const ABOUT_MODEL_PARALLAX = {
	/** Horizontal orbit degrees at |pointer.x| = 1. */
	yawDeg: 3.2,
	/** Vertical orbit degrees at |pointer.y| = 1. */
	pitchDeg: 2.2,
	/** Exponential smooth toward pointer per frame. */
	smooth: 0.08,
	/** Mobile / short: damp (touch has no stable hover). */
	mobileScale: 0.35,
};

export const ABOUT_LAYOUT = {
	/**
	 * Framing baseline. Desktop root at 0 — matches Blender-authored stage poses
	 * (camera/model centered on origin). Stage poses still offset via ABOUT_STAGE_POSES.
	 */
	desktop: {
		rootX: 0,
		rootY: 0,
		rootScale: 1,
		cameraZ: 8.2,
		cameraY: 1.2,
		lookAtX: 0,
		lookAtY: 0,
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
	/** Soft wrap lighting only — no PointLights (they make specular «фонарики» on glossy surfaces). */
	ambient: { color: 0x6a8ab0, intensity: 1.05 },
	hemisphere: { sky: 0x9ec4ea, ground: 0x03060c, intensity: 1.15 },
	key: { color: 0xe8f0ff, intensity: 1.55, position: [3.8, 5.0, 5.8] },
	rim: { color: 0x5ee7ff, intensity: 1.2, position: [-3.8, 2.2, -2.8] },
	front: { color: 0xffffff, intensity: 1.15, position: [0.6, 1.4, 7.2] },
	bottom: { color: 0x2a6fff, intensity: 0.55, position: [1.1, -3.2, 2.2] },
	fill: { color: 0xb8dcff, intensity: 0.75, position: [-2.4, 1.2, 4.5] },
};
