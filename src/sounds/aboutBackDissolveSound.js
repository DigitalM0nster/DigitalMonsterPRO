/**
 * About Back-plate disappear SFX (story 1→2).
 *
 * Separate from white PCB particle appear (`aboutPcbAppearSound.js`).
 * Driven by painted dissolve, not wheel. Soft edges at start/end.
 * Buffer: SOUND_CATALOG.about_back_dissolve.
 */
import { isPageSoundAllowed, registerPageVisibilitySoundHandlers } from "./pageVisibilitySound.js";
import { isSoundAudible, registerSiteSoundMuteHandler } from "./siteSoundToggle.js";
import {
	connectGainWithPanToMasterBus,
	getMasterAudioContext,
	resumeMasterAudioContext,
} from "./masterAudioBus.js";
import { SOUND_CATALOG } from "./soundDesign.js";

const SOUND_PAN = 0.1;
const BUS_VOLUME = 0.82;
const MIN_SPEED = 0.0025;
const REST_FADE_MS = 420;
const RESTART_FADE_MS = 90;
/** Soft gain ramp when the loop wakes / sleeps. */
const MOTION_ATTACK_S = 0.22;
const MOTION_RELEASE_S = 0.38;
/** Soft at dissolve start + end (full Back leave window). */
const EDGE_FADE = 0.28;
/** Crossfade length when stitching loop repeats (seconds). */
const LOOP_CROSSFADE_S = 0.09;
/** How many copies of the source are glued into the loop bed. */
const LOOP_REPEAT_COUNT = 3;
const MIN_PLAYBACK_RATE = 0.85;
const MAX_PLAYBACK_RATE = 1.35;
/** Defaults match ABOUT_MATERIALS.backRetreat / AboutScene._applyStoryProgress. */
const BACK_STORY_START = 1;
const BACK_STORY_END = 2;

let loadPromise = null;
/** @type {AudioBuffer | null} */
let loopBuffer = null;
/** @type {null | {
 *   source: AudioBufferSourceNode,
 *   gain: GainNode,
 *   panner: StereoPannerNode | null,
 *   rate: number,
 *   stopping: boolean,
 *   disposed: boolean,
 * }} */
let playback = null;
let lastProgress = 0;
let suppressedUntil = 0;
let handlersBound = false;
/** Last target gain we scheduled (0…1 * BUS_VOLUME scale). */
let lastGainTarget = 0;

function clamp01(value) {
	return Math.max(0, Math.min(1, Number(value) || 0));
}

function smoothstep01(t) {
	const x = clamp01(t);
	return x * x * (3 - 2 * x);
}

/**
 * Painted back vapor dissolve 0…1 — matches AboutScene._applyStoryProgress.
 * @param {number} story
 */
export function aboutStoryToBackDissolve(story) {
	const s = Number(story) || 0;
	const span = Math.max(1e-4, BACK_STORY_END - BACK_STORY_START);
	return clamp01((s - BACK_STORY_START) / span);
}

/**
 * Soft at dissolve start/end across the full Back leave (story 1→2).
 * @param {number} progress dissolve 0…1
 */
function edgeEnvelope(progress) {
	const p = clamp01(progress);
	const edge = Math.max(0.08, Math.min(0.45, EDGE_FADE));
	let g = 1;
	if (p < edge) {
		g = smoothstep01(p / edge);
	} else if (p > 1 - edge) {
		g = smoothstep01((1 - p) / edge);
	}
	return g * g;
}

/**
 * Quiet crawl → soft; faster scroll → fuller (still capped).
 * @param {number} absSpeed
 */
function speedEnvelope(absSpeed) {
	const n = clamp01((absSpeed - MIN_SPEED) / 0.55);
	return smoothstep01(n);
}

/**
 * Glue N copies of `source` with equal-power crossfades at each seam,
 * and close the loop so `loop = true` has no click.
 * @param {AudioContext} ctx
 * @param {AudioBuffer} source
 */
function buildStitchedLoopBuffer(ctx, source) {
	const channels = source.numberOfChannels;
	const rate = source.sampleRate;
	const srcLen = source.length;
	const fadeSamples = Math.max(32, Math.min(Math.floor(srcLen * 0.35), Math.floor(LOOP_CROSSFADE_S * rate)));
	const repeats = Math.max(2, LOOP_REPEAT_COUNT);
	// Each join overlaps `fadeSamples`; final loop also overlaps head/tail.
	const bodyPerCopy = srcLen - fadeSamples;
	const outLen = bodyPerCopy * repeats + fadeSamples;
	const out = ctx.createBuffer(channels, outLen, rate);

	for (let ch = 0; ch < channels; ch += 1) {
		const src = source.getChannelData(ch);
		const dst = out.getChannelData(ch);
		let write = 0;

		for (let r = 0; r < repeats; r += 1) {
			if (r === 0) {
				// First copy: full sample
				dst.set(src, 0);
				write = srcLen;
			} else {
				// Crossfade previous tail with next head (equal-power).
				const seamStart = write - fadeSamples;
				for (let i = 0; i < fadeSamples; i += 1) {
					const t = i / (fadeSamples - 1 || 1);
					const fadeOut = Math.cos(t * Math.PI * 0.5);
					const fadeIn = Math.sin(t * Math.PI * 0.5);
					dst[seamStart + i] = dst[seamStart + i] * fadeOut + src[i] * fadeIn;
				}
				// Remainder of this copy after the overlapped head.
				const rest = src.subarray(fadeSamples);
				dst.set(rest, write);
				write += rest.length;
			}
		}

		// Close the loop: crossfade final tail into the buffer head in-place.
		for (let i = 0; i < fadeSamples; i += 1) {
			const t = i / (fadeSamples - 1 || 1);
			const fadeOut = Math.cos(t * Math.PI * 0.5);
			const fadeIn = Math.sin(t * Math.PI * 0.5);
			const head = dst[i];
			const tailIndex = outLen - fadeSamples + i;
			dst[tailIndex] = dst[tailIndex] * fadeOut + head * fadeIn;
		}
	}

	return out;
}

