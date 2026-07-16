import { store } from "../store.jsx";
import { isPageSoundAllowed, registerPageVisibilitySoundHandlers } from "./pageVisibilitySound.js";
import { isSoundAudible, registerSiteSoundMuteHandler } from "./siteSoundToggle.js";
import {
	connectNodeToMasterBus,
	getMasterAudioContext,
	resumeMasterAudioContext,
	suspendMasterAudioContext,
} from "./masterAudioBus.js";
import {
	CAROUSEL_PROGRESS_SEGMENT_END,
	CAROUSEL_PROGRESS_SMOOTH,
	isCarouselRoutePage,
} from "../three/render/transition/SceneCarousel.js";

/** Позиция в файле = progress карусели (0…1), не колёсико / progressTarget. */
export const HEX_TRANSITION_SOUND_SRC = "/audio/hexTransition1.mp3";

const VOLUME = 0.72;
const VELOCITY_TO_RATE = 1.05;
const MIN_PLAYBACK_RATE = 0.22;
const MAX_PLAYBACK_RATE = 2.8;
/** Крупный дрейф currentTime от progress — жёсткий seek. */
const HARD_SYNC_DRIFT_S = 0.1;
/** Мелкий дрейф при старте play. */
const SOFT_SYNC_DRIFT_S = 0.02;
const CHASE_GAP_EPS = 0.0006;
const AT_REST_EPS = 0.0008;
const MIN_ANIM_SPEED = 0.0025;
/** Плавное затухание вместо резкого pause при уходе / сбросе progress. */
const FADE_OUT_MS = 220;
const AT_REST_FADE_MS = 140;
/** Скачок progress назад (syncFromPage), не commit сегмента — не seek, а fade. */
const PROGRESS_JUMP_BACK_EPS = 0.12;
/**
 * Вертикальная панорама (Web Audio HRTF): progress 0 — снизу, 0.5 — центр, 1 — сверху.
 * Диапазон по оси Y в «метрах» сцены слушателя.
 */
const SPATIAL_Y_EXTENT = 2.4;
/** Z: источник перед слушателем (не сзади головы). */
const SPATIAL_Z = -0.85;

/**
 * progress 0…1 → Y: низ → центр → верх.
 * @param {number} progress
 */
export function progressToSpatialY(progress) {
	const clamped = Math.max(0, Math.min(1, progress));
	return (clamped - 0.5) * 2 * SPATIAL_Y_EXTENT;
}

class HexTransitionSoundController {
	constructor() {
		/** @type {HTMLAudioElement | null} */
		this._audio = null;
		/** @type {HTMLAudioElement | null} */
		this._audioReversed = null;
		/** @type {AudioContext | null} */
		this._ctx = null;
		/** @type {PannerNode | null} */
		this._forwardPanner = null;
		/** @type {PannerNode | null} */
		this._reversePanner = null;
		/** @type {GainNode | null} */
		this._forwardGain = null;
		/** @type {GainNode | null} */
		this._reverseGain = null;
		/** @type {Promise<void> | null} */
		this._loadPromise = null;
		this._ready = false;
		this._duration = 0;
		this._lastProgress = 0;
		this._lastProgressTarget = 0;
		this._reversePlaybackOk = true;
		this._masterGain = VOLUME;
		/** @type {{ active: boolean, onComplete?: () => void } | null} */
		this._fadeOut = null;
	}

	_getAudioContext() {
		return getMasterAudioContext();
	}

	_configurePanner(panner) {
		panner.panningModel = "HRTF";
		panner.distanceModel = "linear";
		panner.refDistance = 1;
		panner.maxDistance = 24;
		panner.rolloffFactor = 0;
	}

	_connectMediaElement(audio, gainRef) {
		const ctx = this._getAudioContext();
		if (!ctx || !audio) {
			return null;
		}

		audio.volume = 1;

		const source = ctx.createMediaElementSource(audio);
		const gain = ctx.createGain();
		const panner = ctx.createPanner();
		this._configurePanner(panner);
		gain.gain.value = this._masterGain;

		source.connect(gain);
		gain.connect(panner);
		connectNodeToMasterBus(panner);
		this._ctx = ctx;

		this[gainRef] = gain;

		return panner;
	}

