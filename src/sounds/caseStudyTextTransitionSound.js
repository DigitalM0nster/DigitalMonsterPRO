import { isPageSoundAllowed } from "./pageVisibilitySound.js";
import {
	connectGainWithPanToMasterBus,
	getMasterAudioContext,
	resumeMasterAudioContext,
} from "./masterAudioBus.js";

const SOUND_SRC = "/audio/logo_reveal.mp3";
const SOUND_PAN = -0.65;
const VOLUME = 1;
const MIN_SPEED = 0.0025;
const MIN_PLAYBACK_RATE = 0.22;
const MAX_PLAYBACK_RATE = 2.8;
const HARD_SYNC_DRIFT_S = 0.1;
const REST_FADE_MS = 100;

let loadPromise = null;
let forwardBuffer = null;
let reverseBuffer = null;
let playback = null;
let lastProgress = 0;
let suppressedUntil = 0;

function clamp01(value) {
	return Math.max(0, Math.min(1, value));
}

async function loadBuffers() {
	if (forwardBuffer && reverseBuffer) {
		return;
	}
	if (loadPromise) {
		return loadPromise;
	}

	loadPromise = fetch(SOUND_SRC)
		.then((response) => response.arrayBuffer())
		.then(async (arrayBuffer) => {
			const ctx = getMasterAudioContext();
			if (!ctx) {
				return;
			}
			forwardBuffer = await ctx.decodeAudioData(arrayBuffer);
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
	entry.gain.gain.cancelScheduledValues(now);
	entry.gain.gain.setValueAtTime(entry.gain.gain.value, now);
	entry.gain.gain.linearRampToValueAtTime(0, now + fadeMs / 1000);
	setTimeout(() => disposePlayback(entry), fadeMs + 20);
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

	stopPlayback(35);

	const source = ctx.createBufferSource();
	const gain = ctx.createGain();
	const offset = getPlaybackOffset(progress, direction, buffer.duration);
	const startedAt = ctx.currentTime;
	const safeRate = Math.max(MIN_PLAYBACK_RATE, Math.min(MAX_PLAYBACK_RATE, rate));

	source.buffer = buffer;
	source.playbackRate.value = safeRate;
	gain.gain.setValueAtTime(0, startedAt);
	gain.gain.linearRampToValueAtTime(VOLUME, startedAt + 0.015);
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

	const targetOffset = getPlaybackOffset(progress, direction, buffer.duration);
	const expectedOffset = playback
		? playback.offset + (ctx.currentTime - playback.startedAt) * playback.rate
		: 0;
	const directionChanged = playback?.direction !== direction;
	const drifted = !playback || Math.abs(expectedOffset - targetOffset) > HARD_SYNC_DRIFT_S;

	if (directionChanged || drifted || playback?.stopping) {
		startPlayback(direction, rate, progress);
		return;
	}

	playback.rate = Math.max(MIN_PLAYBACK_RATE, Math.min(MAX_PLAYBACK_RATE, rate));
	playback.source.playbackRate.value = playback.rate;
}

export function preloadCaseStudyTextTransitionSound() {
	return loadBuffers();
}

export function updateCaseStudyTextTransitionSound(delta, progress) {
	const currentProgress = clamp01(progress);
	if (performance.now() < suppressedUntil || !isPageSoundAllowed()) {
		lastProgress = currentProgress;
		return;
	}

	if (Math.abs(currentProgress - lastProgress) > 0.8) {
		stopPlayback(35);
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

export function suppressCaseStudyTextTransitionSound(durationMs) {
	suppressedUntil = Math.max(suppressedUntil, performance.now() + Math.max(0, durationMs));
	stopPlayback(35);
}

export function resetCaseStudyTextTransitionSound() {
	stopPlayback(0);
	lastProgress = 0;
	suppressedUntil = 0;
}
