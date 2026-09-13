import { store } from "@/app/store.jsx";
import { isMobileGraphicsDevice } from "@/functions/getGraphicsTier.js";
import { isPageSoundAllowed, registerPageVisibilitySoundHandlers } from "./pageVisibilitySound.js";
import { isSoundAudible, registerSiteSoundMuteHandler } from "./siteSoundToggle.js";
import {
	connectNodeToMasterBus,
	getMasterAudioContext,
	resumeMasterAudioContext,
	suspendMasterAudioContext,
} from "./masterAudioBus.js";
import { loadAudioBuffer } from "./audioAssetCache.js";
import { HexScrubVoice } from "./hexScrubVoice.js";
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
const PLAYBACK_RATE_EPS = 0.001;
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
 * Вертикальная панорама (Web Audio HRTF): progress 0 — сверху, 0.5 — центр, 1 — снизу
 * (как фронт hex-wipe: при P≈0 край у верха экрана, при P≈1 — у низа).
 * Диапазон по оси Y в «метрах» сцены слушателя.
 */
const SPATIAL_Y_EXTENT = 3.2;
/** Z: источник перед слушателем (не сзади головы). */
const SPATIAL_Z = -0.85;

/**
 * progress 0…1 → Y: верх → центр → низ.
 * O(1) AudioParam write — без лишней CPU/GPU нагрузки.
 * @param {number} progress
 */
export function progressToSpatialY(progress) {
	const clamped = Math.max(0, Math.min(1, progress));
	return (0.5 - clamped) * 2 * SPATIAL_Y_EXTENT;
}

class HexTransitionSoundController {
	constructor() {
		/** @type {HexScrubVoice | null} */
		this._audio = null;
		/** @type {HexScrubVoice | null} */
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
		this._loadGeneration = 0;
		this._ready = false;
		this._duration = 0;
		this._reverseDuration = 0;
		this._lastProgress = 0;
		this._lastProgressTarget = 0;
		this._reversePlaybackOk = true;
		this._baseVolume = VOLUME / (isMobileGraphicsDevice() ? 3 : 1);
		this._masterGain = this._baseVolume;
		/** @type {{ active: boolean, onComplete?: () => void } | null} */
		this._fadeOut = null;
		this._listenerOrientReady = false;
		this._spatialY = NaN;
		this._resumePending = false;
		this._pendingPlay = new WeakMap();
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
		const y = Number.isFinite(this._spatialY) ? this._spatialY : progressToSpatialY(0);
		if (typeof panner.positionX !== "undefined") {
			panner.positionX.value = 0;
			panner.positionY.value = y;
			panner.positionZ.value = SPATIAL_Z;
		} else {
			panner.setPosition(0, y, SPATIAL_Z);
		}
	}

	_ensureListenerOrientation(ctx) {
		const listener = ctx?.listener;
		if (!listener || this._listenerOrientReady) {
			return;
		}
		// Default look: −Z, up: +Y — explicit so vertical pan matches screen top/bottom.
		if (typeof listener.forwardX !== "undefined") {
			listener.forwardX.value = 0;
			listener.forwardY.value = 0;
			listener.forwardZ.value = -1;
			listener.upX.value = 0;
			listener.upY.value = 1;
			listener.upZ.value = 0;
		} else if (typeof listener.setOrientation === "function") {
			listener.setOrientation(0, 0, -1, 0, 1, 0);
		}
		this._listenerOrientReady = true;
	}

	_createPreparedVoice(buffer, gainRef, pannerRef) {
		const ctx = this._getAudioContext();
		this._ensureListenerOrientation(ctx);
		const gain = ctx.createGain();
		const panner = ctx.createPanner();
		this._configurePanner(panner);
		gain.gain.value = this._masterGain;
		gain.connect(panner);
		connectNodeToMasterBus(panner);
		this._ctx = ctx;
		this[gainRef] = gain;
		this[pannerRef] = panner;
		return new HexScrubVoice(ctx, buffer, gain);
	}

	_setMasterGain(value) {
		const next = Math.max(0, value);
		if (this._masterGain === next) return;
		this._masterGain = next;
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
		if (y === this._spatialY) return;
		this._spatialY = y;

		for (const panner of [this._forwardPanner, this._reversePanner]) {
			if (!panner) {
				continue;
			}

			if (typeof panner.positionX !== "undefined") {
				panner.positionY.value = y;
			} else {
				panner.setPosition(0, y, SPATIAL_Z);
			}
		}
	}

	async _resumeContext() {
		await resumeMasterAudioContext();
	}

	_ensureAudio() {
		if (this._audio || typeof window === "undefined") return this._audio;
		if (!this._loadPromise) {
			const generation = ++this._loadGeneration;
			this._loadPromise = this._loadPreparedBuffers(generation);
		}
		return this._audio;
	}