async function loadBuffers() {
	if (loopBuffer) {
		return;
	}
	if (loadPromise) {
		return loadPromise;
	}

	loadPromise = fetch(SOUND_CATALOG.about_back_dissolve)
		.then((response) => response.arrayBuffer())
		.then(async (arrayBuffer) => {
			const ctx = getMasterAudioContext();
			if (!ctx) {
				return;
			}
			const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
			loopBuffer = buildStitchedLoopBuffer(ctx, decoded);
		})
		.catch(() => {
			loadPromise = null;
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
		entry.gain.disconnect();
		entry.panner?.disconnect();
	} catch {
		// already disconnected
	}
	if (playback === entry) {
		playback = null;
	}
	lastGainTarget = 0;
}

function stopPlayback(fadeMs = REST_FADE_MS) {
	const entry = playback;
	if (!entry || entry.stopping) {
		return;
	}
	entry.stopping = true;

	const ctx = getMasterAudioContext();
	if (!ctx || fadeMs <= 0) {
		disposePlayback(entry);
		return;
	}

	const now = ctx.currentTime;
	const fadeS = Math.max(MOTION_RELEASE_S, fadeMs / 1000);
	const current = Math.max(0.0001, entry.gain.gain.value);
	entry.gain.gain.cancelScheduledValues(now);
	entry.gain.gain.setValueAtTime(current, now);
	entry.gain.gain.exponentialRampToValueAtTime(0.0001, now + fadeS);
	entry.gain.gain.setValueAtTime(0, now + fadeS);
	lastGainTarget = 0;
	setTimeout(() => disposePlayback(entry), fadeS * 1000 + 40);
}

function startPlayback() {
	const ctx = getMasterAudioContext();
	if (!ctx || !loopBuffer) {
		return;
	}

	stopPlayback(RESTART_FADE_MS);

	const source = ctx.createBufferSource();
	const gain = ctx.createGain();
	source.buffer = loopBuffer;
	source.loop = true;
	source.playbackRate.value = 1;

	const now = ctx.currentTime;
	gain.gain.setValueAtTime(0.0001, now);

	const panner = connectGainWithPanToMasterBus(ctx, gain, SOUND_PAN);
	source.connect(gain);

	const entry = {
		source,
		gain,
		panner,
		rate: 1,
		stopping: false,
		disposed: false,
	};
	playback = entry;
	source.onended = () => disposePlayback(entry);
	source.start(0);
	lastGainTarget = 0;
}

/**
 * @param {number} progress
 * @param {number} absSpeed
 */
function syncPlayback(progress, absSpeed) {
	const ctx = getMasterAudioContext();
	if (!ctx || !loopBuffer) {
		return;
	}

	const edge = edgeEnvelope(progress);
	const speed = speedEnvelope(absSpeed);
	const target = BUS_VOLUME * edge * speed;

	if (target <= 0.0008) {
		if (playback && !playback.stopping) {
			stopPlayback(REST_FADE_MS);
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
	const safeTarget = Math.max(0.0002, target);
	// Soft chase — per-frame cancel+exponentialRamp clicks while edge envelope fades.
	if (Math.abs(safeTarget - lastGainTarget) > 0.004) {
		const rising = safeTarget > lastGainTarget;
		const timeConstant = (rising ? MOTION_ATTACK_S : MOTION_RELEASE_S) * 0.35;
		entry.gain.gain.setTargetAtTime(safeTarget, now, Math.max(0.06, timeConstant));
		lastGainTarget = safeTarget;
	}

	const rate = Math.max(
		MIN_PLAYBACK_RATE,
		Math.min(MAX_PLAYBACK_RATE, 0.92 + clamp01(absSpeed / 0.9) * 0.35),
	);
	entry.rate = rate;
	entry.source.playbackRate.setTargetAtTime(rate, now, 0.06);
}

export function preloadAboutBackDissolveSound() {
	ensureHandlers();
	return loadBuffers();
}

/**
 * @param {number} delta seconds
 * @param {number} dissolve painted back dissolve 0…1
 */
export function updateAboutBackDissolveSound(delta, dissolve) {
	ensureHandlers();
	const currentProgress = clamp01(dissolve);
	if (performance.now() < suppressedUntil || !isPageSoundAllowed() || !isSoundAudible()) {
		lastProgress = currentProgress;
		return;
	}

	if (Math.abs(currentProgress - lastProgress) > 0.8) {
		stopPlayback(RESTART_FADE_MS);
		lastProgress = currentProgress;
		return;
	}

	const speed = delta > 1e-6 ? (currentProgress - lastProgress) / delta : 0;
	if (Math.abs(speed) <= MIN_SPEED) {
		stopPlayback();
		lastProgress = currentProgress;
		return;
	}

	if (!loopBuffer) {
		void loadBuffers();
		lastProgress = currentProgress;
		return;
	}

	void resumeMasterAudioContext();
	syncPlayback(currentProgress, Math.abs(speed));
	lastProgress = currentProgress;
}

export function suppressAboutBackDissolveSound(durationMs) {
	suppressedUntil = Math.max(suppressedUntil, performance.now() + Math.max(0, durationMs));
	stopPlayback(REST_FADE_MS);
}

export function resetAboutBackDissolveSound() {
	stopPlayback(0);
	lastProgress = 0;
	suppressedUntil = 0;
	lastGainTarget = 0;
}
