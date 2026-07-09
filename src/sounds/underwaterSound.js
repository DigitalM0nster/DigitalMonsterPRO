import * as THREE from "three";
import { store } from "../store.jsx";
import { isPageSoundAllowed, registerPageVisibilitySoundHandlers } from "./pageVisibilitySound.js";
import { isSoundAudible, registerSiteSoundMuteHandler } from "./siteSoundToggle.js";
import { connectNodeToMasterBus, getMasterAudioContext, resumeMasterAudioContext, suspendMasterAudioContext } from "./masterAudioBus.js";
import { isCarouselRoutePage } from "../three/render/transition/SceneCarousel.js";

export const UNDERWATER_SOUND_SRC = "/audio/underwater.mp3";

/** Базовая громкость, когда кит близко (proximity = 1). */
const MASTER_VOLUME = 0.15;
/**
 * Минимальная доля proximity-громкости на intro (кит далеко).
 * 0.08 ≈ «слабо слышно», не полная тишина.
 */
const FAR_VOLUME_FLOOR = 0.08;
/**
 * Дистанция камера↔кит (ед. сцены), подогнано под hero:
 * intro whaleIntro + камера p≈0 → ~79 (тихо);
 * whale pos после enter + скролл вниз → ~33 (громче всего).
 */
const WHALE_DISTANCE_NEAR = 33;
const WHALE_DISTANCE_FAR = 79;
/** Плавность gain (1/с); выше — быстрее догоняет расстояние при enter. */
const GAIN_SMOOTH = 11;
const FADE_OUT_STOP_EPS = 0.015;
/** Макс. смещение L/R для ambient (0 = центр, 1 = только одно ухо). */
const MAX_STEREO_PAN = 0.22;
/** Мировые единицы бокового смещения кита → полный pan. */
const PAN_LATERAL_SPREAD = 28;

const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _toWhale = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/**
 * Насколько audible home-сцена в карусели (0…1).
 * @param {import("../three/render/transition/SceneCarousel.js").SceneCarousel} carousel
 * @param {number} mixProgress
 */
export function resolveHomeSceneSoundWeight(carousel, mixProgress) {
	const p = THREE.MathUtils.clamp(mixProgress, 0, 1);
	const { sourceId, targetId } = carousel.getMixSourceTargetIds();

	if (sourceId === targetId) {
		return sourceId === "home" ? 1 : 0;
	}

	if (sourceId === "home") {
		return 1 - p;
	}

	if (targetId === "home") {
		return p;
	}

	return 0;
}

/**
 * 0…1 — насколько «близко» звучит кит (расстояние камера↔кит, не mute).
 * @param {number} distance
 */
export function resolveWhaleProximityGain(distance) {
	const proximity = 1 - THREE.MathUtils.smoothstep(WHALE_DISTANCE_NEAR, WHALE_DISTANCE_FAR, distance);
	return FAR_VOLUME_FLOOR + proximity * (1 - FAR_VOLUME_FLOOR);
}

/**
 * Мягкий L/R от положения кита относительно камеры (−1…1, обычно в пределах ±MAX_STEREO_PAN).
 * @param {{ whaleWorld: THREE.Vector3, cameraWorld: THREE.Vector3, lookAtWorld: THREE.Vector3 }} snapshot
 */
export function resolveWhaleStereoPan(snapshot) {
	const cam = snapshot.cameraWorld;
	const look = snapshot.lookAtWorld;
	const whale = snapshot.whaleWorld;

	_forward.subVectors(look, cam);
	if (_forward.lengthSq() < 1e-8) {
		_forward.set(0, 0, -1);
	} else {
		_forward.normalize();
	}

	_right.crossVectors(_forward, _up);
	if (_right.lengthSq() < 1e-8) {
		return 0;
	}
	_right.normalize();

	_toWhale.subVectors(whale, cam);
	const lateral = _toWhale.dot(_right);
	const normalized = lateral / PAN_LATERAL_SPREAD;

	return THREE.MathUtils.clamp(normalized, -MAX_STEREO_PAN, MAX_STEREO_PAN);
}

