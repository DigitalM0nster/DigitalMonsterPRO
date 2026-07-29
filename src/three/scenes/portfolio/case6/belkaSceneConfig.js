/**
 * Belka Production (case06) — authored nut crack + emerald + neon orbits.
 */

export const BELKA_PATH = "/portfolio/06";
export const BELKA_SCENE_ID = "case06";
/** Authored nut + gem + orbit decor (Blender). */
export const BELKA_DIAMOND_GLB = "/models/belkaProduction/NutDiamondModel.glb";

export const BELKA_CAMERA = {
	position: [0, 0.15, 8.4],
	lookAt: [0.35, 0.1, 0],
	fov: 50,
	scrollY: 0.6,
	scrollZ: 1.2,
	/** Mouse parallax — camera shift / lookAt follow. */
	parallaxPosX: 0.22,
	parallaxPosY: 0.14,
	parallaxLookX: 0.1,
	parallaxLookY: 0.07,
	/** Subtle model tilt under pointer (radians at |pointer|=1). */
	parallaxTiltX: 0.09,
	parallaxTiltY: 0.14,
};

export const belkaSceneTuneDefaults = {
	rootX: 1.55,
	rootY: -0.05,
	rootScale: 1.4,
	nutScale: 1.7,
	emeraldScale: 1.25,
	/**
	 * Nut shell look — see BELKA_SHELL_STYLES in belkaShellMaterial.js
	 * classic | obsidian | mercury | ember | ghost | neonCarve
	 */
	shellStyle: "obsidian",
	/** Neon bead shell radii (inner / mid / outer). */
	orbitRadiusA: 2.1,
	orbitRadiusB: 2.45,
	orbitRadiusC: 2.8,
	orbitTilt: 1,
	/** Chaos / shell fatness. */
	orbitTiltSpread: 0.55,
	orbitRoll: -0.29,
	orbitYaw: 0.07,
	orbitX: -0.09,
	orbitY: 0,
	orbitZ: 0,
	orbitSpin: 0.185,
	/** Neon beads total. */
	sphereCount: 16,
	/** Unused (kept for DEV tune compatibility). */
	tubeRadius: 0.018,
	/** Neon bead size. */
	beadScale: 1,
};

export const belkaSceneTune = { ...belkaSceneTuneDefaults };

export function resetBelkaSceneTune() {
	Object.assign(belkaSceneTune, belkaSceneTuneDefaults);
}

Object.assign(belkaSceneTune, belkaSceneTuneDefaults);

/** Neon bead material (Screen-blend filament). */
export const belkaNeonTuneDefaults = {
	color: "#01dcf9",
	coreColor: "#e8fbff",
	intensity: 0.4,
};

export const belkaNeonTune = { ...belkaNeonTuneDefaults };

export function resetBelkaNeonTune() {
	Object.assign(belkaNeonTune, belkaNeonTuneDefaults);
}

Object.assign(belkaNeonTune, belkaNeonTuneDefaults);

/** Seam godrays — original crystal-origin look; timing via Belka DEV (hotkey 4). */
export const belkaGodrayTuneDefaults = {
	color: "#01dcf9",
	/** Multiplier on story rayGain (original ×1.35). */
	intensity: 1.35,
	/** 0 = follow stage story; >0 forces preview intensity (ignore scroll). */
	forceIntensity: 0,
	/**
	 * Godrays after seams are already open (stage 1→2).
	 * Seam gap / particle burst must lead — light must not precede cracks.
	 */
	inStart: 0.52,
	inEnd: 0.92,
	/** Fade out across stage 2→3 (peel). */
	outStart: 0.08,
	outEnd: 0.92,
	/** Hairline cell split — opens before godrays (see gapStart/gapEnd). */
	gapStart: 0.2,
	gapEnd: 0.5,
	seamGapAngle: 0.002,
	seamGapPush: 0.005,
	seamGapHat: 0.002,
};

export const belkaGodrayTune = { ...belkaGodrayTuneDefaults };

export function resetBelkaGodrayTune() {
	Object.assign(belkaGodrayTune, belkaGodrayTuneDefaults);
}

Object.assign(belkaGodrayTune, belkaGodrayTuneDefaults);

export function isBelkaPath(pathname) {
	return (String(pathname ?? "/").replace(/\/+$/, "") || "/") === BELKA_PATH;
}
