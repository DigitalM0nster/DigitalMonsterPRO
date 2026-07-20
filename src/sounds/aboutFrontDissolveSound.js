/**
 * About front-plate hex dissolve SFX (stage 1, story 0.5→1).
 *
 * Progress scrub on painted dissolve (same formula as AboutScene), not wheel.
 * Buffer: SOUND_CATALOG.logo_reveal. Forward/reverse beds follow dissolve direction.
 */
import { isPageSoundAllowed, registerPageVisibilitySoundHandlers } from "./pageVisibilitySound.js";
import { isSoundAudible, registerSiteSoundMuteHandler } from "./siteSoundToggle.js";
import {
	connectGainWithPanToMasterBus,
	getMasterAudioContext,
	resumeMasterAudioContext,
} from "./masterAudioBus.js";
import { SOUND_CATALOG } from "./soundDesign.js";

/** Mild center-left — front plate sits mid-frame, not left HUD. */
const SOUND_PAN = -0.2;
const VOLUME = 0.95;
const MIN_SPEED = 0.0025;
const MIN_PLAYBACK_RATE = 0.22;
const MAX_PLAYBACK_RATE = 2.8;
const REST_FADE_MS = 340;
const RESTART_FADE_MS = 120;
const ATTACK_S = 0.05;

let loadPromise = null;
/** @type {AudioBuffer | null} */
let forwardBuffer = null;
/** @type {AudioBuffer | null} */
let reverseBuffer = null;
/** @type {null | {
 *   source: AudioBufferSourceNode,
 *   gain: GainNode,
 *   panner: StereoPannerNode | null,
 *   direction: number,
 *   rate: number,
 *   offset: number,
 *   startedAt: number,
 *   stopping: boolean,
 *   disposed: boolean,
 * }} */
let playback = null;
let lastProgress = 0;
let suppressedUntil = 0;
let handlersBound = false;

function clamp01(value) {
	return Math.max(0, Math.min(1, Number(value) || 0));
}

/**
 * Painted front hex dissolve 0…1 — matches AboutScene._applyStoryProgress.
 * @param {number} story
 */
export function aboutStoryToFrontDissolve(story) {
	const stage1 = clamp01(story);
	return clamp01((stage1 - 0.5) / 0.5);
}

async function loadBuffers() {
	if (forwardBuffer && reverseBuffer) {
		return;
	}
	if (loadPromise) {
		return loadPromise;
	}

	loadPromise = fetch(SOUND_CATALOG.logo_reveal)
		.then((response) => response.arrayBuffer())
		.then(async (arrayBuffer) => {
			const ctx = getMasterAudioContext();
			if (!ctx) {
				return;
			}
			forwardBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
			reverseBuffer = ctx.createBuffer(
				forwardBuffer.numberOfChannels,
				forwardBuffer.length,
				forwardBuffer.sampleRate,
			);
			for (let channel = 0; channel < forwardBuffer.numberOfChannels; channel += 1) {
				const source = forwardBuffer.getChannelData(channel);
				const destination = reverseBuffer.getChannelData(channel);
				for (let left = 0, right = source.length - 1; left < source.length; left += 1, right -= 1) {
					destination[left] = source[right];
				}
			}
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

function getPlaybackOffset(progress, direction, duration) {
	const normalized = direction > 0 ? progress : 1 - progress;
	return Math.max(0, Math.min(duration * 0.998, normalized * duration));
}

function startPlayback(direction, rate, progress) {
	const ctx = getMasterAudioContext();
	const buffer = direction > 0 ? forwardBuffer : reverseBuffer;
	if (!ctx || !buffer) {
		return;
	}

	if (playback && !playback.disposed && !playback.stopping) {
		stopPlayback(RESTART_FADE_MS);
	}

	const source = ctx.createBufferSource();
	const gain = ctx.createGain();
	const offset = getPlaybackOffset(progress, direction, buffer.duration);
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
		direction,
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

function syncPlayback(direction, rate, progress) {
	const ctx = getMasterAudioContext();
	const buffer = direction > 0 ? forwardBuffer : reverseBuffer;
	if (!ctx || !buffer) {
		return;
	}

	const directionChanged = playback?.direction !== direction;
	if (!playback || playback.stopping || playback.disposed || directionChanged) {
		startPlayback(direction, rate, progress);
		return;
	}

	playback.rate = Math.max(MIN_PLAYBACK_RATE, Math.min(MAX_PLAYBACK_RATE, rate));
	playback.source.playbackRate.setTargetAtTime(playback.rate, ctx.currentTime, 0.05);
}

export function preloadAboutFrontDissolveSound() {
	ensureHandlers();
	return loadBuffers();
}

/**
 * @param {number} delta seconds
 * @param {number} dissolve painted front dissolve 0…1
 */
export function updateAboutFrontDissolveSound(delta, dissolve) {
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

	const direction = Math.sign(speed) || 1;
	const duration = forwardBuffer?.duration ?? reverseBuffer?.duration ?? 0;
	if (!duration) {
		void loadBuffers();
		lastProgress = currentProgress;
		return;
	}

	const rate = Math.abs(speed) * duration;
	void resumeMasterAudioContext();
	syncPlayback(direction, rate, currentProgress);
	lastProgress = currentProgress;
}

export function suppressAboutFrontDissolveSound(durationMs) {
	suppressedUntil = Math.max(suppressedUntil, performance.now() + Math.max(0, durationMs));
	stopPlayback(REST_FADE_MS);
}

export function resetAboutFrontDissolveSound() {
	stopPlayback(0);
	lastProgress = 0;
	suppressedUntil = 0;
}
