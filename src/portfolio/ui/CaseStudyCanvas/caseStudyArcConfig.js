import { SITE_MAIN_COLOR } from "@/constants/siteMainColor.js";

/**
 * Настраиваемые параметры дуги case study — dev-панель (клавиша 8) или этот файл.
 */
export const caseStudyArcConfig = {
	/** Поворот всей правой дуги вокруг центра окружности, градусы. */
	rotationDeg: 0,
	/** Прозрачность дуги, внешнего и центрального кружка (0–1). */
	trackOpacity: 0.15,
	/** Прозрачность неактивных подписей; активный пункт всегда 100%. */
	inactiveTextOpacity: 0.45,
	/** Прозрачность среднего кружка (0–1), относительно trackOpacity. */
	nodeMidOpacity: 0.32,
	/** Цвет активного кружка, bloom и номера главы. */
	activeColor: SITE_MAIN_COLOR,
	/** Прозрачность активного кружка и центральной точки (0–1). */
	activeOpacity: 0.5,
	/** Bloom внешнего кольца — shadowBlur. */
	activeOuterBloomBlur: 4,
	/** Сила bloom внешнего кольца. */
	activeOuterBloomStrength: 2,
	/** Bloom центральной точки — shadowBlur. */
	activeInnerBloomBlur: 4,
	/** Сила bloom центральной точки. */
	activeInnerBloomStrength: 2,
	/** Толщина обводки внешнего кольца в активном состоянии (px). */
	activeLineWidth: 1,
	/** Свечение replacement-символов змейки правой навигации. */
	snakeGlowStrength: 4,
	snakeGlowBlur: 8,
	snakeGlowAlpha: 0.9,
	snakePassedLetterAlpha: 0.18,
};

/** Временное угловое смещение lifecycle-анимации; не сохраняется dev-панелью. */
export const caseStudyArcRuntime = {
	introRotationDeg: 0,
};

/** Фиксированная геометрия и визуал — не в dev-панели. */
export const caseStudyArcInternals = {
	centerXRatio: 0.57,
	centerYRatio: 0.5,
	maxNavItems: 5,
	canvasBleedRight: 300,
	labelGapRight: 30,
	labelStackGap: 10,
	showDebug: false,
	trackWidth: 1,
	radiusDiagonalRatio: 0.61,
	fadeEndDeg: 39,
	fadeInsetDeg: 1,
	fadeTailDeg: 45,
	fadePower: 0.5,
	itemGapDeg: 14,
	nodeRadius: 20,
	trackColor: "#ffffff",
	nodeMidRadius: 8,
	nodeInnerRadius: 3,
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
