/**
 * About epic title on AboutEpicTextPlane (letter mesh + outline shell).
 * Glow colours track About neon (`ABOUT_MATERIALS.neon`).
 */

import { ABOUT_MATERIALS } from "../aboutSceneConfig.js";

const neon = ABOUT_MATERIALS.neon;

export const ABOUT_EPIC_TEXT_MODES = [
	{ id: 0, key: "hologram", label: "1 · Hologram Scan" },
	{ id: 1, key: "engrave", label: "2 · Energy Engrave" },
	{ id: 2, key: "spectral", label: "3 · Spectral Refract" },
	{ id: 3, key: "decode", label: "4 · Signal Decode" },
	{ id: 4, key: "neon", label: "5 · Neon Contour" },
	{ id: 5, key: "hybrid", label: "6 · Hybrid (recommended)" },
];

/** Live tune — DevTools hotkey 2. */
export const aboutEpicTextTune = {
	mode: 2,
	appearStoryStart: 3.55,
	appearStoryEnd: 4,
	/** Locale signal-rewrite duration (ms) — old scan-out + new scan-in. */
	localeSwapMs: 1100,
	intensity: 2,
	glow: 3,
	scanSpeed: 0,
	glitch: 0,
	pointerStrength: 0,
	parallax: 0,
	outlineWidth: 0.001,
	outlineBoost: 3,
	outlineExpand: 0,
	fillOpacity: 0.62,
	fillDark: 0.11,
	flowSpeed: 3,
	/** Soft traveling contour arcs (count / length / softness). */
	dashCount: 64,
	dashLength: 0.6,
	dashSoft: 0.2,
	/** Site neon — keep in sync with ABOUT_MATERIALS.neon. */
	tint: neon.color ?? "#00b3ff",
	core: "#16b8fe",
	outline: neon.color ?? "#00b3ff",
};

export const aboutEpicTextTuneDefaults = { ...aboutEpicTextTune };

export function resetAboutEpicTextTune() {
	Object.assign(aboutEpicTextTune, aboutEpicTextTuneDefaults);
}
