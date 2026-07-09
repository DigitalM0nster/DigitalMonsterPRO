/**
 * Единая Web Audio шина сайта: все источники → masterGain → analyser → destination.
 * Один AudioContext на всё приложение (soundDesign, underwater, hex, HTML Audio).
 */

/** @type {AudioContext | null} */
let masterCtx = null;
/** @type {GainNode | null} */
let masterInput = null;
/** @type {AnalyserNode | null} */
let masterAnalyser = null;

/** @type {WeakMap<HTMLMediaElement, { source: MediaElementAudioSourceNode, gain: GainNode }>} */
const mediaElementRoutes = new WeakMap();

function ensureMasterBus() {
	if (masterCtx) {
		return masterCtx;
	}

	if (typeof window === "undefined") {
		return null;
	}

	const Ctx = window.AudioContext || window.webkitAudioContext;
	if (!Ctx) {
		return null;
	}

	masterCtx = new Ctx();
	masterInput = masterCtx.createGain();
	masterInput.gain.value = 1;

	masterAnalyser = masterCtx.createAnalyser();
	masterAnalyser.fftSize = 1024;
	masterAnalyser.smoothingTimeConstant = 0.52;

	masterInput.connect(masterAnalyser);
	masterAnalyser.connect(masterCtx.destination);

	return masterCtx;
}

/** Инициализация шины (preload / первый user gesture). */
export function initMasterAudioBus() {
	ensureMasterBus();
}

export function getMasterAudioContext() {
	return ensureMasterBus();
}

export function getMasterBusInput() {
	ensureMasterBus();
	return masterInput;
}

export function getMasterAnalyser() {
	ensureMasterBus();
	return masterAnalyser;
}

/** Подключить любой AudioNode к master bus. */
export function connectNodeToMasterBus(node) {
	const input = getMasterBusInput();
	if (!node || !input) {
		return;
	}

	node.connect(input);
}

/**
 * gain → (panner?) → master bus.
 * @returns {StereoPannerNode | null}
 */
export function connectGainWithPanToMasterBus(ctx, gainNode, pan) {
	if (!gainNode) {
		return null;
	}

	if (typeof pan !== "number" || pan === 0) {
		connectNodeToMasterBus(gainNode);
		return null;
	}

	const panner = ctx.createStereoPanner();
	panner.pan.value = Math.max(-1, Math.min(1, pan));
	gainNode.connect(panner);
	panner.connect(getMasterBusInput());
	return panner;
}

/** gain → HRTF panner → master bus для источников с вертикальным положением. */
export function connectGainWithSpatialToMasterBus(ctx, gainNode, position) {
	if (!gainNode || !position || typeof ctx?.createPanner !== "function") {
		return null;
	}

	const panner = ctx.createPanner();
	panner.panningModel = "HRTF";
	panner.distanceModel = "inverse";
	panner.refDistance = 1;
	panner.maxDistance = 100;
	panner.rolloffFactor = 0;
	const x = Number(position.x) || 0;
	const y = Number(position.y) || 0;
	const z = Number(position.z) || -1;
	if (panner.positionX) {
		panner.positionX.value = x;
		panner.positionY.value = y;
		panner.positionZ.value = z;
	} else {
		panner.setPosition(x, y, z);
	}
	gainNode.connect(panner);
	panner.connect(getMasterBusInput());
	return panner;
}

/**
 * HTMLAudioElement → master bus (createMediaElementSource — один раз на элемент).
 * @param {HTMLMediaElement} audioElement
 * @param {{ volume?: number }} [options]
 */
export function bindMediaElementToMasterBus(audioElement, options = {}) {
	const ctx = getMasterAudioContext();
	if (!ctx || !audioElement) {
		return null;
	}

	let route = mediaElementRoutes.get(audioElement);
	if (!route) {
		const source = ctx.createMediaElementSource(audioElement);
		const gain = ctx.createGain();
		source.connect(gain);
		gain.connect(getMasterBusInput());
		route = { source, gain };
		mediaElementRoutes.set(audioElement, route);
	}

	audioElement.volume = 1;
	route.gain.gain.value = options.volume ?? 1;
	return route;
}

export async function resumeMasterAudioContext() {
	const ctx = getMasterAudioContext();
	if (ctx?.state === "suspended") {
		await ctx.resume().catch(() => {});
	}
}

export function suspendMasterAudioContext() {
	const ctx = getMasterAudioContext();
	if (ctx?.state === "running") {
		void ctx.suspend().catch(() => {});
	}
}

/** @type {Float32Array | null} */
let waveformFloatBuffer = null;

/** Нормализация сырого уровня → 0…1 для HUD. */
const HUD_LEVEL_GAIN = 9;

/**
 * @param {Float32Array} samples
 * @returns {{ level: number, peak: number, rms: number }}
 */
function measureWaveformLevel(samples) {
	let sumSquares = 0;
	let peak = 0;

	for (let i = 0; i < samples.length; i += 1) {
		const value = samples[i];
		const abs = Math.abs(value);
		if (abs > peak) {
			peak = abs;
		}
		sumSquares += value * value;
	}

	const rms = Math.sqrt(sumSquares / samples.length);
	const level = Math.min(1, Math.max(rms, peak * 0.92) * HUD_LEVEL_GAIN);

	return { level, peak, rms };
}

/**
 * Нормализованная форма волны −1…1 (time-domain analyser).
 * @param {number} [sampleCount] — число точек (обычно ширина canvas).
 * @returns {Float32Array | null}
 */
export function readMasterAudioWaveform(sampleCount = 128) {
	return readMasterAudioSnapshot(sampleCount).waveform;
}

/**
 * Один проход analyser: RMS + форма волны для HUD.
 * @param {number} [sampleCount]
 * @returns {{ level: number, waveform: Float32Array | null }}
 */
export function readMasterAudioSnapshot(sampleCount = 128) {
	const analyser = getMasterAnalyser();
	const ctx = getMasterAudioContext();
	if (!analyser || !ctx || ctx.state === "closed") {
		return { level: 0, waveform: null, peak: 0, rms: 0 };
	}

	const fftSize = analyser.fftSize;
	if (!waveformFloatBuffer || waveformFloatBuffer.length !== fftSize) {
		waveformFloatBuffer = new Float32Array(fftSize);
	}

	analyser.getFloatTimeDomainData(waveformFloatBuffer);
	const { level, peak, rms } = measureWaveformLevel(waveformFloatBuffer);

	const count = Math.max(8, Math.round(sampleCount));
	const waveform = new Float32Array(count);
	const lastIndex = fftSize - 1;

	for (let i = 0; i < count; i += 1) {
		const idx = count === 1 ? 0 : Math.floor((i / (count - 1)) * lastIndex);
		waveform[i] = waveformFloatBuffer[idx];
	}

	return { level, waveform, peak, rms };
}

/**
 * RMS 0…1 по time-domain данным analyser (для HUD / debug).
 */
export function readMasterAudioLevel() {
	return readMasterAudioSnapshot(8).level;
}
