import {
	getGlitchMainDrawAlpha,
	isGlitchMainHidden,
	isGlitchReplacementVisible,
} from "./glitchLetterModel.js";
import { getGlitchDrawProfile } from "./glitchTextDrawProfiles.js";

/** HTML .additionalLetter: text-shadow 0 0 5px при fontSize HUD ≈ 90. */
export const GLITCH_REPLACEMENT_SHADOW_BLUR = 5;
export const REPLACEMENT_GLOW_STRENGTH_MAX = 12;
const GLOW_BLUR_REFERENCE_FONT_SIZE = 90;
const SPACE_WIDTH_EM = 0.35;

/**
 * @typedef {import('./glitchTextDrawProfiles.js').GlitchTextDrawProfile} GlitchTextDrawProfile
 * @typedef {object} GlitchTextDrawStyle
 * @property {number} fontSize
 * @property {number} fontWeight
 * @property {number} letterSpacing
 * @property {string} color
 * @property {string} [fontFamily]
 * @property {number} [paddingLeft]
 * @property {number} [paddingTop]
 * @property {number} [paddingRight]
 * @property {number} [paddingBottom]
 * @property {number} [replacementGlowStrength]
 * @property {number} [replacementShadowBlur]
 * @property {number} [replacementHaloAlpha]
 * @property {boolean} [replacementGlowPreview]
 * @property {number} [mainOpacity]
 * @property {boolean} [replacementFullOpacity]
 * @property {GlitchTextDrawProfile} [drawProfile]
 * @property {number} [originX]
 * @property {number} [originY]
 */

/**
 * Blur — от fontSize. activeGlow — яркость ореола.
 * @param {number} fontSize
 * @param {number} [glowStrength]
 */
export function resolveReplacementGlowMetrics(fontSize, glowStrength = 1) {
	const strength = Math.max(0, glowStrength);
	if (strength <= 0.001) {
		return { blur: 0, haloAlpha: 0, strength: 0 };
	}

	const safeSize = Math.max(12, fontSize);
	const baseBlur = Math.max(3, safeSize * (GLITCH_REPLACEMENT_SHADOW_BLUR / GLOW_BLUR_REFERENCE_FONT_SIZE));
	const blurScale = 0.55 + strength * 0.45;
	const blur = baseBlur * blurScale;
	const haloAlpha = Math.min(1, 0.12 + strength * 0.22);

	return { blur, haloAlpha, strength };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} replacement
 * @param {number} fontSize
 * @param {{ fontFamily: string, fontWeight: number, offsetYEm: number, scaleX: number, scaleY: number }} font
 * @param {{ blur: number, haloAlpha: number }} glow
 * @param {string} replacementColor
 * @param {string} shadowColor
 * @param {number} [alpha]
 */
function drawReplacementLetter(ctx, replacement, fontSize, font, glow, replacementColor, shadowColor, alpha = 1) {
	const offsetY = fontSize * font.offsetYEm;
	const fontCss = `${font.fontWeight} ${fontSize}px ${font.fontFamily}`;

	ctx.font = fontCss;
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";

	if (glow.haloAlpha > 0.01 && glow.strength > 0.001 && alpha > 0.001) {
		ctx.shadowColor = shadowColor;
		ctx.shadowBlur = glow.blur;
		ctx.fillStyle = replacementColor;
		const haloPasses = Math.min(12, Math.ceil(glow.strength));
		for (let pass = 0; pass < haloPasses; pass += 1) {
			const passStrength = Math.min(1, glow.strength - pass);
			ctx.globalAlpha = glow.haloAlpha * alpha * passStrength;
			ctx.fillText(replacement, 0, offsetY);
		}
	}

	ctx.shadowBlur = 0;
	ctx.globalAlpha = alpha;
	ctx.fillStyle = replacementColor;
	ctx.fillText(replacement, 0, offsetY);
}

/**
 * Одна строка glitch-текста (общий draw для HUD и hero).
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('./glitchSnakeEngine.js').GlitchLetterSlot[]} slots
 * @param {number} x
 * @param {number} y
 * @param {GlitchTextDrawStyle} style
 * @param {{ clear?: boolean, layer?: 'both' | 'main' | 'snake' }} [drawOptions]
 */