	_setMasterGain(value) {
		this._masterGain = Math.max(0, value);
		for (const gain of [this._forwardGain, this._reverseGain]) {
			if (gain) {
				gain.gain.value = this._masterGain;
			}
		}
	}

	_cancelFadeOut() {
		this._fadeOut = null;
	}

	_beginFadeOut(onComplete, durationMs = FADE_OUT_MS) {
		if (this._fadeOut?.active) {
			return;
		}

		this._fadeOut = {
			active: true,
			durationMs,
			remainingMs: durationMs,
			startGain: this._masterGain,
			onComplete,
		};
	}

	_tickFadeOut(delta) {
		const fade = this._fadeOut;
		if (!fade?.active) {
			return false;
		}

		fade.remainingMs -= delta * 1000;
		const elapsed = fade.durationMs - Math.max(0, fade.remainingMs);
		const linear = Math.min(1, elapsed / fade.durationMs);
		this._setMasterGain(fade.startGain * (1 - linear));

		if (fade.remainingMs <= 0) {
			this._fadeOut = null;
			this._setMasterGain(0);
			fade.onComplete?.();
		}

		return true;
	}

	_isAudible() {
		return this._masterGain > 0.02 || this._fadeOut?.active;
	}

	_applySpatialPosition(progress) {
		const y = progressToSpatialY(progress);

		for (const panner of [this._forwardPanner, this._reversePanner]) {
			if (!panner) {
				continue;
			}

			if (typeof panner.positionX !== "undefined") {
				panner.positionX.value = 0;
				panner.positionY.value = y;
				panner.positionZ.value = SPATIAL_Z;
			} else {
				panner.setPosition(0, y, SPATIAL_Z);
			}
		}
	}

	async _resumeContext() {
		await resumeMasterAudioContext();
	}

	_ensureAudio() {
		if (this._audio || typeof window === "undefined") {
			return this._audio;
		}

		const audio = new Audio(HEX_TRANSITION_SOUND_SRC);
		audio.preload = "auto";
		this._audio = audio;
		this._forwardPanner = this._connectMediaElement(audio, "_forwardGain");

		this._loadPromise = this._loadWithReverse(audio);

		return audio;
	}

	async _loadWithReverse(audio) {
		await new Promise((resolve) => {
			const onReady = () => {
				this._duration = Number.isFinite(audio.duration) ? audio.duration : 0;
				this._ready = this._duration > 0.05;
				resolve();
			};

			audio.addEventListener("loadedmetadata", onReady, { once: true });
			audio.addEventListener("error", () => resolve(), { once: true });
		});

		if (!this._ready) {
			return;
		}

		await this._resumeContext();

		try {
			const response = await fetch(HEX_TRANSITION_SOUND_SRC);
			const arrayBuffer = await response.arrayBuffer();
			const ctx = this._getAudioContext();
			if (!ctx) {
				return;
			}

			const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
			const reversed = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);

			for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
				const src = buffer.getChannelData(channel);
				const dst = reversed.getChannelData(channel);
				for (let i = 0, j = src.length - 1; i < src.length; i += 1, j -= 1) {
					dst[i] = src[j];
				}
			}