class UnderwaterSoundController {
	constructor() {
		/** @type {HTMLAudioElement | null} */
		this._audio = null;
		/** @type {GainNode | null} */
		this._gain = null;
		/** @type {StereoPannerNode | null} */
		this._stereoPanner = null;
		/** @type {Promise<void> | null} */
		this._loadPromise = null;
		this._ready = false;
		this._playing = false;
		this._smoothedGain = 0;
		/** @type {{ active: boolean, durationMs: number, remainingMs: number, startGain: number, onComplete?: () => void } | null} */
		this._siteMuteFade = null;
	}

	_getAudioContext() {
		return getMasterAudioContext();
	}

	_connectMediaElement(audio) {
		const ctx = this._getAudioContext();
		if (!ctx || !audio) {
			return null;
		}

		audio.loop = true;
		audio.volume = 1;

		const source = ctx.createMediaElementSource(audio);
		const gain = ctx.createGain();
		const stereoPanner = ctx.createStereoPanner();
		stereoPanner.pan.value = 0;
		gain.gain.value = 0;

		source.connect(gain);
		gain.connect(stereoPanner);
		connectNodeToMasterBus(stereoPanner);

		this._gain = gain;
		this._stereoPanner = stereoPanner;

		return stereoPanner;
	}

	_ensureAudio() {
		if (this._audio || typeof window === "undefined") {
			return this._audio;
		}

		const audio = new Audio(UNDERWATER_SOUND_SRC);
		audio.preload = "auto";
		this._audio = audio;
		this._connectMediaElement(audio);

		this._loadPromise = new Promise((resolve) => {
			const onReady = () => {
				this._ready = Number.isFinite(audio.duration) && audio.duration > 0.05;
				resolve();
			};

			audio.addEventListener("loadedmetadata", onReady, { once: true });
			audio.addEventListener("error", () => resolve(), { once: true });
		});

		return audio;
	}

	async _resumeContext() {
		await resumeMasterAudioContext();
	}

	preload() {
		this._ensureAudio();
		return this._loadPromise ?? Promise.resolve();
	}

	_setStereoPan(pan) {
		if (this._stereoPanner) {
			this._stereoPanner.pan.value = pan;
		}
	}

	async _ensurePlaying() {
		const audio = this._audio;
		if (!audio || this._playing) {
			return;
		}

		await this._resumeContext();

		try {
			await audio.play();
			this._playing = true;
		} catch {
			this._playing = false;
		}
	}

	_pause(reset = false) {
		const audio = this._audio;
		if (!audio) {
			return;
		}

		audio.pause();
		this._playing = false;

		if (reset) {
			try {
				audio.currentTime = 0;
			} catch {
				// ignore
			}
			this._smoothedGain = 0;
			if (this._gain) {
				this._gain.gain.value = 0;
			}
		}
	}