export function drawGlitchTextLine(ctx, slots, x, y, style, drawOptions = {}) {
	const shouldClear = drawOptions.clear !== false;
	const drawLayer = drawOptions.layer ?? "both";
	const drawMain = drawLayer === "both" || drawLayer === "main";
	const drawSnake = drawLayer === "both" || drawLayer === "snake";
	const profile = style.snakeProfile ?? getGlitchDrawProfile(style.drawProfile);
	const letterSpacingPx = style.fontSize * style.letterSpacing;
	const glowStrength =
		style.replacementGlowStrength ??
		profile.replacementGlowStrength ??
		1;
	const resolvedGlow = resolveReplacementGlowMetrics(style.fontSize, glowStrength);
	const glow = {
		blur: style.replacementShadowBlur ?? resolvedGlow.blur,
		haloAlpha: style.replacementHaloAlpha ?? resolvedGlow.haloAlpha,
		strength: Math.max(0, glowStrength),
	};
	const mainFontFamily = style.fontFamily ?? profile.mainFontFamily;
	const mainFont = `${style.fontWeight} ${style.fontSize}px ${mainFontFamily}`;
	const layerMainOpacity = style.mainOpacity ?? 1;
	const replacementAlpha = style.replacementFullOpacity ? 1 : layerMainOpacity;
	const replacementColor = profile.replacementColor;
	const shadowColor = profile.replacementShadowColor ?? replacementColor;

	if (shouldClear) {
		ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
	}

	ctx.textBaseline = "top";
	ctx.font = mainFont;

	let cursorX = x;
	const spaceWidth = style.fontSize * SPACE_WIDTH_EM;

	for (const slot of slots) {
		if (slot.isSpace) {
			cursorX += spaceWidth;
			continue;
		}

		const charWidth = ctx.measureText(slot.char).width;
		const centerX = cursorX + charWidth * 0.5;
		const centerY = y + style.fontSize * 0.5;
		const glowPreview = style.replacementGlowPreview === true;
		const mainHidden = isGlitchMainHidden(slot) || (glowPreview && drawLayer !== "snake");

		if (drawMain && !mainHidden) {
			const mainAlpha = getGlitchMainDrawAlpha(slot) * layerMainOpacity;
			if (mainAlpha > 0.001) {
				ctx.save();
				ctx.globalAlpha = mainAlpha;
				ctx.shadowBlur = 0;
				ctx.fillStyle = style.color;
				ctx.fillText(slot.char, cursorX, y);
				if (slot.hoverPassed && (style.passedLetterHighlightAlpha ?? 0) > 0.001) {
					ctx.globalAlpha = mainAlpha * style.passedLetterHighlightAlpha;
					ctx.fillStyle = "#ffffff";
					ctx.fillText(slot.char, cursorX, y);
				}
				ctx.restore();
			}
		}

		slot.replacements.forEach((replacement, index) => {
			if (!drawSnake) {
				return;
			}

			const replacementVisible = isGlitchReplacementVisible(slot, index) || (glowPreview && index === 0);
			if (!replacementVisible) {
				return;
			}

			const metrics = profile.resolveReplacementMetrics
				? profile.resolveReplacementMetrics(slot.char)
				: {
						scaleX: profile.replacementScaleX ?? 1,
						scaleY: profile.replacementScaleY ?? 1,
						offsetYEm: profile.replacementOffsetYEm ?? 0.12,
					};

			const displayChar = profile.resolveReplacementDisplayChar
				? profile.resolveReplacementDisplayChar(replacement, slot.char)
				: replacement;

			ctx.save();
			ctx.translate(centerX, centerY);
			const flip = profile.replacementFlipAxes !== false;
			const scaleSign = flip ? -1 : 1;
			ctx.scale(scaleSign * metrics.scaleX, scaleSign * metrics.scaleY);
			drawReplacementLetter(
				ctx,
				displayChar,
				style.fontSize,
				{
					fontFamily: profile.replacementFontFamily ?? mainFontFamily,
					fontWeight: profile.replacementFontWeight ?? style.fontWeight,
					offsetYEm: metrics.offsetYEm,
					scaleX: metrics.scaleX,
					scaleY: metrics.scaleY,
				},
				glow,
				replacementColor,
				shadowColor,
				replacementAlpha,
			);
			ctx.restore();
		});

		cursorX += charWidth + letterSpacingPx;
	}
}

/**
 * HUD-режим: padding + одна строка (совместимость с drawCanvasGlitchText).
 */
export function drawCanvasGlitchText(ctx, slots, style, drawOptions = {}) {
	drawGlitchTextLine(
		ctx,
		slots,
		style.paddingLeft ?? 24,
		style.paddingTop ?? 12,
		{ ...style, drawProfile: style.drawProfile ?? "hud" },
		drawOptions,
	);
}

/** Hero-режим: одна строка с произвольным x/y (совместимость с drawHeroGlitchLine). */
export function drawHeroGlitchLine(ctx, slots, x, y, style) {
	drawGlitchTextLine(ctx, slots, x, y, { ...style, drawProfile: "hero" }, { clear: false });
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('./glitchSnakeEngine.js').GlitchLetterSlot[]} slots
 * @param {GlitchTextDrawStyle} style
 */
export function measureGlitchTextSize(ctx, slots, style) {
	const profile = getGlitchDrawProfile(style.drawProfile ?? "hud");
	const letterSpacingPx = style.fontSize * style.letterSpacing;
	const glowStrength = style.replacementGlowStrength ?? profile.replacementGlowStrength ?? 1;
	const { blur: replacementShadowBlur } = resolveReplacementGlowMetrics(style.fontSize, glowStrength);
	const mainFontFamily = style.fontFamily ?? profile.mainFontFamily;
	const font = `${style.fontWeight} ${style.fontSize}px ${mainFontFamily}`;
	ctx.font = font;

	const paddingLeft = style.paddingLeft ?? 24;
	const paddingRight = style.paddingRight ?? 24;
	const paddingTop = style.paddingTop ?? 12;
	const paddingBottom = style.paddingBottom ?? 12;

	let width = paddingLeft + paddingRight;
	let maxReplacementOverflow = 0;

	for (const slot of slots) {
		if (slot.isSpace) {
			width += style.fontSize * SPACE_WIDTH_EM;
			continue;
		}

		const charWidth = ctx.measureText(slot.char).width;
		width += charWidth + letterSpacingPx;

		for (const replacement of slot.replacements) {
			ctx.font = `${profile.replacementFontWeight} ${style.fontSize}px ${profile.replacementFontFamily}`;
			maxReplacementOverflow = Math.max(maxReplacementOverflow, ctx.measureText(replacement).width);
		}
		ctx.font = font;
	}

	if (slots.length > 0) {
		width -= letterSpacingPx;
	}

	width += maxReplacementOverflow * 0.5;

	const glowPadding = replacementShadowBlur * 1.6;
	const height = paddingTop + paddingBottom + style.fontSize + glowPadding;

	return {
		width: Math.ceil(width),
		height: Math.ceil(height),
	};
}

/** @deprecated — используйте measureGlitchTextSize */
export const measureCanvasGlitchTextSize = measureGlitchTextSize;
