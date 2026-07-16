import { portfolioHubPlatesConfig } from "../three/scenes/portfolio/hub/portfolioHubConfig.js";
import { isPageSoundAllowed, registerPageVisibilitySoundHandlers } from "./pageVisibilitySound.js";
import { isSoundAudible, registerSiteSoundMuteHandler } from "./siteSoundToggle.js";
import {
	bindMediaElementToMasterBus,
	connectGainWithPanToMasterBus,
	connectGainWithSpatialToMasterBus,
	getMasterAudioContext,
	initMasterAudioBus,
	resumeMasterAudioContext,
	suspendMasterAudioContext,
} from "./masterAudioBus.js";
import clickSoundUrl from "./clickSound.mp3";

/** Каталог звуков саунддизайна — пути в public/audio. */
export const SOUND_CATALOG = {
	logo_reveal: "/audio/logo_reveal.mp3",
	/** Digital-звук под глитч текста (~2s), обрезается под длительность змейки. */
	digital_sound: "/audio/digital_sound.mp3",
	/** Выезд/уезд карточки проекта в хабе (plateSlideDuration, 0.9 с). */
	card_movement: "/audio/card_movement.mp3",
	/** Уход с роута /portfolio (hub → кейс или на другую страницу). */
	portfolio_leave: "/audio/portfolio_leave_transition.mp3",
	/** Заход на /portfolio — под длительность gridEnter (2 с). */
	portfolio_enter: "/audio/1/transition_riser.wav",
	/** Короткий beep при hover пункта левого меню. */
	beep: "/audio/beep.mp3",
	/** Hex-переход карусели — scrub по progress (отдельный контроллер). */
	hex_transition1: "/audio/hexTransition1.mp3",
	/** Ambient под водой на главной — loop + spatial (отдельный контроллер). */
	underwater: "/audio/underwater.mp3",
	/** Glitch-импульс кнопки «Подробнее» на плитке. */
	glitch_button: "/audio/glitch_button.mp3",
};

/** Громкость glitch_button при hover на активной плитке (0…1). */
export const HUB_PLATE_HOVER_GLITCH_GAIN = 0.32;

/** Длительность затухания logo_reveal при паузе анимации (с). */
export const LOGO_REVEAL_FADE_OUT_S = 0.05;

/** Затухание digital_sound в конце глитча (с). */
export const DIGITAL_SOUND_FADE_OUT_S = 0.1;

/** Затухание portfolio_enter в конце появления сетки (с). */
export const PORTFOLIO_ENTER_FADE_OUT_S = 0.1;

/** Затухание card_movement в конце сдвига карточки (с). */
export const CARD_MOVEMENT_FADE_OUT_S = 0.1;

/** Длина файла digital_sound — верхняя граница воспроизведения (с). */
export const DIGITAL_SOUND_FILE_S = 2;

/** Один digital_sound — новый заменяет предыдущий. */
export const MAX_GLITCH_TEXT_SOUNDS = 1;

/** Минимум между звуками при hover по меню (мс). */
export const HOVER_GLITCH_SOUND_COOLDOWN_MS = 180;

/** Как быстро гасим звук, если пришёл новый (мс). */
export const GLITCH_SOUND_REPLACE_FADE_MS = 50;

/**
 * Стереопанорама только на /portfolio (см. setPortfolioSpatialAudio).
 * -1 = левое ухо, +1 = правое.
 */
export const PORTFOLIO_SOUND_PAN = {
	digital_sound: 0.3,
	logo_reveal: -0.35,
};

/** Панорама звуков левого меню (-1 = полностью слева). */
export const LEFT_MENU_SOUND_PAN = -0.7;

/** Левое меню — digital_sound с левого канала. */
export const LEFT_MENU_GLITCH_SOUND_PAN = LEFT_MENU_SOUND_PAN;

/** Правая scroll-навигация — зеркальная панорама glitch-звука меню. */
export const RIGHT_NAV_GLITCH_SOUND_PAN = 0.7;

/** Верхний route HUD — немного левее центра. */
export const TOP_HUD_GLITCH_SOUND_PAN = -0.2;

/** Beep при hover — тот же левый канал, что и змейка подписи. */
export const LEFT_MENU_BEEP_SOUND_PAN = LEFT_MENU_SOUND_PAN;

