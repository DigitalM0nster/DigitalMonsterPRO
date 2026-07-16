import { getGraphicsTier } from "@/utils/getGraphicsTier.js";

/**
 * Пресеты hero-сцены (цифровой океан + FBX кит). Камера — heroCamera.js.
 * low — shader-плоскость, без линий сетки; high — плотная сетка для Points.
 * Dev: панели 1–3, 8 (devPanelHotkeys.js) или ?whaleDev=1
 */

const DIGITAL_WHALE_PRESETS = {
	high: {
		fog: {
			color: "#00060f",
			near: -20,
			far: 40,
		},
		background: {
			color: "#000610",
		},
		ocean: {
			posX: 5.1,
			posY: 4.7,
			posZ: 12.8,
			tiltX: 0.31,
			rotationY: -0.02,
			mouseTiltX: 0,
			mouseTiltY: 0.005,
			scaleX: 0.4,
			scaleZ: 0.4,
			gridCols: 408,
			gridRows: 110,
			pointScale: 2.8,
			pointAlpha: 1,
			pointGlow: 6,
			gridAlpha: 1.52,
			waveAmp: 0.7,
			rippleAmp: 0.45,
			pointColor: "#1da3f7",
			gridColor: "#002aff",
			/** Локальное смещение центра ряби (от кита или океана — см. rippleFollowWhale). */
			rippleCenterX: -3,
			rippleCenterZ: 11.5,
			/** true — смещение от кита; false — от группы океана (фиксированная позиция на воде). */
			rippleFollowWhale: false,
			/** Постоянный скролл сетки по X (ед./с). */
			scrollSpeedX: 5,
			/** Скорость волн по Z (ед./с). Положительное — от камеры, в −Z. */
			scrollSpeedZ: 3.5,
		},
		whale: {
			posX: 6.4,
			posY: -4.3,
			posZ: -6.8,
			rotationX: 0.07,
			rotationY: -1.24,
			rotationZ: 0.3,
			scale: 0.03,
			swimSpeed: 0.05,
			sway: {
				bobAmp: 0.6,
				bobSpeed: 0.85,
				pitchAmp: 0.092,
				pitchSpeed: 0.15,
				rollAmp: 0.052,
				rollSpeed: 0.15,
				/** Плавное покачивание поворота Y (рад). */
				yawAmp: 0.02,
				/** Частота колебания Y. */
				yawSpeed: 0.2,
				/** 0 — обычный sin; 1 — максимально смягчённая кривая. */
				yawSmooth: 0.7,
			},
			wake: {
				count: 200,
				color: "#38d4ff",
				pointScale: 1.6,
				alpha: 0.32,
				speed: 0.05,
				spawnMinT: 0.3,
				spawnMaxT: 0.98,
				tailFadeT: 0.5,
				spread: 0.18,
				wanderAmp: 2.8,
				driftZRatio: -3.9,
				driftDepthAngle: 6,
				driftDepthAngleY: -4,
				driftCameraBlend: 0,
				rearDepthBias: 0.4,
			},
			pointScale: 6,
			edgeSpacing: 0.24,
			colorTint: "#0f93cc",
			emissiveIntensity: 3.05,
			/** Пульсация uGlow точек: от emissiveIntensity до max. */
			glowPulse: {
				max: 6.6,
				speed: 0.2,
				smooth: 0,
			},
			opacity: 0.34,
			// Затухание партиклов в прямоугольной области (локальные координаты whale.root).
			// FBX — один mesh HumpbackWhale004, по имени не разделить.
			particleFade: {
				region: {
					enabled: true,
					autoFin: true,
					intensity: 0.6,
					minX: -332,
					maxX: -34,
					minY: -417,
					maxY: -9,
					minZ: -68,
					maxZ: 409,
				},
			},
		},
		underwater: {
			grainBlurRadius: 0.025,
		},
		ambient: {
			deepCount: 400,
			deepColor: "#1a8eb8",
			deepPointScale: 4,
			deepAlpha: 0.26,
			deepGlow: 3,
			deepDriftAmp: 0.9,
			/** Горизонтальный поток частиц (ед./с, wrap в шейдере). */
			deepScrollSpeed: 13,
			deepSpreadX: 42,
			deepSpreadZ: 36,
			deepYMin: -16,
			deepYMax: 4,
			surfaceMargin: 0.45,
			oceanFadeBand: 2.5,
			whaleAmbientCount: 285,
			whaleAmbientColor: "#45d8ff",
			whaleAmbientPointScale: 2.9,
			whaleAmbientAlpha: 0.08,
			whaleAmbientGlow: 1.5,
			whaleAmbientDriftAmp: 0.55,
			/** Горизонтальный поток вокруг кита (ед./с). */
			whaleAmbientScrollSpeed: 1.5,
			whaleAmbientRadiusX: 32,
			whaleAmbientRadiusY: 6.5,
			whaleAmbientRadiusZ: 14.5,
		},
		/** Стартовая позиция кита до первого захода на главную (после «Начать»). */
		whaleIntro: {
			posX: 38.3,
			posY: -10.6,
			posZ: -33.4,
		},
		/** Первый заход на / — плавный переход whaleIntro → whale. */
		whaleEnter: {
			durationMs: 10000,
			/** Линейный старт (legacy, см. endEase*). */
			easePower: 1,
			/** Сила замедления к финишу (>1 — мягче посадка). */
			endEasePower: 5,
			/** Длина «линейной» фазы: больше — дольше как сейчас в начале. */
			endEaseBias: 2.5,
		},
	},
	low: {
		fog: {
			color: "#00060f",
			near: 5,
			far: 40,
		},
		background: {
			color: "#000610",
		},
		ocean: {
			posX: 5.1,
			posY: 5.3,
			posZ: 12.8,
			tiltX: 0.27,
			rotationY: 0,
			mouseTiltX: 0,
			mouseTiltY: 0.005,
			scaleX: 0.4,
			scaleZ: 0.4,
			gridCols: 640,
			gridRows: 90,
			pointScale: 0.5,
			pointAlpha: 0.32,
			pointGlow: 1.25,
			gridAlpha: 0,
			waveAmp: 0.7,
			rippleAmp: 0.45,
			pointColor: "#3ebefe",
			gridColor: "#1106b2",
			/** Локальное смещение центра ряби (от кита или океана — см. rippleFollowWhale). */
			rippleCenterX: -3,
			rippleCenterZ: 11.5,
			/** true — смещение от кита; false — от группы океана (фиксированная позиция на воде). */
			rippleFollowWhale: false,
			/** Постоянный скролл сетки по X (ед./с). */
			scrollSpeedX: 5,
			/** Скорость волн по Z (ед./с). Положительное — от камеры, в −Z. */
			scrollSpeedZ: 3.5,
		},
		whale: {
			posX: 8.3,
			posY: -5.5,
			posZ: -10.5,
			rotationX: 0,
			rotationY: -1.14,
			rotationZ: 0.23,
			scale: 0.03,
			swimSpeed: 0.05,
			sway: {
				bobAmp: 0.6,
				bobSpeed: 0.85,
				pitchAmp: 0.092,
				pitchSpeed: 0.15,
				rollAmp: 0.052,
				rollSpeed: 0.15,
				/** Плавное покачивание поворота Y (рад). */
				yawAmp: 0.1,
				/** Частота колебания Y. */
				yawSpeed: 0.2,
				/** 0 — обычный sin; 1 — максимально смягчённая кривая. */
				yawSmooth: 0.7,
			},
			wake: {
				count: 200,
				color: "#38d4ff",
				pointScale: 1.6,
				alpha: 0.32,
				speed: 0.05,
				spawnMinT: 0.3,
				spawnMaxT: 0.98,
				tailFadeT: 0.5,
				spread: 0.18,
				wanderAmp: 2.8,
				driftZRatio: -3.9,
				driftDepthAngle: 6,
				driftDepthAngleY: -4,
				driftCameraBlend: 0,
				rearDepthBias: 0.4,
			},
			pointScale: 6,
			edgeSpacing: 0.24,
			colorTint: "#0f93cc",
			emissiveIntensity: 3.05,
			/** Пульсация uGlow точек: от emissiveIntensity до max. */
			glowPulse: {
				max: 6.6,
				speed: 0.2,
				smooth: 0,
			},
			opacity: 0.34,
			// Затухание партиклов в прямоугольной области (локальные координаты whale.root).
			// FBX — один mesh HumpbackWhale004, по имени не разделить.
			particleFade: {
				region: {
					enabled: true,
					autoFin: true,
					intensity: 0.6,
					minX: -332,
					maxX: -34,
					minY: -417,
					maxY: -9,
					minZ: -68,
					maxZ: 409,
				},
			},
		},
		underwater: {
			grainBlurRadius: 0.025,
		},
		ambient: {
			deepCount: 400,
			deepColor: "#1a8eb8",
			deepPointScale: 4,
			deepAlpha: 0.26,
			deepGlow: 3,
			deepDriftAmp: 0.9,
			/** Горизонтальный поток частиц (ед./с, wrap в шейдере). */
			deepScrollSpeed: 13,
			deepSpreadX: 42,
			deepSpreadZ: 36,
			deepYMin: -16,
			deepYMax: 4,
			surfaceMargin: 0.45,
			oceanFadeBand: 2.5,
			whaleAmbientCount: 285,
			whaleAmbientColor: "#45d8ff",
			whaleAmbientPointScale: 2.9,
			whaleAmbientAlpha: 0.08,
			whaleAmbientGlow: 1.5,
			whaleAmbientDriftAmp: 0.55,
			/** Горизонтальный поток вокруг кита (ед./с). */
			whaleAmbientScrollSpeed: 1.5,
			whaleAmbientRadiusX: 32,
			whaleAmbientRadiusY: 6.5,
			whaleAmbientRadiusZ: 14.5,
		},
		whaleIntro: {
			posX: 38.3,
			posY: -10.6,
			posZ: -33.4,
		},
		whaleEnter: {
			durationMs: 10000,
			/** Линейный старт (legacy, см. endEase*). */
			easePower: 1,
			/** Сила замедления к финишу (>1 — мягче посадка). */
			endEasePower: 5,
			/** Длина «линейной» фазы: больше — дольше как сейчас в начале. */
			endEaseBias: 2.5,
		},
	},
};