	async _loadPreparedBuffers(generation) {
		const ctx = this._getAudioContext();
		if (!ctx) return;
		try {
			// Decode is allowed while suspended. Start/visibility owns audio resume;
			// waiting for it here would block the preloader before a user gesture.
			const buffer = await loadAudioBuffer(HEX_TRANSITION_SOUND_SRC, ctx);
			if (generation !== this._loadGeneration || buffer.duration <= 0.05) return;
			const reversed = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
			for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
				const src = buffer.getChannelData(channel);
				const dst = reversed.getChannelData(channel);
				for (let i = 0, j = src.length - 1; i < src.length; i++, j--) dst[i] = src[j];
			}
			this._duration = buffer.duration;
			this._reverseDuration = reversed.duration;
			this._audio = this._createPreparedVoice(buffer, "_forwardGain", "_forwardPanner");
			this._audioReversed = this._createPreparedVoice(reversed, "_reverseGain", "_reversePanner");
			this._ready = true;
		} catch {
			// An unavailable optional SFX must not block the visual experience.
			this._ready = false;
		}
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
			if (!audio.paused || this._pendingPlay.has(audio)) audio.pause();
			this._pendingPlay.delete(audio);
			if (reset) {
				try {
					if (audio.currentTime !== 0) audio.currentTime = 0;
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

		this._setMasterGain(this._baseVolume);
	}

	_pauseAtRest() {
		if (this._fadeOut?.active) {
			return;
		}

		this._beginFadeOut(() => {
			this._pauseInactive(null);
			this._setMasterGain(this._baseVolume);
		}, AT_REST_FADE_MS);
	}

	_clampProgress(progress) {
		// Backward leave uses negative progress; mix / audio scrub on |progress|.
		return Math.max(0, Math.min(1, Math.abs(progress)));
	}

	_clampTime(seconds, duration = this._duration) {
		if (!Number.isFinite(seconds) || duration <= 0) {
			return 0;
		}
		return Math.max(0, Math.min(duration * 0.998, seconds));
	}

	_getTrackDuration(audio) {
		if (Number.isFinite(audio?.duration) && audio.duration > 0) return audio.duration;
		return audio === this._audioReversed && this._reverseDuration > 0
			? this._reverseDuration
			: this._duration;
	}

	_seekTo(audio, time) {
		if (!audio || !this._ready) {
			return;
		}

		const duration = this._getTrackDuration(audio);
		const next = this._clampTime(time, duration);
		if (duration - next <= SOFT_SYNC_DRIFT_S && duration - audio.currentTime <= SOFT_SYNC_DRIFT_S) return;
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
				if (!audio.paused || this._pendingPlay.has(audio)) audio.pause();
				this._pendingPlay.delete(audio);
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

	_playScrub(direction, rate, progress) {
		if (this._ctx?.state === "suspended" || this._ctx?.state === "interrupted") {
			if (!this._resumePending) {
				this._resumePending = true;
				void this._resumeContext().finally(() => { this._resumePending = false; });
			}
			// The next painted frame may start playback; a late resume must not
			// replay an old scrub after motion, mute or page visibility changed.
			return;
		}
		const forward = direction >= 0;
		const audio = forward ? this._audio : this._audioReversed ?? this._audio;
		if (!audio) {
			return;
		}

		this._cancelFadeOut();
		this._setMasterGain(this._baseVolume);
		this._pauseInactive(audio);
		this._applySpatialPosition(progress);
		if (this._pendingPlay.has(audio)) return;

		// Both tracks use their decoded PCM duration.
		const duration = this._getTrackDuration(audio);
		const targetTime = (forward ? progress : 1 - progress) * duration;
		const scrubTime = this._clampTime(targetTime, duration);
		// Let the last few
		// milliseconds finish once instead of looping them as the spring settles.
		// The actual playhead remains stable across held-frame seeks.
		if (duration - scrubTime <= SOFT_SYNC_DRIFT_S && duration - audio.currentTime <= SOFT_SYNC_DRIFT_S) return;
		const drift = Math.abs(audio.currentTime - scrubTime);

		if (drift > HARD_SYNC_DRIFT_S || (audio.paused && drift > SOFT_SYNC_DRIFT_S)) {
			this._seekTo(audio, scrubTime);
		}

		const trackRate = this._duration > 0 ? rate * duration / this._duration : rate;
		const clampedRate = Math.max(MIN_PLAYBACK_RATE, Math.min(MAX_PLAYBACK_RATE, trackRate));

		if (!forward && audio === this._audio && this._reversePlaybackOk) {
			try {
				if (Math.abs(audio.playbackRate + clampedRate) > PLAYBACK_RATE_EPS) audio.playbackRate = -clampedRate;
			} catch {
				this._reversePlaybackOk = false;
				if (Math.abs(audio.playbackRate - clampedRate) > PLAYBACK_RATE_EPS) audio.playbackRate = clampedRate;
			}
		} else {
			if (Math.abs(audio.playbackRate - clampedRate) > PLAYBACK_RATE_EPS) audio.playbackRate = clampedRate;
		}

		if (audio.paused) {
			const request = audio.play();
			this._pendingPlay.set(audio, request);
			void request.catch(() => {}).finally(() => {
				if (this._pendingPlay.get(audio) === request) this._pendingPlay.delete(audio);
			});
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
		const caseScrollMix = carousel?.isCaseBoundaryDrive?.() === true;
		const hexMixActive = hexNavActive || caseScrollMix;

		if (!isPageSoundAllowed(true)) {
			this._stop(true, { immediate: true });
			return;
		}

		// Case page owns its SFX, but hex leave / case-boundary scroll mix must keep
		// playing while openedCase stays true.
		if (store.openedCase && !hexMixActive) {
			this._stop(true, { immediate: true });
			return;
		}

		if (!onCarouselRoute && !routeAnimating && !hexMixActive) {
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
			this._setMasterGain(this._baseVolume);
			this._pauseInactive(null);
			this._seekTo(this._audio, targetTime);
			if (this._audioReversed) {
				this._seekTo(this._audioReversed, (1 - progress) * this._getTrackDuration(this._audioReversed));
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
		this._setMasterGain(this._baseVolume);
	}

	dispose() {
		this._stop(true);
		this._loadGeneration++;
		this._audio?.dispose();
		this._audioReversed?.dispose();
		for (const node of [this._forwardGain, this._reverseGain, this._forwardPanner, this._reversePanner]) node?.disconnect();
		this._audio = null;
		this._audioReversed = null;
		this._forwardPanner = null;
		this._reversePanner = null;
		this._forwardGain = null;
		this._reverseGain = null;
		this._loadPromise = null;
		this._ready = false;
		this._reverseDuration = 0;
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