/** Stereo positions for case-study UI sounds. */
export const CASE_STUDY_LEFT_SOUND_PAN = -0.65;
export const CASE_STUDY_RIGHT_SOUND_PAN = 0.65;

/** Громкость digital_sound в левом меню (портфолио / route = 1). */
export const LEFT_MENU_GLITCH_SOUND_GAIN = 0.6;

/** Минимум между beep при hover по пунктам левого меню (мс). */
export const LEFT_MENU_BEEP_COOLDOWN_MS = 10;

let portfolioSpatialAudioActive = false;
let lastLeftMenuBeepAt = 0;

/** Вкл/выкл панораму саунддизайна портфолио (PortfolioPage mount/unmount). */
export function setPortfolioSpatialAudio(active) {
	portfolioSpatialAudioActive = Boolean(active);
}

/** @type {Map<string, { source: AudioBufferSourceNode, gain: GainNode, panner: StereoPannerNode | null, fadeFrameId: number | null }>} */
const activePlayback = new Map();

/** @type {Map<string, Promise<ArrayBuffer>>} */
const audioDataPromises = new Map();

/** @type {Map<string, Promise<AudioBuffer>>} */
const bufferLoadPromises = new Map();
/**
 * @type {Array<{
 *   id: number,
 *   instance: { source: AudioBufferSourceNode, gain: GainNode, panner: StereoPannerNode | null, stopTimer: ReturnType<typeof setTimeout> | null, disposed: boolean } | null,
 *   cancelled: boolean,
 *   plannedEndAt: number,
 *   durationMs: number,
 * }>}
 */
const activeGlitchSounds = [];
let glitchSoundSlotId = 0;
let lastHoverGlitchSoundAt = 0;
/** @type {{ instance: object | null, cancelled: boolean } | null} */
let portfolioEnterSoundSlot = null;
/** @type {{ instance: object | null, cancelled: boolean } | null} */
let cardMovementSoundSlot = null;

/** @typedef {'hover' | 'route' | 'menu'} GlitchTextSoundIntent */

function getActiveGlitchSlot() {
	return activeGlitchSounds.find((slot) => !slot.cancelled) ?? null;
}

function getAudioContext() {
	return getMasterAudioContext();
}

function connectWithPan(ctx, gainNode, pan) {
	return connectGainWithPanToMasterBus(ctx, gainNode, pan);
}

function fetchAudioData(src) {
	if (!audioDataPromises.has(src)) {
		const promise = fetch(src)
			.then((response) => {
				if (!response.ok) {
					throw new Error(`[soundDesign] Failed to load ${src}`);
				}
				return response.arrayBuffer();
			})
			.catch((error) => {
				audioDataPromises.delete(src);
				throw error;
			});
		audioDataPromises.set(src, promise);
	}
	return audioDataPromises.get(src);
}

function loadAudioBuffer(src) {
	if (!bufferLoadPromises.has(src)) {
		const promise = fetchAudioData(src)
			.then((arrayBuffer) => {
				const ctx = getAudioContext();
				if (!ctx) {
					throw new Error("[soundDesign] AudioContext unavailable");
				}
				return ctx.decodeAudioData(arrayBuffer.slice(0));
			})
			.catch((error) => {
				bufferLoadPromises.delete(src);
				throw error;
			});
		bufferLoadPromises.set(src, promise);
	}
	return bufferLoadPromises.get(src);
}

/** Сетевой этап до user gesture: скачивает звук, не создавая AudioContext и не запуская decode. */
export function prefetchSoundDesign() {
	if (typeof window === "undefined") {
		return Promise.resolve([]);
	}
	return Promise.allSettled(Object.values(SOUND_CATALOG).map((src) => fetchAudioData(src)));
}

/** Предзагрузка буферов — меньше задержка на первом глитче. */
export function preloadSoundDesign() {
	if (typeof window === "undefined") {
		return;
	}
	initMasterAudioBus();
	const ctx = getAudioContext();
	ctx?.resume?.().catch(() => {});
	for (const src of Object.values(SOUND_CATALOG)) {
		loadAudioBuffer(src).catch(() => {});
	}
	void import("./hexTransitionSound.js").then((m) => m.preloadHexTransitionSound());
	void import("./underwaterSound.js").then((m) => m.preloadUnderwaterSound());
}

