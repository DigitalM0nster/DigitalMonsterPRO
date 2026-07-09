import { store } from "../store.jsx";

/** Плавное затухание всех звуков сразу после нажатия «выкл» (мс). */
export const SITE_SOUND_MUTE_FADE_MS = 1000;

/** @type {Set<{ onFadeStart?: (generation: number, durationMs: number) => void, onFadeCancel?: (generation: number) => void, onMuteComplete?: (generation: number) => void }>} */
const muteHandlers = new Set();

let muteGeneration = 0;
let muteFadeActive = false;
/** @type {ReturnType<typeof setTimeout> | null} */
let muteFadeCompleteTimer = null;

/** Звук ещё должен играть (вкл или идёт змейка/затухание после «выкл»). */
export function isSoundAudible() {
	return Boolean(store.soundsActive || store.soundsPlaybackHeld);
}

export function isSiteSoundMuteFading() {
	return muteFadeActive;
}

/** Подписка на фазы отложенного mute (фон, hex, soundDesign и т.д.). */
export function registerSiteSoundMuteHandler(handler) {
	if (!handler) {
		return () => {};
	}

	muteHandlers.add(handler);
	return () => muteHandlers.delete(handler);
}

function clearMuteFadeTimer() {
	if (muteFadeCompleteTimer) {
		clearTimeout(muteFadeCompleteTimer);
		muteFadeCompleteTimer = null;
	}
}

function dispatchMuteFadeStart(generation, durationMs) {
	for (const handler of muteHandlers) {
		try {
			handler.onFadeStart?.(generation, durationMs);
		} catch {
			// ignore
		}
	}
}

function dispatchMuteFadeCancel(generation) {
	for (const handler of muteHandlers) {
		try {
			handler.onFadeCancel?.(generation);
		} catch {
			// ignore
		}
	}
}

function dispatchMuteComplete(generation) {
	for (const handler of muteHandlers) {
		try {
			handler.onMuteComplete?.(generation);
		} catch {
			// ignore
		}
	}
}

function completeSiteSoundMute() {
	muteFadeActive = false;
	store.soundsPlaybackHeld = false;
	dispatchMuteComplete(muteGeneration);
}

function beginMuteFadeOut() {
	if (!store.soundsPlaybackHeld || store.soundsActive || muteFadeActive) {
		return;
	}

	const generation = muteGeneration;
	muteFadeActive = true;
	dispatchMuteFadeStart(generation, SITE_SOUND_MUTE_FADE_MS);

	clearMuteFadeTimer();
	muteFadeCompleteTimer = setTimeout(() => {
		if (generation !== muteGeneration) {
			return;
		}
		completeSiteSoundMute();
	}, SITE_SOUND_MUTE_FADE_MS);
}

/** Отмена отложенного mute (повторное «вкл» во время змейки или fade). */
export function cancelPendingSiteSoundMute({ restorePlayback = true } = {}) {
	muteGeneration += 1;
	clearMuteFadeTimer();

	const wasFading = muteFadeActive;
	muteFadeActive = false;
	store.soundsPlaybackHeld = false;

	if (restorePlayback && wasFading) {
		dispatchMuteFadeCancel(muteGeneration);
	}
}

/** Пользователь нажал «выкл»: UI off, fade звука сразу (змейка идёт параллельно). */
export function requestSiteSoundMute() {
	muteGeneration += 1;
	clearMuteFadeTimer();
	muteFadeActive = false;
	store.soundsActive = false;
	store.soundsPlaybackHeld = true;
	beginMuteFadeOut();
}

function enableSiteSound() {
	cancelPendingSiteSoundMute({ restorePlayback: true });
	store.soundsActive = true;
}

/** Единая точка переключения звука (HUD, legacy SoundComponent). */
export function toggleSiteSound() {
	if (store.soundsActive) {
		requestSiteSoundMute();
		return;
	}

	enableSiteSound();
}

/**
 * Змейка статуса дошла до «выкл» — fallback, если fade ещё не стартовал.
 * @param {"on" | "off"} settledKey
 */
export function notifySoundStatusSnakeSettled(settledKey) {
	if (settledKey !== "off") {
		return;
	}

	if (store.soundsActive || !store.soundsPlaybackHeld || muteFadeActive) {
		return;
	}

	beginMuteFadeOut();
}

/** Плавное затухание Three.js PositionalAudio (фон, teleport). */
export function fadeThreePositionalAudioVolume(audio, targetVolume, durationMs, generation) {
	if (!audio || durationMs <= 0) {
		return;
	}

	const startVolume = typeof audio.getVolume === "function" ? audio.getVolume() : 1;
	const startedAt = performance.now();

	const tick = () => {
		if (generation !== muteGeneration) {
			return;
		}

		const progress = Math.min(1, (performance.now() - startedAt) / durationMs);
		const nextVolume = startVolume + (targetVolume - startVolume) * progress;
		audio.setVolume(Math.max(0, nextVolume));

		if (progress < 1) {
			requestAnimationFrame(tick);
		}
	};

	requestAnimationFrame(tick);
}
