/**
 * Left-panel HUD mosaic SFX (About stages + case stages / enter).
 *
 * Progress scrub: playhead advances on |d progress|; rate follows
 * |d progress / dt|. Always the reversed sample (wheel-down timbre) for
 * both scroll directions. No loop — silence near rest.
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

/** Match CASE_STUDY_LEFT_SOUND_PAN — do not import the pan constant (cycle risk). */
const SOUND_PAN = -0.65;
const VOLUME = 1.2;
/**
 * Soft spring settle is slower than this — keep silent so the reversed bed
 * does not crawl as a heartbeat knock on the left HUD.
 */
const MIN_SPEED = 0.014;
/** Below this playback rate the sample reads as pulse/knock — treat as rest. */
const MIN_AUDIBLE_RATE = 0.55;
const MIN_PLAYBACK_RATE = 0.55;
const MAX_PLAYBACK_RATE = 2.8;
/** Idle / settle — long enough to avoid a hard cut when the spring rests. */
const REST_FADE_MS = 520;
/** Mute / hide — short stop without a hard cut. */
const RESTART_FADE_MS = 120;
/** Soft attack so BufferSource start never reads as a click. */
const ATTACK_S = 0.05;

let loadPromise = null;
/** @type {AudioBuffer | null} */
let buffer = null;
/** @type {null | {
 *   source: AudioBufferSourceNode,
 *   gain: GainNode,
 *   panner: StereoPannerNode | null,
 *   rate: number,
 *   offset: number,
 *   startedAt: number,
 *   stopping: boolean,
 *   disposed: boolean,
 * }} */
let playback = null;
let lastProgress = 0;
/** Monotonic 0..1 playhead — advances on |d progress|; buffer is time-reversed (wheel-down). */
let scrubProgress = 0;
let suppressedUntil = 0;
let handlersBound = false;

function clamp01(value) {
	return Math.max(0, Math.min(1, Number(value) || 0));
}

function wrap01(value) {
	const wrapped = value % 1;
	return wrapped < 0 ? wrapped + 1 : wrapped;
}

