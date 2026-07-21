/**
 * About white InsideLarge PCB particle bed.
 *
 * Soft stitched loop while the white microchip particles are on screen.
 * Blue edge lattice has no SFX. Driven by painted story presence, not wheel.
 * Buffer: SOUND_CATALOG.about_particles.
 */
import { isPageSoundAllowed, registerPageVisibilitySoundHandlers } from "./pageVisibilitySound.js";
import { isSoundAudible, registerSiteSoundMuteHandler } from "./siteSoundToggle.js";
import {
	connectGainWithPanToMasterBus,
	getMasterAudioContext,
	resumeMasterAudioContext,
} from "./masterAudioBus.js";
import { loadAudioBuffer } from "./audioAssetCache.js";
import { SOUND_CATALOG } from "./soundCatalog.js";

/** Dead-center — equal in both headphones (no stereo lean). */
const SOUND_PAN = 0;
/** Quiet when PCB just appeared (story≈2); louder as the detail approaches (→4). */
const BUS_VOLUME_FAR = 0.02;
const BUS_VOLUME_NEAR = 0.07;
const FADE_IN_S = 0.7;
const FADE_OUT_S = 0.9;
/** Slow rate drift so the long stitched bed doesn't read as a hard loop. */
const RATE_BASE = 1;
const RATE_DRIFT = 0.035;
const RATE_DRIFT_HZ = 0.07;
const LOOP_CROSSFADE_S = 0.1;
const LOOP_REPEAT_COUNT = 2;
/** Match ABOUT_PARTICLES.revealStoryStart / revealStoryEnd (white PCB only). */
const PCB_REVEAL_START = 1.5;
const PCB_REVEAL_END = 2;
/** Model approaches camera mainly on story 2→4 (see ABOUT_STAGE_POSES model.z). */
const PROXIMITY_START = 2;
const PROXIMITY_END = 4;

let loadPromise = null;
/** @type {AudioBuffer | null} */
let loopBuffer = null;
/** @type {null | {
 *   source: AudioBufferSourceNode,
 *   gain: GainNode,
 *   panner: StereoPannerNode | null,
 *   stopping: boolean,
 *   disposed: boolean,
 * }} */
let playback = null;
let lastGainTarget = 0;
let handlersBound = false;

function clamp01(value) {
	return Math.max(0, Math.min(1, Number(value) || 0));
}

function smoothstep01(t) {
	const x = clamp01(t);
	return x * x * (3 - 2 * x);
}

/**
 * How strongly the white InsideLarge PCB particles are present (0…1).
 * Appear story 1.5→2, then stay — same as AboutScene pcbReveal. No blue edge.
 * Bed waits until particles clear the chip occlusion (match appear SFX delay).
 * @param {number} story
 */
export function aboutStoryToParticlePresence(story) {
	const s = Number(story) || 0;
	const pcbSpan = Math.max(1e-4, PCB_REVEAL_END - PCB_REVEAL_START);
	const raw = clamp01((s - PCB_REVEAL_START) / pcbSpan);
	/** First ~⅓ of reveal is under the chip — keep bed silent. */
	const audibleStart = 0.34;
	return clamp01((raw - audibleStart) / Math.max(1e-4, 1 - audibleStart));
}

/**
 * How close the detail/PCB is to the camera (0…1) — story 2→4.
 * @param {number} story
 */
export function aboutStoryToParticleProximity(story) {
	const s = Number(story) || 0;
	const span = Math.max(1e-4, PROXIMITY_END - PROXIMITY_START);
	return smoothstep01((s - PROXIMITY_START) / span);
}

/**
 * Decode stereo → equal mono channels so headphone L/R match.
 * @param {AudioContext} ctx
 * @param {AudioBuffer} source
 */
function toEqualMonoBuffer(ctx, source) {
	const length = source.length;
	const rate = source.sampleRate;
	const mono = ctx.createBuffer(2, length, rate);
	const outL = mono.getChannelData(0);
	const outR = mono.getChannelData(1);
	const ch0 = source.getChannelData(0);
	const ch1 = source.numberOfChannels > 1 ? source.getChannelData(1) : ch0;
	for (let i = 0; i < length; i += 1) {
		const m = 0.5 * (ch0[i] + ch1[i]);
		outL[i] = m;
		outR[i] = m;
	}
	return mono;
}

/**
 * @param {AudioContext} ctx
 * @param {AudioBuffer} source
 */