function getSoundPan(soundId, panOverride) {
	if (panOverride !== undefined) {
		return panOverride;
	}
	if (!portfolioSpatialAudioActive) {
		return 0;
	}
	return PORTFOLIO_SOUND_PAN[soundId] ?? 0;
}

function disposeWebAudioNodes(nodes) {
	try {
		nodes.source?.stop();
	} catch {
		// уже остановлен
	}
	nodes.source?.disconnect();
	nodes.gain?.disconnect();
	nodes.panner?.disconnect();
}

function cancelFade(soundId) {
	const entry = activePlayback.get(soundId);
	if (!entry?.fadeFrameId) {
		return;
	}
	cancelAnimationFrame(entry.fadeFrameId);
	entry.fadeFrameId = null;
}

function disposeGlitchInstance(instance) {
	if (instance.disposed) {
		return;
	}
	instance.disposed = true;

	if (instance.stopTimer) {
		clearTimeout(instance.stopTimer);
		instance.stopTimer = null;
	}
	try {
		instance.source?.stop();
	} catch {
		// уже остановлен
	}
	disposeWebAudioNodes(instance);
}

function removeGlitchSlot(slot) {
	const index = activeGlitchSounds.indexOf(slot);
	if (index >= 0) {
		activeGlitchSounds.splice(index, 1);
	}
}

/** Быстро гасим лишний инстанс перед запуском нового. */
function fadeOutGlitchInstance(instance, fadeMs = DIGITAL_SOUND_FADE_OUT_S * 1000) {
	if (instance.disposed || !instance.gain) {
		return;
	}

	const ctx = getAudioContext();
	if (instance.stopTimer) {
		clearTimeout(instance.stopTimer);
		instance.stopTimer = null;
	}

	if (ctx) {
		const now = ctx.currentTime;
		const fadeSec = fadeMs / 1000;
		instance.gain.gain.cancelScheduledValues(now);
		instance.gain.gain.setValueAtTime(instance.gain.gain.value, now);
		instance.gain.gain.linearRampToValueAtTime(0, now + fadeSec);
	}

	setTimeout(() => {
		disposeGlitchInstance(instance);
	}, fadeMs + 50);
}

/** Оставляем не больше maxCount слотов; старые — с fade-out. */
function trimGlitchSounds(maxCount, replaceFadeMs = GLITCH_SOUND_REPLACE_FADE_MS) {
	const ctx = getAudioContext();
	while (activeGlitchSounds.length > maxCount) {
		const oldest = activeGlitchSounds.shift();
		if (!oldest) {
			continue;
		}
		oldest.cancelled = true;
		if (oldest.instance && !oldest.instance.disposed) {
			fadeOutGlitchInstance(oldest.instance, replaceFadeMs);
		}
	}
	if (ctx?.state === "suspended") {
		ctx.resume().catch(() => {});
	}
}

/**
 * Воспроизвести звук с начала, обрезать под durationMs, в конце — fade-out.
 * @param {string} soundId
 * @param {number} durationMs — длительность змейки
 * @param {{ id: number, instance: object | null, cancelled: boolean }} slot
 * @param {number} [fadeOutMs]
 * @param {() => void} [onComplete]
 * @param {number} [panOverride]
 * @param {number} [volumeGain]
 */
