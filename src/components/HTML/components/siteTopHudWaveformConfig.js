/** Параметры мини-осциллографа HUD. */
export const siteTopHudWaveformConfig = {
	canvasWidth: 88,
	canvasHeight: 32,
	edgeFadeRatio: 0.16,
	centerAmpSpread: 18,
	centerAmpFloor: 0.22,

	/** Порог analyser: ниже — считаем тишиной. */
	signalNoiseGate: 0.01,
	/** Усиление peak для коротких SFX (beep, glitch). */
	peakVisualGain: 10,
	audioLevelRise: 0.62,
	audioLevelFall: 0.28,
	audioVisualGain: 1.45,
	/** Макс. половина амплитуды в px (canvas 32 → до ~±15). */
	liveAmpMax: 15,
	/** Мин. доля liveAmpMax при слабом сигнале (форма всё равно видна). */
	liveAmpFloor: 0.52,
	/** Доп. усиление после сглаживания (компенсация «сжатия» peak). */
	waveAmpBoost: 1.12,
	/** Мин. peak в буфере — ниже не нормализуем (шум). */
	waveformMinPeak: 0.00015,
	/** Сглаживание по X: радиус moving average (px). */
	waveSmoothRadius: 3,
	/** Сглаживание по времени: 0…1, меньше — плавнее. */
	waveTemporalSmooth: 0.3,

	/** Плавное движение при включённом звуке и тишине. */
	idleAmpMax: 3,
	idleAmpBoost: 3,
	idleTempo: 0.03,
	idleWaveCycles: 2,
	// idleWaveCycles: 1.25,
	idleDriftA: 0.5,
	idleDriftB: 0.5,
	idleMixA: 0.5,
	idleMixB: 0.1,
	idleBreathFreq: 0.95,
	idleShadowBoost: 1.6,

	lineAlphaOff: 0.2,
	lineAlphaIdle: 0.3,
	lineAlphaSignal: 0.5,
	/** Опорная линия под волной (центр canvas). */
	baselineAlphaOn: 0.28,
	baselineAlphaOff: 0.16,
	/** Затухание осциллографа сразу после «выкл» (за кадр). */
	mutePresenceFall: 0.07,
	muteWaveDecay: 0.42,
	shadowBlurIdle: 1.5,
	shadowBlurSignal: 7,

	/** Dev / legacy */
	waveSlotCount: 3,
	waveSlots: [30, 44, 58],
	centerSlotSpan: 0.32,
	spreadMin: 12,
	spreadMax: 20,
	rippleFreqMin: 0.2,
	rippleFreqMax: 0.34,
	lifeSpeedMin: 0.004,
	lifeSpeedMax: 0.011,
	strengthMin: 0.78,
	strengthMax: 1.2,
	tempoMin: 1.1,
	tempoMax: 3.3,
	maxAmpBase: 0,
	maxAmpActive: 0,
	activityLerp: 0.08,
	timeStepBase: 0,
	timeStepActive: 0,
	pulseMin: 0,
	pulseRange: 0,
	lifeSpeedIdle: 0,
	lifeSpeedActiveScale: 0,
	bgScaleBase: 0,
	bgScaleActive: 0,
	bgFreq: 0.1,
	bgTempo: 0.85,
	bgPhase: 0.3,
	shadowBlurBase: 1.5,
	shadowBlurActive: 6,
	audioLevelLerp: 0.28,
	realWaveMix: 1,
	realWaveMixFloor: 0,
	realWaveGain: 2.4,
	motionThreshold: 0.008,

	revision: 0,
};

/** Расставить всплески в центральной зоне canvas. */
export function rebuildSiteTopHudWaveformSlots(config = siteTopHudWaveformConfig) {
	const count = Math.max(1, Math.min(6, Math.round(config.waveSlotCount)));
	const center = config.canvasWidth * 0.5;
	const bandHalf = Math.max(6, config.canvasWidth * config.centerSlotSpan * 0.5);

	config.waveSlotCount = count;
	config.waveSlots =
		count === 1
			? [Math.round(center)]
			: Array.from({ length: count }, (_, index) => {
					const t = index / (count - 1);
					return Math.round(center - bandHalf + t * bandHalf * 2);
				});
	config.revision += 1;
}

export function bumpSiteTopHudWaveformConfigRevision() {
	siteTopHudWaveformConfig.revision += 1;
}
