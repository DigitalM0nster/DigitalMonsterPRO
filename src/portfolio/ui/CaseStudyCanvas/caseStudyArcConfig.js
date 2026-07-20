import { SITE_MAIN_COLOR } from "@/constants/siteMainColor.js";

/**
 * Настраиваемые параметры дуги case study — правь этот файл.
 */
export const caseStudyArcConfig = {
	/** Поворот круга вокруг своей оси (градусы). Дуга и узлы крутятся вместе. */
	rotationDeg: 0,
	/** Прозрачность дуги, внешнего и центрального кружка (0–1). */
	trackOpacity: 0.15,
	/** Прозрачность неактивных подписей; активный пункт всегда 100%. */
	inactiveTextOpacity: 0.45,
	/** Прозрачность среднего кружка (0–1), относительно trackOpacity. */
	nodeMidOpacity: 0.25,
	/** Цвет активного кружка, bloom и номера главы. */
	activeColor: SITE_MAIN_COLOR,
	/** Прозрачность активного кружка и центральной точки (0–1). */
	activeOpacity: 0.15,
	/** Bloom внешнего кольца — shadowBlur (Canvas reference). */
	activeOuterBloomBlur: 1.4,
	/** Сила bloom внешнего кольца. */
	activeOuterBloomStrength: 1,
	/** Bloom центральной точки — shadowBlur (Canvas reference). */
	activeInnerBloomBlur: 6.5,
	/** Сила bloom центральной точки. */
	activeInnerBloomStrength: 2.35,
	/** Толщина обводки внешнего кольца в активном состоянии (px). */
	activeLineWidth: 0.25,
	/** Свечение replacement-символов змейки правой навигации. */
	snakeGlowStrength: 4,
	snakeGlowBlur: 8,
	snakeGlowAlpha: 0.9,
	snakePassedLetterAlpha: 0.18,
	/**
	 * Скорость hover-змейки (дуга + prev/next): 1 = дефолт движка, 1.5 ≈ в полтора раза быстрее.
	 * Короткие подписи («О ПРОЕКТЕ») иначе тянутся заметно дольше длинных.
	 */
	snakeHoverSpeed: 1.5,
};

/** Старт enter: дуга за правым краем по своей окружности. */
export const CASE_STUDY_ARC_INTRO_START_DEG = -105;
/** Длительность заезда дуги на орбите (мс). */
export const CASE_STUDY_ARC_INTRO_MS = 920;

/** Временное lifecycle-смещение правой дуги; не сохраняется dev-панелью. */
export const caseStudyArcRuntime = {
	/** Угол орбиты при enter (град.): отрицательный = за экраном, 0 = база. */
	introRotationDeg: CASE_STUDY_ARC_INTRO_START_DEG,
	/** 0…1 появление дуги вместе с заездом по орбите. Start parked (no idle flash). */
	introOpacity: 0,
	/**
	 * Доп. поворот узлов на круге (град.), чтобы активный проект был в центре дуги.
	 * Пишется из caseStudyArcFocusMotion.
	 */
	focusRotationDeg: 0,
};

/** Фиксированная геометрия и визуал — не в dev-панели. */
export const caseStudyArcInternals = {
	centerXRatio: 0.57,
	centerYRatio: 0.5,
	maxNavItems: 5,
	canvasBleedRight: 300,
	labelGapRight: 30,
	labelStackGap: 10,
	/** Debug orbit overlay — keep off in product. */
	showDebug: false,
	trackWidth: 0.5,
	radiusDiagonalRatio: 0.61,
	/** Половина видимой дуги (град.) — за её краем opacity → 0. */
	fadeEndDeg: 45,
	fadeInsetDeg: 0.1,
	/** Влияние кривой хвоста (выше → длиннее/мягче визуально). */
	fadeTailDeg: 75,
	/** Кривая затухания на хвостах (выше → дольше держит яркость, потом резче гаснет). */
	fadePower: 0.85,
	/**
	 * Доля половины дуги, зарезервированная под fade сверху/снизу (0.15–0.55).
	 * Больше = сильнее/длиннее маска на концах.
	 */
	fadeTailReserve: 0.4,
	itemGapDeg: 14,
	nodeRadius: 20,
	trackColor: "#ffffff",
	nodeMidRadius: 10,
	nodeInnerRadius: 4,
};

/**
 * @param {number} opacity
 */
export function getInactiveArcLabelColor(opacity) {
	return `rgba(255, 255, 255, ${opacity})`;
}

/**
 * Цвета glow-слоёв bloom внешнего кольца (shadowBlur).
 * @param {typeof caseStudyArcConfig} cfg
 * @param {number} [strength]
 */
export function getActiveBloomGlowColors(cfg, strength = 1) {
	const coreAlpha = Math.min(1, 0.85 * strength);
	const softAlpha = Math.min(1, 0.55 * strength);
	return {
		core: getArcLineStrokeStyle(cfg.activeColor, coreAlpha),
		soft: getArcLineStrokeStyle(cfg.activeColor, softAlpha),
	};
}

/**
 * @param {typeof caseStudyArcConfig} cfg
 * @param {typeof caseStudyArcInternals} internal
 * @param {number} [opacityFactor]
 */
export function getTrackStrokeStyle(cfg, internal, opacityFactor = 1) {
	return getArcLineStrokeStyle(internal.trackColor, cfg.trackOpacity * opacityFactor);
}

/**
 * @param {typeof caseStudyArcInternals} internal
 * @param {boolean} [isMobile]
 */
export function resolveNodeMarkerRadii(internal, isMobile = false) {
	const outer = isMobile ? Math.max(2, internal.nodeRadius - 0.5) : internal.nodeRadius;
	const inner = Math.max(1, Math.min(internal.nodeInnerRadius, outer - 1));
	const mid = Math.max(inner + 0.5, Math.min(internal.nodeMidRadius, outer - 0.5));
	return { outer, mid, inner };
}

/**
 * @param {string} hex
 * @param {number} alpha
 */
export function getArcLineStrokeStyle(hex, alpha) {
	const normalized = hex.replace("#", "");
	const r = parseInt(normalized.slice(0, 2), 16);
	const g = parseInt(normalized.slice(2, 4), 16);
	const b = parseInt(normalized.slice(4, 6), 16);
	if ([r, g, b].some((v) => Number.isNaN(v))) {
		return `rgba(255, 255, 255, ${alpha})`;
	}
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * @param {string} hexA
 * @param {string} hexB
 * @param {number} t
 */
export function lerpHexColor(hexA, hexB, t) {
	const parse = (hex) => {
		const normalized = hex.replace("#", "");
		return {
			r: parseInt(normalized.slice(0, 2), 16),
			g: parseInt(normalized.slice(2, 4), 16),
			b: parseInt(normalized.slice(4, 6), 16),
		};
	};

	const a = parse(hexA);
	const b = parse(hexB);
	const mix = (from, to) => Math.round(from + (to - from) * t);
	const r = mix(a.r, b.r);
	const g = mix(a.g, b.g);
	const blue = mix(a.b, b.b);

	return `#${[r, g, blue].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

let configRevision = 0;
const listeners = new Set();

export function getCaseStudyArcConfigRevision() {
	return configRevision;
}

export function subscribeCaseStudyArcConfig(listener) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function bumpCaseStudyArcConfigRevision() {
	configRevision += 1;
	for (const listener of listeners) {
		listener(configRevision);
	}
}