async function playTimedSound(soundId, durationMs, slot, fadeOutMs = DIGITAL_SOUND_FADE_OUT_S * 1000, onComplete, panOverride, volumeGain = 1, spatialPosition, options = {}) {
	const finish = () => {
		removeGlitchSlot(slot);
		onComplete?.();
	};

	if (!isPageSoundAllowed() || durationMs <= 0) {
		finish();
		return;
	}

	const src = SOUND_CATALOG[soundId];
	if (!src) {
		if (import.meta.env.DEV) {
			console.warn(`[soundDesign] Unknown sound id: ${soundId}`);
		}
		finish();
		return;
	}

	const ctx = getAudioContext();
	if (!ctx) {
		finish();
		return;
	}

	if (ctx.state === "suspended") {
		await ctx.resume();
	}

	let buffer;
	try {
		buffer = await loadAudioBuffer(src);
	} catch {
		finish();
		return;
	}

	if (slot.cancelled) {
		finish();
		return;
	}

	const bufferDurationMs = buffer.duration * 1000;
	const loopToDuration = options.loopToDuration === true && durationMs > bufferDurationMs;
	const playDurationMs = loopToDuration ? durationMs : Math.min(durationMs, bufferDurationMs);
	const fadeMs = Math.min(fadeOutMs, playDurationMs);
	const fadeStartSec = Math.max(0, (playDurationMs - fadeMs) / 1000);
	const stopSec = playDurationMs / 1000;

	const gain = ctx.createGain();
	gain.gain.value = volumeGain;
	const panner = spatialPosition
		? connectGainWithSpatialToMasterBus(ctx, gain, spatialPosition)
		: connectWithPan(ctx, gain, getSoundPan(soundId, panOverride));

	const source = ctx.createBufferSource();
	source.buffer = buffer;
	source.loop = loopToDuration;
	source.connect(gain);

	const instance = { source, gain, panner, stopTimer: null, disposed: false };
	slot.instance = instance;
	const startedAt = ctx.currentTime;

	source.start(0);

	if (fadeMs > 0 && fadeMs < playDurationMs) {
		gain.gain.setValueAtTime(volumeGain, startedAt + fadeStartSec);
		gain.gain.linearRampToValueAtTime(0, startedAt + stopSec);
	} else if (fadeMs >= playDurationMs) {
		gain.gain.setValueAtTime(volumeGain, startedAt);
		gain.gain.linearRampToValueAtTime(0, startedAt + stopSec);
	}

	instance.stopTimer = setTimeout(() => {
		disposeGlitchInstance(instance);
		finish();
	}, playDurationMs + 50);
}

/**
 * Digital-звук под глитч текста.
 * - hover / menu: cooldown при быстром проведении; если новый глитч длиннее — перезапуск сразу
 * - route: один звук на весь enter/exit (без cooldown)
 * @param {number} durationMs
 * @param {GlitchTextSoundIntent} [intent]
 * @param {number} [panOverride]
 * @param {{ loopToDuration?: boolean }} [options]
 */
export function playGlitchTextSound(durationMs, intent = "hover", panOverride, spatialPosition, options = {}) {
	if (!isPageSoundAllowed() || durationMs <= 0) {
		return;
	}

	const now = performance.now();

	if (intent === "hover" || intent === "menu") {
		const active = getActiveGlitchSlot();

		if (active) {
			const remainingMs = active.plannedEndAt - now;

			// Короткий → длинный: текущий звук не дотянет до конца анимации — перезапуск.
			if (durationMs > remainingMs) {
				trimGlitchSounds(0);
				lastHoverGlitchSoundAt = now;
			} else if (now - lastHoverGlitchSoundAt < HOVER_GLITCH_SOUND_COOLDOWN_MS) {
				return;
			} else {
				trimGlitchSounds(0);
				lastHoverGlitchSoundAt = now;
			}
		} else if (now - lastHoverGlitchSoundAt < HOVER_GLITCH_SOUND_COOLDOWN_MS) {
			return;
		} else {
			lastHoverGlitchSoundAt = now;
		}
	} else {
		trimGlitchSounds(0);
	}

	const slot = {
		id: ++glitchSoundSlotId,
		instance: null,
		cancelled: false,
		plannedEndAt: now + durationMs,
		durationMs,
	};
	activeGlitchSounds.push(slot);

	const pan = panOverride ?? (intent === "menu" ? LEFT_MENU_GLITCH_SOUND_PAN : undefined);
	const volumeGain = intent === "menu" ? LEFT_MENU_GLITCH_SOUND_GAIN : 1;

	playTimedSound("digital_sound", durationMs, slot, DIGITAL_SOUND_FADE_OUT_S * 1000, undefined, pan, volumeGain, spatialPosition, options).catch(() => {
		removeGlitchSlot(slot);
	});
}

/** Digital-звук под appear/disappear подписи левого меню — всегда с левого канала. */
export function playLeftMenuGlitchSound(durationMs) {
	playGlitchTextSound(durationMs, "menu");
}