async function loadBuffer() {
	if (buffer) {
		return buffer;
	}
	if (loadPromise) {
		return loadPromise;
	}

	loadPromise = Promise.resolve()
		.then(async () => {
			const ctx = getMasterAudioContext();
			if (!ctx) {
				return null;
			}
			const forward = await loadAudioBuffer(SOUND_CATALOG.panel_hud_text, ctx);
			// Time-reversed bed = scroll-down timbre (both wheel directions use this).
			buffer = ctx.createBuffer(forward.numberOfChannels, forward.length, forward.sampleRate);
			for (let channel = 0; channel < forward.numberOfChannels; channel += 1) {
				const source = forward.getChannelData(channel);
				const destination = buffer.getChannelData(channel);
				for (let left = 0, right = source.length - 1; left < source.length; left += 1, right -= 1) {
					destination[left] = source[right];
				}
			}
			return buffer;
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
		// The source may already have ended.
	}
	entry.source.disconnect();
	entry.gain.disconnect();
	entry.panner?.disconnect();
	if (playback === entry) {
		playback = null;
	}
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
	const fadeS = Math.max(0.02, fadeMs / 1000);
	const current = Math.max(0.0001, entry.gain.gain.value);
	entry.gain.gain.cancelScheduledValues(now);
	entry.gain.gain.setValueAtTime(current, now);
	entry.gain.gain.exponentialRampToValueAtTime(0.0001, now + fadeS);
	entry.gain.gain.setValueAtTime(0, now + fadeS);
	setTimeout(() => disposePlayback(entry), fadeMs + 40);
}

function getPlaybackOffset(progress, duration) {
	return Math.max(0, Math.min(duration * 0.998, progress * duration));
}

function startPlayback(rate, progress) {
	const ctx = getMasterAudioContext();
	if (!ctx || !buffer) {
		return;
	}

	// Never hard-cut an active voice — rate chase is enough for scrub feel.
	if (playback && !playback.disposed && !playback.stopping) {
		playback.rate = Math.max(MIN_PLAYBACK_RATE, Math.min(MAX_PLAYBACK_RATE, rate));
		playback.source.playbackRate.setTargetAtTime(playback.rate, ctx.currentTime, 0.05);
		return;
	}

	const source = ctx.createBufferSource();
	const gain = ctx.createGain();
	const offset = getPlaybackOffset(progress, buffer.duration);
	const startedAt = ctx.currentTime;
	const safeRate = Math.max(MIN_PLAYBACK_RATE, Math.min(MAX_PLAYBACK_RATE, rate));

	source.buffer = buffer;
	source.loop = true;
	source.playbackRate.value = safeRate;
	gain.gain.setValueAtTime(0.0001, startedAt);
	gain.gain.exponentialRampToValueAtTime(VOLUME, startedAt + ATTACK_S);
	const panner = connectGainWithPanToMasterBus(ctx, gain, SOUND_PAN);
	source.connect(gain);

	const entry = {
		source,
		gain,
		panner,
		rate: safeRate,
		offset,
		startedAt,
		stopping: false,
		disposed: false,
	};
	playback = entry;
	source.onended = () => disposePlayback(entry);
	source.start(0, offset);
}

function syncPlayback(rate, progress) {
	const ctx = getMasterAudioContext();
	if (!ctx || !buffer) {
		return;
	}

	if (!playback || playback.stopping || playback.disposed) {
		startPlayback(rate, progress);
		return;
	}

	// Rate-only chase — hard offset resync was the sharp fading click on scroll.
	playback.rate = Math.max(MIN_PLAYBACK_RATE, Math.min(MAX_PLAYBACK_RATE, rate));
	playback.source.playbackRate.setTargetAtTime(playback.rate, ctx.currentTime, 0.05);
}

export function preloadCaseStudyTextTransitionSound() {
	ensureHandlers();
	return loadBuffer();
}

/**
 * @param {number} delta seconds
 * @param {number} progress visual mix 0..1
 * @param {number} [_progressTarget] ignored — scrub follows painted motion only
 */
export function updateCaseStudyTextTransitionSound(delta, progress, _progressTarget = progress) {
	ensureHandlers();
	const currentProgress = clamp01(progress);
	if (performance.now() < suppressedUntil || !isPageSoundAllowed() || !isSoundAudible()) {
		lastProgress = currentProgress;
		return;
	}

	if (Math.abs(currentProgress - lastProgress) > 0.8) {
		stopPlayback(RESTART_FADE_MS);
		scrubProgress = 0;
		lastProgress = currentProgress;
		return;
	}

	const speed = delta > 1e-6 ? (currentProgress - lastProgress) / delta : 0;
	const absSpeed = Math.abs(speed);
	const duration = buffer?.duration ?? 0;
	if (!duration) {
		void loadBuffer();
		lastProgress = currentProgress;
		return;
	}

	const rate = absSpeed * duration;
	// Slow auto-settle / crawl: no scrub (avoids heartbeat thump in left text).
	if (absSpeed <= MIN_SPEED || rate < MIN_AUDIBLE_RATE) {
		stopPlayback();
		lastProgress = currentProgress;
		return;
	}

	// Both scroll directions advance the same reversed playhead (wheel-down timbre).
	scrubProgress = wrap01(scrubProgress + Math.abs(currentProgress - lastProgress));
	void resumeMasterAudioContext();
	syncPlayback(rate, scrubProgress);
	lastProgress = currentProgress;
}

export function suppressCaseStudyTextTransitionSound(durationMs) {
	suppressedUntil = Math.max(suppressedUntil, performance.now() + Math.max(0, durationMs));
	stopPlayback(REST_FADE_MS);
}

export function resetCaseStudyTextTransitionSound() {
	stopPlayback(0);
	lastProgress = 0;
	scrubProgress = 0;
	suppressedUntil = 0;
}

export function disposeCaseStudyTextTransitionSound() {
	resetCaseStudyTextTransitionSound();
}