	/**
	 * @param {number} delta
	 * @param {{
	 *   currentPage?: string,
	 *   routePhase?: string,
	 *   homeScene?: { getWhaleSoundSnapshot?: () => object | null } | null,
	 *   carousel?: import("../three/render/transition/SceneCarousel.js").SceneCarousel,
	 *   mixProgress?: number,
	 * }} context
	 */
	update(delta, context = {}) {
		if (this._tickSiteMuteFade(delta)) {
			return;
		}

		const currentPage = context.currentPage ?? "/";
		const routePhase = context.routePhase ?? "idle";
		const carousel = context.carousel;
		const homeScene = context.homeScene;

		if (!isPageSoundAllowed(true) || store.openedCase || !isCarouselRoutePage(currentPage) || !carousel || !homeScene?.getWhaleSoundSnapshot) {
			this._pause(true);
			return;
		}

		const mixProgress = context.mixProgress ?? carousel.getMixProgress();
		let activity = resolveHomeSceneSoundWeight(carousel, mixProgress);

		// Уход с главной через роут (меню / teleport) — затухаем вместе со сценой.
		if (routePhase === "exiting" && (currentPage === "/" || currentPage === "")) {
			activity = 0;
		}

		if (activity <= 0.0001) {
			this._fadeToward(0, delta);
			if (this._smoothedGain <= FADE_OUT_STOP_EPS) {
				this._pause(true);
			}
			return;
		}

		const snapshot = homeScene.getWhaleSoundSnapshot();
		if (!snapshot) {
			this._fadeToward(0, delta);
			return;
		}

		this._ensureAudio();
		if (!this._ready) {
			void this.preload();
			return;
		}

		const proximityGain = resolveWhaleProximityGain(snapshot.distance);
		const targetGain = activity * proximityGain * MASTER_VOLUME;

		this._setStereoPan(resolveWhaleStereoPan(snapshot));
		this._fadeToward(targetGain, delta);

		if (this._smoothedGain > FADE_OUT_STOP_EPS) {
			void this._ensurePlaying();
		}
	}

	_beginSiteMuteFade(durationMs, onComplete) {
		const startGain = Math.max(this._smoothedGain, this._gain?.gain.value ?? 0);
		this._siteMuteFade = {
			active: true,
			durationMs,
			remainingMs: durationMs,
			startGain,
			onComplete,
		};
	}

	_cancelSiteMuteFade() {
		this._siteMuteFade = null;
	}

	_tickSiteMuteFade(delta) {
		const fade = this._siteMuteFade;
		if (!fade?.active) {
			return false;
		}

		fade.remainingMs -= delta * 1000;
		const elapsed = fade.durationMs - Math.max(0, fade.remainingMs);
		const linear = Math.min(1, elapsed / fade.durationMs);
		this._smoothedGain = fade.startGain * (1 - linear);

		if (this._gain) {
			this._gain.gain.value = Math.max(0, this._smoothedGain);
		}

		if (fade.remainingMs <= 0) {
			this._siteMuteFade = null;
			this._pause(true);
			fade.onComplete?.();
		}

		return true;
	}

	_fadeToward(targetGain, delta) {
		const dt = Number.isFinite(delta) && delta > 0 ? delta : 1 / 60;
		const t = 1 - Math.exp(-GAIN_SMOOTH * dt);
		this._smoothedGain += (targetGain - this._smoothedGain) * t;

		if (this._gain) {
			this._gain.gain.value = Math.max(0, this._smoothedGain);
		}
	}

	dispose() {
		this._pause(true);
		this._audio = null;
		this._gain = null;
		this._stereoPanner = null;
		this._loadPromise = null;
		this._ready = false;
	}

	_suspendForPageHidden() {
		this._pause(false);
		suspendMasterAudioContext();
	}

	_resumeForPageHidden() {
		if (!isSoundAudible()) {
			return;
		}
		void resumeMasterAudioContext();
	}
}

export const underwaterSound = new UnderwaterSoundController();

export function preloadUnderwaterSound() {
	return underwaterSound.preload();
}

export function updateUnderwaterSound(delta, context) {
	underwaterSound.update(delta, context);
}

export function disposeUnderwaterSound() {
	underwaterSound.dispose();
}

registerPageVisibilitySoundHandlers({
	suspend: () => underwaterSound._suspendForPageHidden(),
	resume: () => underwaterSound._resumeForPageHidden(),
});

registerSiteSoundMuteHandler({
	onFadeStart: (_generation, durationMs) => {
		underwaterSound._beginSiteMuteFade(durationMs);
	},
	onFadeCancel: () => {
		underwaterSound._cancelSiteMuteFade();
	},
	onMuteComplete: () => {
		underwaterSound._pause(true);
	},
});