/** Тот же digital_sound и gain, что в левом меню, но из правого канала. */
export function playRightNavigatorGlitchSound(durationMs) {
	playGlitchTextSound(durationMs, "menu", RIGHT_NAV_GLITCH_SOUND_PAN);
}

/** Короткий beep при наведении на пункт левого меню — с левого канала. */
export function playLeftMenuBeepSound() {
	if (!isPageSoundAllowed()) {
		return;
	}

	const now = performance.now();
	if (now - lastLeftMenuBeepAt < LEFT_MENU_BEEP_COOLDOWN_MS) {
		return;
	}
	lastLeftMenuBeepAt = now;

	playSound("beep", LEFT_MENU_BEEP_SOUND_PAN);
}

async function playOneShotWebAudio(soundId, panOverride, volumeGain = 1) {
	const src = SOUND_CATALOG[soundId];
	if (!src) {
		return;
	}

	const ctx = getAudioContext();
	if (!ctx) {
		return;
	}

	if (ctx.state === "suspended") {
		await ctx.resume();
	}

	let buffer;
	try {
		buffer = await loadAudioBuffer(src);
	} catch {
		return;
	}

	const gain = ctx.createGain();
	gain.gain.value = Math.max(0, Math.min(1, volumeGain));
	const panner = connectWithPan(ctx, gain, getSoundPan(soundId, panOverride));

	const source = ctx.createBufferSource();
	source.buffer = buffer;
	source.connect(gain);

	const entry = { source, gain, panner, fadeFrameId: null };
	activePlayback.set(soundId, entry);

	source.onended = () => {
		if (activePlayback.get(soundId) === entry) {
			disposeWebAudioNodes(entry);
			activePlayback.delete(soundId);
		}
	};

	source.start(0);
}

/**
 * Воспроизвести звук по id из SOUND_CATALOG.
 * Учитывает store.soundsActive и PORTFOLIO_SOUND_PAN (только на /portfolio).
 * @param {string} soundId
 * @param {number} [panOverride]
 * @param {number} [volumeGain=1]
 */
export function playSound(soundId, panOverride, volumeGain = 1) {
	if (!isPageSoundAllowed()) {
		return;
	}

	if (!SOUND_CATALOG[soundId]) {
		if (import.meta.env.DEV) {
			console.warn(`[soundDesign] Unknown sound id: ${soundId}`);
		}
		return;
	}

	const prev = activePlayback.get(soundId);
	if (prev) {
		cancelFade(soundId);
		disposeWebAudioNodes(prev);
		activePlayback.delete(soundId);
	}

	playOneShotWebAudio(soundId, panOverride, volumeGain).catch(() => {});
}

/** Same click as custom cursor — for hit targets that stopPropagation. */
let uiClickAudio = null;

export function playUiClickSound() {
	if (!isPageSoundAllowed() || typeof Audio === "undefined") {
		return;
	}
	if (!uiClickAudio) {
		uiClickAudio = new Audio(clickSoundUrl);
		bindMediaElementToMasterBus(uiClickAudio);
	}
	uiClickAudio.pause();
	uiClickAudio.currentTime = 0;
	uiClickAudio.play().catch(() => {});
}

/**
 * Звук сдвига карточки — длина = plateSlideDuration (см. portfolioHubConfig.interaction).
 * @param {number} durationMs
 */
export function playHubCardMovementSound(durationMs) {
	if (!isPageSoundAllowed() || durationMs <= 0) {
		return;
	}

	if (cardMovementSoundSlot) {
		cardMovementSoundSlot.cancelled = true;
		if (cardMovementSoundSlot.instance && !cardMovementSoundSlot.instance.disposed) {
			fadeOutGlitchInstance(cardMovementSoundSlot.instance, GLITCH_SOUND_REPLACE_FADE_MS);
		}
		cardMovementSoundSlot = null;
	}

	const slot = { instance: null, cancelled: false };
	cardMovementSoundSlot = slot;

	playTimedSound("card_movement", durationMs, slot, CARD_MOVEMENT_FADE_OUT_S * 1000, () => {
		if (cardMovementSoundSlot === slot) {
			cardMovementSoundSlot = null;
		}
	}).catch(() => {
		if (cardMovementSoundSlot === slot) {
			cardMovementSoundSlot = null;
		}
	});
}