function buildStitchedLoopBuffer(ctx, source) {
	const channels = source.numberOfChannels;
	const rate = source.sampleRate;
	const srcLen = source.length;
	const fadeSamples = Math.max(32, Math.min(Math.floor(srcLen * 0.35), Math.floor(LOOP_CROSSFADE_S * rate)));
	const repeats = Math.max(2, LOOP_REPEAT_COUNT);
	const bodyPerCopy = srcLen - fadeSamples;
	const outLen = bodyPerCopy * repeats + fadeSamples;
	const out = ctx.createBuffer(channels, outLen, rate);

	for (let ch = 0; ch < channels; ch += 1) {
		const src = source.getChannelData(ch);
		const dst = out.getChannelData(ch);
		let write = 0;

		for (let r = 0; r < repeats; r += 1) {
			if (r === 0) {
				dst.set(src, 0);
				write = srcLen;
			} else {
				const seamStart = write - fadeSamples;
				for (let i = 0; i < fadeSamples; i += 1) {
					const t = i / (fadeSamples - 1 || 1);
					const fadeOut = Math.cos(t * Math.PI * 0.5);
					const fadeIn = Math.sin(t * Math.PI * 0.5);
					dst[seamStart + i] = dst[seamStart + i] * fadeOut + src[i] * fadeIn;
				}
				const rest = src.subarray(fadeSamples);
				dst.set(rest, write);
				write += rest.length;
			}
		}

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

	loadPromise = Promise.resolve()
		.then(async () => {
			const ctx = getMasterAudioContext();
			if (!ctx) {
				return;
			}
			const decoded = await loadAudioBuffer(SOUND_CATALOG.about_particles, ctx);
			const mono = toEqualMonoBuffer(ctx, decoded);
			// File is already a long varied bed — only stitch if very short.
			loopBuffer = mono.duration < 2.2 ? buildStitchedLoopBuffer(ctx, mono) : mono;
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
			stopPlayback(120);
		}
	});
	registerPageVisibilitySoundHandlers({
		onHidden: () => stopPlayback(120),
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

function stopPlayback(fadeMs = FADE_OUT_S * 1000) {
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
	const fadeS = Math.max(0.08, fadeMs / 1000);
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

	if (playback && !playback.disposed && !playback.stopping) {
		return;
	}

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
		stopping: false,
		disposed: false,
	};
	playback = entry;
	source.onended = () => disposePlayback(entry);
	source.start(0);
	lastGainTarget = 0;
}

/**
 * @param {number} presence 0…1 pcb visible
 * @param {number} proximity 0…1 detail closer to camera
 */
function syncGain(presence, proximity) {
	const ctx = getMasterAudioContext();
	if (!ctx || !loopBuffer) {
		return;
	}

	const nearness = smoothstep01(proximity);
	const busVol = BUS_VOLUME_FAR + (BUS_VOLUME_NEAR - BUS_VOLUME_FAR) * nearness;
	const target = busVol * smoothstep01(presence);
	if (target <= 0.0015) {
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
	const safeTarget = Math.max(0.0002, target);
	// Avoid per-frame cancel+ramp (causes a sharp fading click while presence rises).
	if (Math.abs(safeTarget - lastGainTarget) > 0.0004) {
		const rising = safeTarget > lastGainTarget;
		const timeConstant = rising ? FADE_IN_S * 0.35 : FADE_OUT_S * 0.35;
		entry.gain.gain.setTargetAtTime(safeTarget, now, Math.max(0.08, timeConstant));
		lastGainTarget = safeTarget;
	}

	// Gentle playback-rate wander — breaks obvious loop recognition.
	const drift = RATE_BASE + Math.sin(now * Math.PI * 2 * RATE_DRIFT_HZ) * RATE_DRIFT;
	entry.source.playbackRate.setTargetAtTime(drift, now, 0.25);
}

export function preloadAboutParticleSound() {
	ensureHandlers();
	return loadBuffers();
}

/**
 * @param {number} story painted About story progress
 */
export function updateAboutParticleSound(story) {
	ensureHandlers();
	if (!isPageSoundAllowed() || !isSoundAudible()) {
		stopPlayback(160);
		return;
	}

	const presence = aboutStoryToParticlePresence(story);
	const proximity = aboutStoryToParticleProximity(story);
	if (!loopBuffer) {
		void loadBuffers().then(() => {
			if (loopBuffer) {
				void resumeMasterAudioContext();
				syncGain(
					aboutStoryToParticlePresence(story),
					aboutStoryToParticleProximity(story),
				);
			}
		});
		return;
	}

	void resumeMasterAudioContext();
	syncGain(presence, proximity);
}

export function resetAboutParticleSound() {
	stopPlayback(0);
	lastGainTarget = 0;
}
