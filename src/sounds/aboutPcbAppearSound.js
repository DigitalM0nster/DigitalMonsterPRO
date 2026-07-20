/**
 * About white PCB particle appear SFX (story 1.5→2).
 *
 * Separate from Back disappear (`aboutBackDissolveSound.js`).
 * Same sample as the particle bed (`about_particles`). Timbre is locked to
 * the soft spring-settle character at every scroll speed — no speed→rate scrub.
 * Silent while particles are under the chip; soft crossfade on start/stop.
 */
import { isPageSoundAllowed, registerPageVisibilitySoundHandlers } from "./pageVisibilitySound.js";
import { isSoundAudible, registerSiteSoundMuteHandler } from "./siteSoundToggle.js";
import { connectGainWithPanToMasterBus, getMasterAudioContext, resumeMasterAudioContext } from "./masterAudioBus.js";
import { SOUND_CATALOG } from "./soundDesign.js";

const SOUND_PAN = 0;
/** Louder than the quiet particle bed — appear gesture (keep under Back dissolve). */
const VOLUME = 0.3;
/**
 * Particles spawn under the chip — first part of reveal is invisible.
 * Keep SFX silent until reveal clears that occlusion.
 */
const AUDIBLE_START = 0.34;
/** Soft fade-in after the delayed start (reveal units). */
const AUDIBLE_FADE_IN = 0.2;
/** Soft fade-out near end of reveal. */
const AUDIBLE_FADE_OUT = 0.12;
/**
 * Fixed settle timbre — the liked sound when the spring pulls itself.
 * Never map wheel/scrub speed into playbackRate.
 */
const SETTLE_RATE = 0.96;
const SETTLE_LP_HZ = 7200;
/** Any painted motion keeps the appear bed alive (rest → soft stop). */
const MIN_MOTION = 0.0006;
const REST_FADE_MS = 420;
const RESTART_FADE_MS = 140;
const CROSSFADE_S = 0.12;
const GAIN_TIME_CONSTANT = 0.08;
/** Match ABOUT_PARTICLES.revealStoryStart / revealStoryEnd. */
const PCB_REVEAL_START = 1.5;
const PCB_REVEAL_END = 2;

let loadPromise = null;
/** @type {AudioBuffer | null} */
let loopBuffer = null;
/** @type {null | {
 *   source: AudioBufferSourceNode,
 *   gain: GainNode,
 *   filter: BiquadFilterNode,
 *   panner: StereoPannerNode | null,
 *   stopping: boolean,
 *   disposed: boolean,
 * }} */
let playback = null;
let lastProgress = 0;
let lastGainTarget = 0;
let suppressedUntil = 0;
let handlersBound = false;

function clamp01(value) {
	return Math.max(0, Math.min(1, Number(value) || 0));
}

function smoothstep01(t) {
	const x = clamp01(t);
	return x * x * (3 - 2 * x);
}

/**
 * Painted inside-PCB reveal 0…1 — matches AboutScene._applyStoryProgress.
 * @param {number} story
 */
export function aboutStoryToPcbReveal(story) {
	const s = Number(story) || 0;
	const span = Math.max(1e-4, PCB_REVEAL_END - PCB_REVEAL_START);
	return clamp01((s - PCB_REVEAL_START) / span);
}

/**
 * Gain vs painted reveal — silent under the chip, soft in/out after.
 * @param {number} reveal 0…1
 */
function audibleRevealEnvelope(reveal) {
	const p = clamp01(reveal);
	if (p <= AUDIBLE_START) {
		return 0;
	}
	const afterStart = p - AUDIBLE_START;
	let g = 1;
	if (afterStart < AUDIBLE_FADE_IN) {
		g = smoothstep01(afterStart / Math.max(1e-4, AUDIBLE_FADE_IN));
	}
	const endStart = 1 - AUDIBLE_FADE_OUT;
	if (p > endStart) {
		g *= smoothstep01((1 - p) / Math.max(1e-4, AUDIBLE_FADE_OUT));
	}
	return g * g;
}

async function loadBuffer() {
	if (loopBuffer) {
		return loopBuffer;
	}
	if (loadPromise) {
		return loadPromise;
	}

	loadPromise = fetch(SOUND_CATALOG.about_particles)
		.then((response) => response.arrayBuffer())
		.then(async (arrayBuffer) => {
			const ctx = getMasterAudioContext();
			if (!ctx) {
				return null;
			}
			loopBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
			return loopBuffer;
		})
		.catch(() => {
			loadPromise = null;
			return null;
		});

	return loadPromise;
}

function ensureHandlers() {
	if (handlersBound) {
		return;
	}
	handlersBound = true;
	registerSiteSoundMuteHandler(() => {
		if (!isSoundAudible()) {
			stopPlayback(RESTART_FADE_MS);
		}
	});
	registerPageVisibilitySoundHandlers({
		onHidden: () => stopPlayback(RESTART_FADE_MS),
	});
}

