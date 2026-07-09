import { getArcLineStrokeStyle } from "./caseStudyArcConfig.js";
import { blendArcNavLabelColor, caseStudyArcTrailLineConfig } from "./caseStudyArcTrailLineConfig.js";

/**
 * @param {string} color
 * @returns {{ r: number, g: number, b: number, a: number }}
 */
export function parseCssColor(color) {
	if (color.startsWith("#")) {
		const hex = color.replace("#", "");
		return {
			r: parseInt(hex.slice(0, 2), 16),
			g: parseInt(hex.slice(2, 4), 16),
			b: parseInt(hex.slice(4, 6), 16),
			a: 1,
		};
	}

	const match = color.match(/rgba?\(\s*([^)]+)\s*\)/i);
	if (match) {
		const parts = match[1].split(",").map((part) => parseFloat(part.trim()));
		return {
			r: parts[0] ?? 255,
			g: parts[1] ?? 255,
			b: parts[2] ?? 255,
			a: parts[3] ?? 1,
		};
	}

	return { r: 255, g: 255, b: 255, a: 1 };
}

/**
 * @param {{ r: number, g: number, b: number, a: number }} rgba
 */
export function rgbaToCssColor({ r, g, b, a }) {
	return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`;
}

/**
 * @param {string} colorA
 * @param {string} colorB
 * @param {number} t
 */
export function lerpCssColor(colorA, colorB, t) {
	const a = parseCssColor(colorA);
	const b = parseCssColor(colorB);
	const mix = (from, to) => from + (to - from) * t;

	return rgbaToCssColor({
		r: mix(a.r, b.r),
		g: mix(a.g, b.g),
		b: mix(a.b, b.b),
		a: mix(a.a, b.a),
	});
}

/**
 * Целевые цвета подписей пункта дуги (до сглаживания 0.5с).
 *
 * @param {{
 *   index: number,
 *   activeNavIndex: number,
 *   trailBlend: number,
 *   glowHighlight: number,
 *   activeLabelColor: string,
 *   trailLabelColor: string,
 *   inactiveLabelColor: string,
 *   activeTitleColor: string,
 * }} params
 */
export function resolveArcNavLabelTargetColors({
	index,
	activeNavIndex,
	trailBlend,
	glowHighlight,
	activeLabelColor,
	trailLabelColor,
	inactiveLabelColor,
	activeTitleColor,
}) {
	if (index <= activeNavIndex) {
		if (trailBlend >= 0.999) {
			return { index: trailLabelColor, title: trailLabelColor };
		}
		if (trailBlend <= 0.001) {
			return { index: activeLabelColor, title: activeTitleColor };
		}

		return {
			index: blendArcNavLabelColor(
				activeLabelColor,
				1,
				caseStudyArcTrailLineConfig.opacity,
				trailBlend,
			),
			title: blendArcNavLabelColor(
				activeTitleColor,
				1,
				caseStudyArcTrailLineConfig.opacity,
				trailBlend,
			),
		};
	}

	const glow = Math.max(0, Math.min(1, glowHighlight));
	return {
		index: lerpCssColor(inactiveLabelColor, activeLabelColor, glow),
		title: lerpCssColor(inactiveLabelColor, activeTitleColor, glow),
	};
}