/**
 * Звук появления сетки хаба — длина = gridEnter.durationMs (см. portfolioHubConfig).
 */
export function playPortfolioHubEnterSound() {
	const durationMs = portfolioHubPlatesConfig.gridEnter?.durationMs ?? 2000;

	if (!isPageSoundAllowed() || durationMs <= 0) {
		return;
	}

	if (portfolioEnterSoundSlot) {
		portfolioEnterSoundSlot.cancelled = true;
		if (portfolioEnterSoundSlot.instance && !portfolioEnterSoundSlot.instance.disposed) {
			fadeOutGlitchInstance(portfolioEnterSoundSlot.instance, GLITCH_SOUND_REPLACE_FADE_MS);
		}
		portfolioEnterSoundSlot = null;
	}

	const slot = { instance: null, cancelled: false };
	portfolioEnterSoundSlot = slot;

	playTimedSound("portfolio_enter", durationMs, slot, PORTFOLIO_ENTER_FADE_OUT_S * 1000, () => {
		if (portfolioEnterSoundSlot === slot) {
			portfolioEnterSoundSlot = null;
		}
	}).catch(() => {
		if (portfolioEnterSoundSlot === slot) {
			portfolioEnterSoundSlot = null;
		}
	});
}

/** Уход с роута /portfolio (hub). */
export function playPortfolioLeaveSound() {
	playSound("portfolio_leave");
}

/**
 * Звук ухода по типу из resolvePortfolioLeaveSound.
 * @param {'portfolio_leave'} soundKind
 */
export function playPortfolioRouteLeaveSound(soundKind) {
	if (soundKind === "portfolio_leave") {
		playPortfolioLeaveSound();
	}
}

/**
 * Звук захода по типу из resolvePortfolioEnterSound.
 * @param {'portfolio_enter'} soundKind
 */
export function playPortfolioRouteEnterSound(soundKind) {
	if (soundKind === "portfolio_enter") {
		playPortfolioHubEnterSound();
	}
}

/**
 * Плавно гасит активный экземпляр звука до 0 и останавливает.
 * @param {string} soundId
 * @param {number} [durationMs]
 */
export function fadeOutSound(soundId, durationMs = LOGO_REVEAL_FADE_OUT_S * 1000) {
	const entry = activePlayback.get(soundId);
	if (!entry?.gain) {
		return;
	}

	cancelFade(soundId);

	const ctx = getAudioContext();
	if (!ctx) {
		return;
	}

	const now = ctx.currentTime;
	const fadeSec = durationMs / 1000;
	entry.gain.gain.cancelScheduledValues(now);
	entry.gain.gain.setValueAtTime(entry.gain.gain.value, now);
	entry.gain.gain.linearRampToValueAtTime(0, now + fadeSec);

	setTimeout(() => {
		if (activePlayback.get(soundId) === entry) {
			disposeWebAudioNodes(entry);
			activePlayback.delete(soundId);
		}
	}, durationMs + 50);
}

function suspendSoundDesignContext() {
	for (const [soundId, entry] of activePlayback) {
		cancelFade(soundId);
		disposeWebAudioNodes(entry);
		activePlayback.delete(soundId);
	}

	for (const slot of activeGlitchSounds) {
		slot.cancelled = true;
		disposeGlitchInstance(slot.instance);
		slot.instance = null;
	}
	activeGlitchSounds.length = 0;

	suspendMasterAudioContext();
}

function fadeOutAllDesignSounds(durationMs) {
	for (const soundId of [...activePlayback.keys()]) {
		fadeOutSound(soundId, durationMs);
	}

	for (const slot of activeGlitchSounds) {
		if (slot.instance && !slot.instance.disposed) {
			fadeOutGlitchInstance(slot.instance, durationMs);
		}
	}
}

function resumeSoundDesignContext() {
	if (!isSoundAudible()) {
		return;
	}

	void resumeMasterAudioContext();
}

registerPageVisibilitySoundHandlers({
	suspend: suspendSoundDesignContext,
	resume: resumeSoundDesignContext,
});

registerSiteSoundMuteHandler({
	onFadeStart: (_generation, durationMs) => {
		fadeOutAllDesignSounds(durationMs);
	},
	onMuteComplete: () => {
		suspendSoundDesignContext();
	},
});