function disposePlayback(entry) {
	if (!entry || entry.disposed) {
		return;
	}
	entry.disposed = true;
	try {
		entry.source.stop();
	} catch {
		// already ended
	}
	try {
		entry.source.disconnect();
		entry.filter?.disconnect();
		entry.gain.disconnect();
		entry.panner?.disconnect();
	} catch {
		// already disconnected
	}
	if (playback === entry) {
		playback = null;
	}
}

function fadeOutEntry(entry, fadeS) {
	if (!entry || entry.disposed || entry.stopping) {
		return;
	}
	entry.stopping = true;
	const ctx = getMasterAudioContext();
	if (!ctx || fadeS <= 0) {
		disposePlayback(entry);
		return;
	}
	const now = ctx.currentTime;
	const current = Math.max(0.0001, entry.gain.gain.value);
	entry.gain.gain.cancelScheduledValues(now);
	entry.gain.gain.setValueAtTime(current, now);
	entry.gain.gain.exponentialRampToValueAtTime(0.0001, now + fadeS);
	entry.gain.gain.setValueAtTime(0, now + fadeS);
	setTimeout(() => disposePlayback(entry), fadeS * 1000 + 40);
}

function stopPlayback(fadeMs = REST_FADE_MS) {
	const entry = playback;
	if (!entry || entry.stopping) {
		return;
	}
	playback = null;
	lastGainTarget = 0;
	fadeOutEntry(entry, Math.max(0.08, fadeMs / 1000));
}

function startPlayback() {
	const ctx = getMasterAudioContext();
	if (!ctx || !loopBuffer) {
		return;
	}
	if (playback && !playback.disposed && !playback.stopping) {
		return;
	}

	const source = ctx.createBufferSource();
	const filter = ctx.createBiquadFilter();
	const gain = ctx.createGain();
	const startedAt = ctx.currentTime;

	filter.type = "lowpass";
	filter.Q.value = 0.65;
	filter.frequency.value = SETTLE_LP_HZ;

	source.buffer = loopBuffer;
	source.loop = true;
	source.playbackRate.value = SETTLE_RATE;
	gain.gain.setValueAtTime(0.0001, startedAt);
	const panner = connectGainWithPanToMasterBus(ctx, gain, SOUND_PAN);
	source.connect(filter);
	filter.connect(gain);

	const entry = {
		source,
		gain,
		filter,
		panner,
		stopping: false,
		disposed: false,
	};
	playback = entry;
	source.onended = () => {
		if (playback === entry) {
			playback = null;
			lastGainTarget = 0;
		}
		disposePlayback(entry);
	};
	source.start(0);
	lastGainTarget = 0;
}

/**
 * @param {number} gainTarget
 */
function syncGain(gainTarget) {
	const ctx = getMasterAudioContext();
	if (!ctx || !loopBuffer) {
		return;
	}

	const safeTarget = Math.max(0, gainTarget);
	if (safeTarget <= 0.002) {
		if (playback && !playback.stopping) {
			stopPlayback();
		}
		return;
	}

	if (!playback || playback.stopping || playback.disposed) {
		startPlayback();
	}
	const entry = playback;
	if (!entry || entry.stopping) {
		return;
	}

	const now = ctx.currentTime;
	if (Math.abs(safeTarget - lastGainTarget) > 0.003) {
		entry.gain.gain.setTargetAtTime(Math.max(0.0002, safeTarget), now, GAIN_TIME_CONSTANT);
		lastGainTarget = safeTarget;
	}
	// Keep settle timbre locked — never chase scroll speed into rate.
	entry.source.playbackRate.setTargetAtTime(SETTLE_RATE, now, 0.12);
	entry.filter?.frequency.setTargetAtTime(SETTLE_LP_HZ, now, 0.12);
}

export function preloadAboutPcbAppearSound() {
	ensureHandlers();
	return loadBuffer();
}

/**
 * @param {number} delta seconds
 * @param {number} reveal painted pcb reveal 0…1
 */
export function updateAboutPcbAppearSound(delta, reveal) {
	ensureHandlers();
	const currentProgress = clamp01(reveal);
	if (performance.now() < suppressedUntil || !isPageSoundAllowed() || !isSoundAudible()) {
		lastProgress = currentProgress;
		return;
	}

	if (Math.abs(currentProgress - lastProgress) > 0.8) {
		stopPlayback(RESTART_FADE_MS);
		lastProgress = currentProgress;
		return;
	}

	if (!loopBuffer) {
		void loadBuffer();
		lastProgress = currentProgress;
		return;
	}

	const speed = delta > 1e-6 ? (currentProgress - lastProgress) / delta : 0;
	const revealGain = audibleRevealEnvelope(currentProgress);
	const moving = Math.abs(speed) > MIN_MOTION;
	const gainTarget = moving ? VOLUME * revealGain : 0;

	void resumeMasterAudioContext();
	syncGain(gainTarget);
	lastProgress = currentProgress;
}

export function resetAboutPcbAppearSound() {
	stopPlayback(0);
	lastProgress = 0;
	lastGainTarget = 0;
	suppressedUntil = 0;
}