function clonePreset(preset) {
	return structuredClone(preset);
}

function assignInto(target, source) {
	for (const key of Object.keys(source)) {
		const value = source[key];
		if (value && typeof value === "object" && !Array.isArray(value)) {
			if (!target[key] || typeof target[key] !== "object") {
				target[key] = {};
			}
			assignInto(target[key], value);
		} else {
			target[key] = value;
		}
	}
}

/** Активный конфиг (мутабельный — dev-панель и applyConfig пишут сюда). */
export const digitalWhaleConfig = clonePreset(DIGITAL_WHALE_PRESETS.high);

const DEFAULT_PARTICLE_FADE_REGION = DIGITAL_WHALE_PRESETS.high.whale.particleFade.region;
if (!digitalWhaleConfig.whale.particleFade?.region) {
	digitalWhaleConfig.whale.particleFade = {
		region: structuredClone(DEFAULT_PARTICLE_FADE_REGION),
	};
}

/** Пресет для tier (medium — как high). */
export function getDigitalWhalePresetForTier(tier = getGraphicsTier()) {
	return tier === "low" ? DIGITAL_WHALE_PRESETS.low : DIGITAL_WHALE_PRESETS.high;
}

/** Подставляет tier-пресет в digitalWhaleConfig до создания сцены. */
export function applyDigitalWhaleConfigForTier(tier = getGraphicsTier()) {
	assignInto(digitalWhaleConfig, clonePreset(getDigitalWhalePresetForTier(tier)));
}
