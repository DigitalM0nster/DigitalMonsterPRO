/**
 * Цвета scroll-hint под Digital Monster (мышь + змейка на home).
 * Live-tune: dev-панель 6 или ?scrollHintDev=1
 */
export const heroScrollHintConfig = {
	/** Базовый цвет трека и хвоста. */
	mainColor: "#00b3ff",
	/** Цвет мыши и кончика змейки. */
	brightColor: "#2ea4ff",
	/** Цвет текста «листайте вниз». */
	labelColor: "#ffffff",
	/** Цвет свечения текста. */
	labelGlowColor: "#39b3fe",
	/** Сила canvas-свечения текста (0 = выкл). */
	labelGlowStrength: 4,
	/** Радиус blur свечения текста, px. */
	labelGlowBlur: 7.5,
	/** HDR lift змейки/мыши в шейдере (site bloom threshold ≈ 1). */
	bloomBoost: 8,
	/** Прозрачность линии трека. */
	trackAlpha: 0.62,
};

export function cloneHeroScrollHintConfig(source = heroScrollHintConfig) {
	return {
		mainColor: source.mainColor,
		brightColor: source.brightColor,
		labelColor: source.labelColor,
		labelGlowColor: source.labelGlowColor,
		labelGlowStrength: source.labelGlowStrength,
		labelGlowBlur: source.labelGlowBlur,
		bloomBoost: source.bloomBoost,
		trackAlpha: source.trackAlpha,
	};
}

/** @param {string} hex */
export function hexToRgbBytes(hex) {
	const raw = String(hex ?? "").replace("#", "").trim();
	const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw.padEnd(6, "0").slice(0, 6);
	const n = Number.parseInt(full, 16);
	if (!Number.isFinite(n)) {
		return { r: 0, g: 169, b: 255 };
	}
	return {
		r: (n >> 16) & 255,
		g: (n >> 8) & 255,
		b: n & 255,
	};
}

/** @param {string} hex @param {number} alpha */
export function rgbaFromHex(hex, alpha) {
	const { r, g, b } = hexToRgbBytes(hex);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
