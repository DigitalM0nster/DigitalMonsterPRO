/**
 * Многослойное свечение активного пункта — радиальные градиенты + lighter.
 * blur/strength из dev-панели масштабируют радиус и яркость слоёв.
 */

/**
 * @param {string} hex
 */
function parseHexRgb(hex) {
	const normalized = hex.replace("#", "");
	const r = parseInt(normalized.slice(0, 2), 16);
	const g = parseInt(normalized.slice(2, 4), 16);
	const b = parseInt(normalized.slice(4, 6), 16);
	if ([r, g, b].some((v) => Number.isNaN(v))) {
		return { r: 0, g: 169, b: 255 };
	}
	return { r, g, b };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} radius
 * @param {CanvasGradient} gradient
 */
function fillRadialDisc(ctx, x, y, radius, gradient) {
	ctx.fillStyle = gradient;
	ctx.beginPath();
	ctx.arc(x, y, radius, 0, Math.PI * 2);
	ctx.fill();
}

/**
 * Bloom внешнего кольца — shadowBlur по обводке (как раньше).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} ringRadius
 * @param {number} lineWidth
 * @param {string} strokeColor
 * @param {{ core: string, soft: string }} glowColors
 * @param {number} bloomBlur
 * @param {number} bloomStrength
 */
export function drawArcOuterRingStrokeBloom(
	ctx,
	x,
	y,
	ringRadius,
	lineWidth,
	strokeColor,
	glowColors,
	bloomBlur,
	bloomStrength,
) {
	if (bloomBlur < 0.01 || bloomStrength < 0.01) {
		return;
	}

	ctx.save();
	ctx.lineCap = "butt";
	ctx.globalCompositeOperation = "lighter";
	ctx.beginPath();
	ctx.arc(x, y, ringRadius, 0, Math.PI * 2);
	ctx.strokeStyle = strokeColor;
	ctx.lineWidth = lineWidth;

	ctx.shadowColor = glowColors.core;
	ctx.shadowBlur = bloomBlur * 1.65;
	ctx.globalAlpha *= bloomStrength * 0.55;
	ctx.stroke();

	ctx.shadowColor = glowColors.soft;
	ctx.shadowBlur = bloomBlur * 0.75;
	ctx.globalAlpha /= 0.55;
	ctx.globalAlpha *= bloomStrength;
	ctx.stroke();
	ctx.restore();
}

/**
 * Белое ядро + насыщенный cyan + широкий ореол (как на референсе).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} coreRadius
 * @param {string} colorHex
 * @param {number} bloomBlur
 * @param {number} bloomStrength
 * @param {number} highlight
 */
export function drawArcInnerCoreGlow(ctx, x, y, coreRadius, colorHex, bloomBlur, bloomStrength, highlight) {
	const intensity = Math.min(1, (bloomStrength / 2) * highlight);
	if (intensity < 0.01 || bloomBlur < 0.01) {
		return;
	}

	const { r, g, b } = parseHexRgb(colorHex);
	const hazeRadius = coreRadius + bloomBlur * 7;
	const midRadius = coreRadius + bloomBlur * 2.4;
	const hotRadius = Math.max(coreRadius * 1.35, coreRadius + bloomBlur * 0.45);

	ctx.save();
	ctx.globalCompositeOperation = "lighter";

	const haze = ctx.createRadialGradient(x, y, coreRadius * 0.4, x, y, hazeRadius);
	haze.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${0.18 * intensity})`);
	haze.addColorStop(0.32, `rgba(${r}, ${g}, ${b}, ${0.1 * intensity})`);
	haze.addColorStop(0.68, `rgba(${r}, ${g}, ${b}, ${0.035 * intensity})`);
	haze.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
	fillRadialDisc(ctx, x, y, hazeRadius, haze);

	const mid = ctx.createRadialGradient(x, y, 0, x, y, midRadius);
	mid.addColorStop(0, `rgba(255, 255, 255, ${0.92 * intensity})`);
	mid.addColorStop(0.12, `rgba(${r}, ${g}, ${b}, ${0.88 * intensity})`);
	mid.addColorStop(0.38, `rgba(${r}, ${g}, ${b}, ${0.42 * intensity})`);
	mid.addColorStop(0.72, `rgba(${r}, ${g}, ${b}, ${0.1 * intensity})`);
	mid.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
	fillRadialDisc(ctx, x, y, midRadius, mid);

	const hot = ctx.createRadialGradient(x, y, 0, x, y, hotRadius);
	hot.addColorStop(0, `rgba(255, 255, 255, ${intensity})`);
	hot.addColorStop(0.55, `rgba(255, 255, 255, ${0.35 * intensity})`);
	hot.addColorStop(1, `rgba(255, 255, 255, 0)`);
	fillRadialDisc(ctx, x, y, hotRadius, hot);

	ctx.restore();
}
