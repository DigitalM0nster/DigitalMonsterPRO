/**
 * Свечение дуги у активного пункта навигации (отдельно от кружков и базовой дуги).
 * Позиция на дуге — от activeStateId + анимация в caseStudyArcGlowMotion.js.
 */
export const caseStudyArcActiveLineConfig = {
	/** Половина длины свечения по дуге, ° (от центра к краю зоны). */
	halfSpanDeg: 5,
	/** Bloom свечения — shadowBlur (Canvas reference). */
	bloomBlur: 2.3,
	/** Сила bloom. */
	bloomStrength: 1.65,
	/** Доп. яркость линии в центре свечения (0–1). */
	opacityBoost: 0,
};

/** Только DEV: ручная позиция ° для отладки (не влияет на прод). */
export const caseStudyArcActiveLineDev = {
	manualPositionDeg: 0,
};