			const wavBlob = this._encodeWav(reversed);
			const url = URL.createObjectURL(wavBlob);
			const reversedAudio = new Audio(url);
			reversedAudio.preload = "auto";
			this._audioReversed = reversedAudio;
			this._reversePanner = this._connectMediaElement(reversedAudio, "_reverseGain");
		} catch {
			// fallback: только отрицательный playbackRate на основном треке
		}
	}

	/** Минимальный WAV-энкодер для reversed-буфера. */
	_encodeWav(buffer) {
		const channels = buffer.numberOfChannels;
		const sampleRate = buffer.sampleRate;
		const length = buffer.length;
		const bytesPerSample = 2;
		const blockAlign = channels * bytesPerSample;
		const dataSize = length * blockAlign;
		const arrayBuffer = new ArrayBuffer(44 + dataSize);
		const view = new DataView(arrayBuffer);

		const writeString = (offset, text) => {
			for (let i = 0; i < text.length; i += 1) {
				view.setUint8(offset + i, text.charCodeAt(i));
			}
		};

		writeString(0, "RIFF");
		view.setUint32(4, 36 + dataSize, true);
		writeString(8, "WAVE");
		writeString(12, "fmt ");
		view.setUint32(16, 16, true);
		view.setUint16(20, 1, true);
		view.setUint16(22, channels, true);
		view.setUint32(24, sampleRate, true);
		view.setUint32(28, sampleRate * blockAlign, true);
		view.setUint16(32, blockAlign, true);
		view.setUint16(34, bytesPerSample * 8, true);
		writeString(36, "data");
		view.setUint32(40, dataSize, true);

		let offset = 44;
		const channelData = [];
		for (let ch = 0; ch < channels; ch += 1) {
			channelData.push(buffer.getChannelData(ch));
		}

		for (let i = 0; i < length; i += 1) {
			for (let ch = 0; ch < channels; ch += 1) {
				const sample = Math.max(-1, Math.min(1, channelData[ch][i]));
				view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
				offset += 2;
			}
		}

		return new Blob([arrayBuffer], { type: "audio/wav" });
	}

	preload() {
		this._ensureAudio();
		return this._loadPromise ?? Promise.resolve();
	}

	_stop(reset = true, { immediate = true } = {}) {
		if (!immediate && this._isAudible()) {
			this._beginFadeOut(() => this._stop(reset, { immediate: true }), FADE_OUT_MS);
			return;
		}

		this._cancelFadeOut();

		for (const audio of [this._audio, this._audioReversed]) {
			if (!audio) {
				continue;
			}
			audio.pause();
			if (reset) {
				try {
					audio.currentTime = 0;
				} catch {
					// ignore
				}
			}
		}

		if (reset) {
			this._lastProgress = 0;
			this._lastProgressTarget = 0;
			this._applySpatialPosition(0);
		}

		this._setMasterGain(VOLUME);
	}

	_pauseAtRest() {
		if (this._fadeOut?.active) {
			return;
		}

		this._beginFadeOut(() => {
			this._pauseInactive(null);
			this._setMasterGain(VOLUME);
		}, AT_REST_FADE_MS);
	}

	_clampProgress(progress) {
		return Math.max(0, Math.min(1, progress));
	}

	_clampTime(seconds, duration = this._duration) {
		if (!Number.isFinite(seconds) || duration <= 0) {
			return 0;
		}
		return Math.max(0, Math.min(duration * 0.998, seconds));
	}

	_seekTo(audio, time) {
		if (!audio || !this._ready) {
			return;
		}

		const next = this._clampTime(time);
		try {
			if (Math.abs(audio.currentTime - next) > 0.001) {
				audio.currentTime = next;
			}
		} catch {
			// ignore
		}
	}

	_pauseInactive(activeAudio) {
		for (const audio of [this._audio, this._audioReversed]) {
			if (audio && audio !== activeAudio) {
				audio.pause();
			}
		}
	}

	/**
	 * Скорость progress (ед./с): измеренная + оценка spring progress → progressTarget.
	 */
	_estimateProgressSpeed(delta, progress, progressTarget) {
		let speed = delta > 1e-6 ? (progress - this._lastProgress) / delta : 0;
		const chaseGap = progressTarget - progress;

		if (Math.abs(speed) < 0.008 && Math.abs(chaseGap) > CHASE_GAP_EPS) {
			speed = chaseGap * CAROUSEL_PROGRESS_SMOOTH;
		}

		return { speed, chaseGap };
	}

	async _playScrub(direction, rate, progress) {
		const forward = direction >= 0;
		const audio = forward ? this._audio : this._audioReversed ?? this._audio;
		if (!audio) {
			return;
		}

		this._cancelFadeOut();
		this._setMasterGain(VOLUME);
		this._pauseInactive(audio);
		this._applySpatialPosition(progress);
		await this._resumeContext();

		const targetTime = progress * this._duration;
		const scrubTime = forward ? targetTime : this._clampTime((1 - progress) * this._duration);
		const drift = Math.abs(audio.currentTime - scrubTime);

		if (drift > HARD_SYNC_DRIFT_S || (audio.paused && drift > SOFT_SYNC_DRIFT_S) || !forward) {
			this._seekTo(audio, scrubTime);
		}

		const clampedRate = Math.max(MIN_PLAYBACK_RATE, Math.min(MAX_PLAYBACK_RATE, rate));

		if (!forward && audio === this._audio && this._reversePlaybackOk) {
			try {
				audio.playbackRate = -clampedRate;
			} catch {
				this._reversePlaybackOk = false;
				audio.playbackRate = clampedRate;
			}
		} else {
			audio.playbackRate = clampedRate;
		}

		if (audio.paused) {
			audio.play().catch(() => {});
		}
	}

	/**
	 * @param {number} delta
	 * @param {import('../three/render/transition/SceneCarousel.js').SceneCarousel} carousel
	 * @param {{ currentPage?: string, teleportPage?: string, routePhase?: string }} context
	 */
	update(delta, carousel, context = {}) {
		if (this._tickFadeOut(delta)) {
			this._lastProgress = carousel ? this._clampProgress(carousel.progress) : this._lastProgress;
			this._lastProgressTarget = carousel?.progressTarget ?? this._lastProgressTarget;
			return;
		}

		const currentPage = context.currentPage ?? "/";
		const teleportPage = context.teleportPage ?? currentPage;
		const routePhase = context.routePhase ?? "idle";
		const routeAnimating = routePhase === "exiting" || routePhase === "entering";
		const onCarouselRoute =
			isCarouselRoutePage(currentPage) || isCarouselRoutePage(teleportPage);
		const hexNavActive = carousel?.isHexNavigationActive?.() === true;

		if (!isPageSoundAllowed(true)) {
			this._stop(true, { immediate: true });
			return;
		}

		// Case page owns its SFX, but hex leave must keep playing while openedCase
		// stays true for HUD mosaic exit compositing.
		if (store.openedCase && !hexNavActive) {
			this._stop(true, { immediate: true });
			return;
		}

		if (!onCarouselRoute && !routeAnimating && !hexNavActive) {
			const isPlaying =
				(this._audio && !this._audio.paused) ||
				(this._audioReversed && !this._audioReversed.paused);

			if (isPlaying || this._fadeOut?.active) {
				this._beginFadeOut(() => this._stop(true, { immediate: true }));
			} else if (this._masterGain > 0.02) {
				this._beginFadeOut(() => this._stop(true, { immediate: true }));
			}
			return;
		}

		const audio = this._ensureAudio();
		if (!audio) {
			return;
		}

		if (!this._ready) {
			void this.preload();
			return;
		}

		const progress = this._clampProgress(carousel.progress);
		const progressTarget = carousel.progressTarget;
		const duration = this._duration;
		const targetTime = progress * duration;

		this._applySpatialPosition(progress);

		const segmentCommit =
			this._lastProgress >= CAROUSEL_PROGRESS_SEGMENT_END - 1e-4 && progress < 0.1;
		const progressJumpBack =
			!segmentCommit && this._lastProgress - progress > PROGRESS_JUMP_BACK_EPS;

		// syncFromPage / меню: progress сбросился посередине — не seek, плавно затухаем.
		if (progressJumpBack && (routeAnimating || !onCarouselRoute)) {
			this._beginFadeOut(() => {
				this._stop(true, { immediate: true });
			});
			this._lastProgress = progress;
			this._lastProgressTarget = progressTarget;
			return;
		}

		const { speed: progressPerSec, chaseGap } = this._estimateProgressSpeed(delta, progress, progressTarget);
		const chasing = Math.abs(chaseGap) > CHASE_GAP_EPS;
		const progressChanging = Math.abs(progress - this._lastProgress) > 1e-7;
		const targetMoving = Math.abs(progressTarget - this._lastProgressTarget) > 1e-6;
		const isAnimating =
			progressChanging ||
			chasing ||
			targetMoving ||
			Math.abs(progressPerSec) > MIN_ANIM_SPEED;

		const atRest =
			progress < AT_REST_EPS &&
			Math.abs(progressTarget) < AT_REST_EPS &&
			!chasing &&
			!targetMoving &&
			Math.abs(progressPerSec) < MIN_ANIM_SPEED;

		if (atRest) {
			const bothPaused =
				(!this._audio || this._audio.paused) &&
				(!this._audioReversed || this._audioReversed.paused);

			if (bothPaused && !this._fadeOut?.active) {
				this._lastProgress = progress;
				this._lastProgressTarget = progressTarget;
				return;
			}

			this._pauseAtRest();
			this._lastProgress = progress;
			this._lastProgressTarget = progressTarget;
			return;
		}

		if (!isAnimating) {
			this._cancelFadeOut();
			this._setMasterGain(VOLUME);
			this._pauseInactive(null);
			this._seekTo(this._audio, targetTime);
			if (this._audioReversed) {
				this._seekTo(this._audioReversed, this._clampTime((1 - progress) * duration));
			}
			this._lastProgress = progress;
			this._lastProgressTarget = progressTarget;
			return;
		}

		let direction = Math.sign(progressPerSec);
		if (direction === 0) {
			direction = Math.sign(chaseGap) || Math.sign(progress - this._lastProgress) || 1;
		}

		let rate = Math.abs(progressPerSec) * duration * VELOCITY_TO_RATE;
		if (rate < MIN_PLAYBACK_RATE) {
			rate = MIN_PLAYBACK_RATE;
		}

		void this._playScrub(direction, rate, progress);

		this._lastProgress = progress;
		this._lastProgressTarget = progressTarget;
	}

	_beginSiteMuteFade(durationMs) {
		this._beginFadeOut(() => this._stop(true, { immediate: true }), durationMs);
	}

	_cancelSiteMuteFade() {
		this._cancelFadeOut();
		this._setMasterGain(VOLUME);
	}

	dispose() {
		this._stop(true);
		if (this._audioReversed?.src?.startsWith("blob:")) {
			URL.revokeObjectURL(this._audioReversed.src);
		}
		this._audio = null;
		this._audioReversed = null;
		this._forwardPanner = null;
		this._reversePanner = null;
		this._forwardGain = null;
		this._reverseGain = null;
		this._loadPromise = null;
		this._ready = false;
		this._ctx = null;
	}

	_suspendForPageHidden() {
		this._pauseInactive(null);
		suspendMasterAudioContext();
	}

	_resumeForPageHidden() {
		if (!isSoundAudible()) {
			return;
		}
		void resumeMasterAudioContext();
	}
}

export const hexTransitionSound = new HexTransitionSoundController();

export function preloadHexTransitionSound() {
	return hexTransitionSound.preload();
}

export function updateHexTransitionSound(delta, carousel, context) {
	hexTransitionSound.update(delta, carousel, context);
}

export function disposeHexTransitionSound() {
	hexTransitionSound.dispose();
}

registerPageVisibilitySoundHandlers({
	suspend: () => hexTransitionSound._suspendForPageHidden(),
	resume: () => hexTransitionSound._resumeForPageHidden(),
});

registerSiteSoundMuteHandler({
	onFadeStart: (_generation, durationMs) => {
		hexTransitionSound._beginSiteMuteFade(durationMs);
	},
	onFadeCancel: () => {
		hexTransitionSound._cancelSiteMuteFade();
	},
	onMuteComplete: () => {
		hexTransitionSound._stop(true, { immediate: true });
	},
});
