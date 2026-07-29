/**
 * Contacts WebGL — particle flower hologram (right half).
 *
 * Live tune objects are mutated by DEV panel; applyLook / pose never rebuilds
 * particle buffers. Shape + counts rebuild only via explicit rebuildShape.
 */

export const CONTACTS_PATH = "/contacts";

/** @type {{
 *   position: [number, number, number],
 *   lookAt: [number, number, number],
 *   fov: number,
 *   scrollY: number,
 *   scrollZ: number,
 * }} */
export const contactsCameraTune = {
	position: [1.85, 0.35, 5.6],
	lookAt: [1.85, 0.05, 0],
	fov: 40,
	scrollY: 0.35,
	scrollZ: 0.55,
};

export const contactsCameraTuneDefaults = {
	position: [...contactsCameraTune.position],
	lookAt: [...contactsCameraTune.lookAt],
	fov: contactsCameraTune.fov,
	scrollY: contactsCameraTune.scrollY,
	scrollZ: contactsCameraTune.scrollZ,
};

/** @deprecated Prefer contactsCameraTune — kept for callers expecting freeze-shaped export. */
export const CONTACTS_CAMERA = contactsCameraTune;

/**
 * World pose + particle/shader look.
 * Shape keys (petalCount…sparkCount) need rebuildShape; look/pose are free.
 */
export const contactsHologramTune = {
	tiltX: 0,
	tiltZ: -0.94,
	rockAmpX: 0.015,
	rockAmpZ: 0.025,
	rockSpeedX: 0.06,
	rockSpeedZ: 0.26,
	spinZ: 0.005,

	offsetX: 4.21,
	offsetY: -0.09,
	offsetZ: 0,
	scale: 1.11,

	petalCount: 7,
	radius: 2.45,
	twist: 0.95,
	armWidth: 0.33,
	coreHole: 0.21,
	dish: 0.12,
	densityPower: 0.77,
	tipSharpness: 0.6,
	/** Lean particle budget for fill-rate / CPU sample build. */
	dustCount: 7200,
	sparkCount: 900,

	colorA: "#00a9ff",
	colorB: "#006eff",

	distort: 0.049,
	breath: 0.03,
	waveSpeed: 0.97,
	pointOpacity: 3,
	glowBoost: 7.9,
	pointSize: 0.281,
};

export const contactsHologramTuneDefaults = { ...contactsHologramTune };

/** @deprecated Prefer contactsHologramTune. */
export const CONTACTS_HOLOGRAM = contactsHologramTune;

/** Keys that only change uniforms / scene transforms — safe every slider tick. */
export const CONTACTS_HOLOGRAM_LIVE_KEYS = Object.freeze([
	"tiltX",
	"tiltZ",
	"rockAmpX",
	"rockAmpZ",
	"rockSpeedX",
	"rockSpeedZ",
	"spinZ",
	"offsetX",
	"offsetY",
	"offsetZ",
	"scale",
	"colorA",
	"colorB",
	"distort",
	"breath",
	"waveSpeed",
	"pointOpacity",
	"glowBoost",
	"pointSize",
]);

/** Keys that rebuild CPU particle buffers — DEV rebuild button only. */
export const CONTACTS_HOLOGRAM_SHAPE_KEYS = Object.freeze([
	"petalCount",
	"radius",
	"twist",
	"armWidth",
	"coreHole",
	"dish",
	"densityPower",
	"tipSharpness",
	"dustCount",
	"sparkCount",
]);

export function resetContactsCameraTune() {
	contactsCameraTune.position = [...contactsCameraTuneDefaults.position];
	contactsCameraTune.lookAt = [...contactsCameraTuneDefaults.lookAt];
	contactsCameraTune.fov = contactsCameraTuneDefaults.fov;
	contactsCameraTune.scrollY = contactsCameraTuneDefaults.scrollY;
	contactsCameraTune.scrollZ = contactsCameraTuneDefaults.scrollZ;
}

export function resetContactsHologramTune() {
	Object.assign(contactsHologramTune, contactsHologramTuneDefaults);
}
