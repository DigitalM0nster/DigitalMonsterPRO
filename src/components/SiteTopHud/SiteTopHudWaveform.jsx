import { useEffect, useRef } from "react";
import {
	getMasterAudioContext,
	initMasterAudioBus,
	readMasterAudioSnapshot,
	resumeMasterAudioContext,
} from "@/sounds/masterAudioBus.js";
import { siteTopHudWaveformConfig } from "./siteTopHudWaveformConfig.js";
import styles from "./SiteTopHud.module.scss";

function resolveAccentRgba(color, alpha) {
	const normalized = color.replace("#", "").trim();
	if (normalized.length !== 6) {
		return `rgba(0, 169, 255, ${alpha})`;
	}

	const r = Number.parseInt(normalized.slice(0, 2), 16);
	const g = Number.parseInt(normalized.slice(2, 4), 16);
	const b = Number.parseInt(normalized.slice(4, 6), 16);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function createEdgeFadeGradient(context, canvasWidth, accent, alpha, edgeFadeRatio) {
	const gradient = context.createLinearGradient(0, 0, canvasWidth, 0);
	gradient.addColorStop(0, resolveAccentRgba(accent, 0));
	gradient.addColorStop(edgeFadeRatio, resolveAccentRgba(accent, alpha));
	gradient.addColorStop(1 - edgeFadeRatio, resolveAccentRgba(accent, alpha));
	gradient.addColorStop(1, resolveAccentRgba(accent, 0));
	return gradient;
}

/** Горизонтальная опорная линия — под волной, края в fade. */
function strokeBaseline(context, canvasWidth, y, accent, alpha, edgeFadeRatio) {
	if (alpha <= 0) {
		return;
	}

	context.beginPath();
	context.moveTo(0, y);
	context.lineTo(canvasWidth, y);
	context.strokeStyle = createEdgeFadeGradient(context, canvasWidth, accent, alpha, edgeFadeRatio);
	context.lineWidth = 1;
	context.shadowBlur = 0;
	context.stroke();
}

/** Peak нормализация: форма волны заполняет liveAmpMax, а не сырые 0.00x из analyser. */
function resolveWaveformInvPeak(waveform, minPeak) {
	if (!waveform?.length) {
		return 0;
	}

	let peak = 0;
	for (let i = 0; i < waveform.length; i += 1) {
		const abs = Math.abs(waveform[i]);
		if (abs > peak) {
			peak = abs;
		}
	}

	if (peak < minPeak) {
		return 0;
	}

	return 1 / peak;
}

function smoothWaveformSpatial(samples, radius) {
	const count = samples.length;
	if (count === 0 || radius <= 0) {
		return samples;
	}

	const out = new Float32Array(count);

	for (let i = 0; i < count; i += 1) {
		let sum = 0;
		let weightSum = 0;

		for (let j = -radius; j <= radius; j += 1) {
			const idx = i + j;
			if (idx < 0 || idx >= count) {
				continue;
			}

			const weight = radius + 1 - Math.abs(j);
			sum += samples[idx] * weight;
			weightSum += weight;
		}

		out[i] = weightSum > 0 ? sum / weightSum : samples[i];
	}

	return out;
}

function blendWaveformTemporal(previous, target, amount) {
	if (!previous || previous.length !== target.length) {
		return new Float32Array(target);
	}

	const out = previous;
	for (let i = 0; i < target.length; i += 1) {
		out[i] += (target[i] - out[i]) * amount;
	}

	return out;
}

function decayWaveformTemporal(previous, amount) {
	if (!previous) {
		return null;
	}

	for (let i = 0; i < previous.length; i += 1) {
		previous[i] *= 1 - amount;
	}

	return previous;
}

/** После smooth peak падает — возвращаем целевую амплитуду, форма остаётся плавной. */
function boostSmoothedWaveAmplitude(samples, targetPeak) {
	if (!samples || targetPeak <= 0) {
		return;
	}

	let peak = 0;
	for (let i = 0; i < samples.length; i += 1) {
		const abs = Math.abs(samples[i]);
		if (abs > peak) {
			peak = abs;
		}
	}

	if (peak < 1e-5) {
		return;
	}

	const scale = targetPeak / peak;
	for (let i = 0; i < samples.length; i += 1) {
		samples[i] *= scale;
	}
}

function strokeSmoothWavePath(context, samples, midY) {
	const count = samples.length;
	if (count === 0) {
		return;
	}

	if (count === 1) {
		context.moveTo(0, midY + samples[0]);
		return;
	}

	if (count === 2) {
		context.moveTo(0, midY + samples[0]);
		context.lineTo(1, midY + samples[1]);
		return;
	}

	context.moveTo(0, midY + samples[0]);

	for (let i = 1; i < count - 2; i += 1) {
		const x = i;
		const y = midY + samples[i];
		const nextX = i + 1;
		const nextY = midY + samples[i + 1];
		const cx = (x + nextX) * 0.5;
		const cy = (y + nextY) * 0.5;
		context.quadraticCurveTo(x, y, cx, cy);
	}

	const last = count - 1;
	context.quadraticCurveTo(last - 1, midY + samples[last - 1], last, midY + samples[last]);
}

/** Декоративная волна в тишине — несколько sin, медленный drift. */
function buildIdleWaveform(width, time, cfg, centerX, centerSpread, centerAmpFloor) {
	const samples = new Float32Array(width);
	const t = time * cfg.idleTempo;
	const breath = 0.88 + 0.12 * Math.sin(t * cfg.idleBreathFreq);
	const widthSpan = Math.max(1, width - 1);

	for (let x = 0; x < width; x += 1) {
		const centerWeight =
			centerAmpFloor +
			(1 - centerAmpFloor) * Math.exp(-((x - centerX) ** 2) / (2 * centerSpread * centerSpread));
		const phase = (x / widthSpan) * Math.PI * 2 * cfg.idleWaveCycles;
		const ripple =
			Math.sin(phase + t * cfg.idleDriftA) * cfg.idleMixA +
			Math.sin(phase * 0.55 - t * cfg.idleDriftB + 0.8) * cfg.idleMixB;

		samples[x] = ripple * cfg.idleAmpMax * breath * centerWeight;
	}

	return samples;
}

/**
 * Мини-осциллограф: live-сигнал с master analyser + плавный idle при тишине.
 */
export default function SiteTopHudWaveform({ active = false }) {
	const canvasRef = useRef(null);
	const activeRef = useRef(active);
	const audioLevelRef = useRef(0);
	const presenceRef = useRef(1);
	const lastLineAlphaRef = useRef(siteTopHudWaveformConfig.lineAlphaIdle);
	const lastBaselineAlphaRef = useRef(siteTopHudWaveformConfig.baselineAlphaOn);
	const lastShadowBlurRef = useRef(siteTopHudWaveformConfig.shadowBlurIdle);

	useEffect(() => {
		activeRef.current = active;
	}, [active]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) {
			return undefined;
		}

		initMasterAudioBus();

		const ctx = canvas.getContext("2d");
		if (!ctx) {
			return undefined;
		}

		let canvasWidth = siteTopHudWaveformConfig.canvasWidth;
		let canvasHeight = siteTopHudWaveformConfig.canvasHeight;
		let configRevision = siteTopHudWaveformConfig.revision;
		let frameId = 0;
		let idleTime = 0;
		/** @type {Float32Array | null} */
		let smoothedSamples = null;

		const resizeCanvas = (width, height) => {
			const dpr = window.devicePixelRatio || 1;
			canvas.width = width * dpr;
			canvas.height = height * dpr;
			canvas.style.width = `${width}px`;
			canvas.style.height = `${height}px`;
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		};

		resizeCanvas(canvasWidth, canvasHeight);

		const draw = () => {
			const cfg = siteTopHudWaveformConfig;

			if (cfg.revision !== configRevision) {
				configRevision = cfg.revision;
			}

			if (cfg.canvasWidth !== canvasWidth || cfg.canvasHeight !== canvasHeight) {
				canvasWidth = cfg.canvasWidth;
				canvasHeight = cfg.canvasHeight;
				resizeCanvas(canvasWidth, canvasHeight);
				smoothedSamples = null;
			}

			const listening = activeRef.current;

			if (listening) {
				presenceRef.current = 1;
			} else {
				presenceRef.current = Math.max(0, presenceRef.current - cfg.mutePresenceFall);
				audioLevelRef.current = 0;
			}

			const presence = presenceRef.current;

			if (listening && getMasterAudioContext()?.state === "suspended") {
				void resumeMasterAudioContext();
			}

			const audioSnapshot = listening
				? readMasterAudioSnapshot(canvasWidth)
				: { level: 0, waveform: null, peak: 0, rms: 0 };

			const frameLevel = listening
				? Math.max(audioSnapshot.level, (audioSnapshot.peak ?? 0) * cfg.peakVisualGain)
				: 0;
			const gatedLevel = frameLevel > cfg.signalNoiseGate ? frameLevel : 0;
			const levelLerp =
				gatedLevel > audioLevelRef.current ? cfg.audioLevelRise : cfg.audioLevelFall;
			audioLevelRef.current += (gatedLevel - audioLevelRef.current) * levelLerp;

			const motion = listening ? Math.min(1, audioLevelRef.current * cfg.audioVisualGain) : 0;
			const hasMotion = motion > cfg.motionThreshold;
			const realWave = listening ? audioSnapshot.waveform : null;
			const invPeak =
				hasMotion && realWave ? resolveWaveformInvPeak(realWave, cfg.waveformMinPeak) : 0;
			const envelope = cfg.liveAmpFloor + motion * (1 - cfg.liveAmpFloor);
			const displayAmp = invPeak > 0 ? cfg.liveAmpMax * envelope : 0;

			const midY = canvasHeight * 0.5;
			const centerX = canvasWidth * 0.5;
			const centerSpread = Math.max(4, cfg.centerAmpSpread);
			const centerAmpFloor = Math.max(0, Math.min(1, cfg.centerAmpFloor));
			const accent = getComputedStyle(document.documentElement).getPropertyValue("--mainColor").trim() || "#00a9ff";
			const isIdleAnim = listening && !hasMotion;
			const idleBreath = isIdleAnim ? 0.5 + 0.5 * Math.sin(idleTime * cfg.idleBreathFreq) : 0;

			const activeLineAlpha =
				cfg.lineAlphaIdle +
				(isIdleAnim ? idleBreath * 0.06 : 0) +
				(hasMotion ? motion * cfg.lineAlphaSignal : 0);
			const activeBaselineAlpha = cfg.baselineAlphaOn;
			const activeShadowBlur =
				cfg.shadowBlurIdle +
				(isIdleAnim ? cfg.idleShadowBoost * idleBreath : 0) +
				(hasMotion ? motion * cfg.shadowBlurSignal : 0);

			if (listening) {
				lastLineAlphaRef.current = activeLineAlpha;
				lastBaselineAlphaRef.current = activeBaselineAlpha;
				lastShadowBlurRef.current = activeShadowBlur;
			}

			const lineAlpha = listening
				? activeLineAlpha
				: cfg.lineAlphaOff + (lastLineAlphaRef.current - cfg.lineAlphaOff) * presence;
			const baselineAlpha = listening
				? activeBaselineAlpha
				: cfg.baselineAlphaOff + (lastBaselineAlphaRef.current - cfg.baselineAlphaOff) * presence;
			const shadowBlur = listening
				? activeShadowBlur
				: lastShadowBlurRef.current * presence;

			ctx.clearRect(0, 0, canvasWidth, canvasHeight);

			strokeBaseline(ctx, canvasWidth, midY, accent, baselineAlpha, cfg.edgeFadeRatio);

			const frameSamples = new Float32Array(canvasWidth);

			for (let x = 0; x < canvasWidth; x += 1) {
				const centerWeight =
					centerAmpFloor +
					(1 - centerAmpFloor) * Math.exp(-((x - centerX) ** 2) / (2 * centerSpread * centerSpread));

				if (displayAmp > 0 && realWave) {
					frameSamples[x] = (realWave[x] ?? 0) * invPeak * displayAmp * centerWeight;
				}
			}

			if (displayAmp > 0) {
				const spatial = smoothWaveformSpatial(frameSamples, cfg.waveSmoothRadius);
				smoothedSamples = blendWaveformTemporal(
					smoothedSamples,
					spatial,
					cfg.waveTemporalSmooth,
				);
				const targetPeak = Math.min(
					displayAmp * cfg.waveAmpBoost,
					midY - 1,
				);
				boostSmoothedWaveAmplitude(smoothedSamples, targetPeak);
			} else if (listening) {
				idleTime += 1;
				const idleSamples = buildIdleWaveform(
					canvasWidth,
					idleTime,
					cfg,
					centerX,
					centerSpread,
					centerAmpFloor,
				);
				const spatial = smoothWaveformSpatial(idleSamples, cfg.waveSmoothRadius);
				smoothedSamples = blendWaveformTemporal(
					smoothedSamples,
					spatial,
					cfg.waveTemporalSmooth,
				);
				const idleTargetPeak = Math.min(
					cfg.idleAmpMax * cfg.idleAmpBoost,
					midY - 1,
				);
				boostSmoothedWaveAmplitude(smoothedSamples, idleTargetPeak);
			} else {
				idleTime = 0;
				smoothedSamples = decayWaveformTemporal(smoothedSamples, cfg.muteWaveDecay);
			}

			if (!listening && presence > 0 && smoothedSamples) {
				for (let i = 0; i < smoothedSamples.length; i += 1) {
					smoothedSamples[i] *= presence;
				}
			}

			ctx.beginPath();
			strokeSmoothWavePath(ctx, smoothedSamples ?? frameSamples, midY);

			const strokeGradient = createEdgeFadeGradient(ctx, canvasWidth, accent, lineAlpha, cfg.edgeFadeRatio);

			ctx.strokeStyle = strokeGradient;
			ctx.lineWidth = 1;
			ctx.shadowColor = accent;
			ctx.shadowBlur = shadowBlur;
			ctx.stroke();
			ctx.shadowBlur = 0;
			frameId = window.requestAnimationFrame(draw);
		};

		draw();

		return () => window.cancelAnimationFrame(frameId);
	}, []);

	return <canvas ref={canvasRef} className={styles.waveform} aria-hidden="true" />;
}
