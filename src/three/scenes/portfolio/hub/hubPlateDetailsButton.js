import * as THREE from "three";
import { portfolioHubPlatesConfig } from "./portfolioHubConfig.js";
import { getPortfolioLocale, getPortfolioViewCaseButtonLabel } from "@/i18n/portfolioProjectsCopy.js";
import { normalizeSiteLocale, SITE_LOCALES } from "@/utils/siteLocale.js";
import { playSound, HUB_PLATE_HOVER_GLITCH_GAIN } from "../../../../sounds/soundDesign.js";
import { applyHubPlateLabelBlurUniforms, applyHubPlateLabelGlitchUniforms, applyHubPlateLabelRevealUniforms, createHubPlateDetailsTextMaterial, applyHubPlateDetailsBloomUniforms } from "./hubPlateDetailsTextMaterial.js";
import { createHubScreenSnakeTextMaterial, applyHubScreenSnakeUniforms, applyHubScreenSnakeOpacity } from "./screenTitle/hubScreenSnakeTextMaterial.js";
import { createGlitchTextSlots } from "@/shared/glitchText/glitchLetterModel.js";
import { GlitchSnakeEngine } from "@/shared/glitchText/glitchSnakeEngine.js";
import { drawGlitchTextLine } from "@/shared/glitchText/drawGlitchText.js";
import { HeroTextGlitchController } from "@/three/scenes/home/heroText/HeroTextGlitchController.js";
import { getHeroGlitchSnakeRunOptions } from "@/three/scenes/home/heroText/heroTextGlitchConfig.js";
import { getPortfolioHubGlitchConfig } from "./portfolioHubGlitchConfig.js";

const MIN_CANVAS_WIDTH = 200;
const MIN_CANVAS_HEIGHT = 80;

const DEFAULT_COLOR = "#7cc5fe";
const DEFAULT_TEXT = "СМОТРЕТЬ КЕЙС";
const DETAILS_FONT_FAMILY = 'ManifoldExtended, "Segoe UI", sans-serif';
const GLITCH_SPACE_WIDTH_EM = 0.35;
const DETAILS_SLOT_DEFS = [
	{ id: "back", z: (depth) => -depth * 0.5 },
	{
		id: "frontFloat",
		z: (depth) => depth * 0.5,
		floatFromFront: true,
	},
];

const DETAILS_FONT_SPEC = "600 30px ManifoldExtended";
let detailsFontPromise = null;

/** Шрифт должен быть загружен до measure/draw — иначе кириллица меряется уже и canvas обрезает текст. */
function ensureDetailsFont() {
	if (detailsFontPromise) {
		return detailsFontPromise;
	}

	detailsFontPromise = (async () => {
		if (typeof document === "undefined") {
			return;
		}

		try {
			if (document.fonts?.load) {
				await document.fonts.load(DETAILS_FONT_SPEC);
			}

			if (document.fonts?.ready) {
				await document.fonts.ready;
			}
		} catch {
			// Fallback на системный шрифт в canvas.
		}
	})();

	return detailsFontPromise;
}

function measureTextWithSpacing(ctx, text, letterSpacingPx) {
	let width = 0;
	for (let index = 0; index < text.length; index += 1) {
		width += ctx.measureText(text[index]).width;
		if (index < text.length - 1) {
			width += letterSpacingPx;
		}
	}
	return width;
}

function fillTextWithSpacing(ctx, text, x, y, letterSpacingPx) {
	let cursorX = x;

	for (let index = 0; index < text.length; index += 1) {
		const char = text[index];
		ctx.fillText(char, cursorX, y);
		cursorX += ctx.measureText(char).width + letterSpacingPx;
	}
}

function fillTextWithSpacingRight(ctx, text, rightX, y, letterSpacingPx) {
	const totalWidth = measureTextWithSpacing(ctx, text, letterSpacingPx);
	fillTextWithSpacing(ctx, text, rightX - totalWidth, y, letterSpacingPx);
}

function getArrowWidth(size, lineWidth = 1.4) {
	return size * 0.78 + lineWidth;
}

/**
 * Стрелка: контур chevron + залитый треугольник в острие (цвет стрелки).
 */
function drawChevronArrow(ctx, tipX, centerY, size, color, buttonCfg) {
	const glow = buttonCfg.arrowGlow ?? 5;
	const lineWidth = buttonCfg.arrowLineWidth ?? 3;
	const spread = size * 0.36;
	const depth = size * 0.78;
	const baseX = tipX - depth;

	// Заливка — треугольник в «рот» chevron (настройки в arrowTriangle).
	const tri = buttonCfg.arrowTriangle ?? {};
	const triangleInset = depth * (tri.inset ?? 0.36);
	const innerDepth = depth * (tri.depth ?? 0.36);
	const innerSpread = spread * (tri.spread ?? 0.36);
	const triangleOffsetX = tri.offsetX ?? -5;
	const innerTipX = tipX - triangleInset + triangleOffsetX;
	const innerBaseX = innerTipX - innerDepth;

	ctx.save();
	ctx.lineCap = "round";
	ctx.lineJoin = "round";
	ctx.strokeStyle = color;

	const chevronPath = () => {
		ctx.beginPath();
		ctx.moveTo(baseX, centerY - spread);
		ctx.lineTo(tipX, centerY);
		ctx.lineTo(baseX, centerY + spread);
	};

	const innerTrianglePath = () => {
		ctx.beginPath();
		ctx.moveTo(innerTipX, centerY);
		ctx.lineTo(innerBaseX, centerY - innerSpread);
		ctx.lineTo(innerBaseX, centerY + innerSpread);
		ctx.closePath();
	};

	if (glow > 0) {
		ctx.globalAlpha = Math.min(0.55, 0.16 + glow * 0.04);
		ctx.lineWidth = lineWidth + glow * 0.45;
		chevronPath();
		ctx.stroke();

		ctx.fillStyle = color;
		ctx.globalAlpha = Math.min(0.42, 0.1 + glow * 0.035);
		innerTrianglePath();
		ctx.fill();
	}

	ctx.globalAlpha = 1;
	ctx.lineWidth = lineWidth;
	chevronPath();
	ctx.stroke();

	ctx.fillStyle = color;
	innerTrianglePath();
	ctx.fill();

	ctx.restore();
}

function resolveDetailsButtonDisplayText(text, locale) {
	if (normalizeSiteLocale(locale) === "zh") {
		return String(text);
	}

	return String(text).toUpperCase();
}

function resolveDetailsButtonCfg(buttonCfg = {}, locale = getPortfolioLocale()) {
	const normalizedLocale = normalizeSiteLocale(locale);

	return {
		...buttonCfg,
		text: getPortfolioViewCaseButtonLabel(normalizedLocale),
		_locale: normalizedLocale,
	};
}

/** Максимальный размер canvas кнопки по всем языкам — без артефактов при смене locale. */
async function measureWidestDetailsButtonCanvas(buttonCfg = {}) {
	await ensureDetailsFont();

	const measureCanvas = document.createElement("canvas");
	measureCanvas.width = 1;
	measureCanvas.height = 1;
	const measureCtx = measureCanvas.getContext("2d");

	if (!measureCtx) {
		return { width: MIN_CANVAS_WIDTH, height: MIN_CANVAS_HEIGHT };
	}

	measureCtx.font = `${buttonCfg.fontWeight ?? 600} ${Math.round(buttonCfg.fontSize ?? 30)}px ManifoldExtended, "Segoe UI", sans-serif`;

	let maxWidth = MIN_CANVAS_WIDTH;
	let maxHeight = MIN_CANVAS_HEIGHT;

	for (const locale of SITE_LOCALES) {
		const localeCfg = {
			...buttonCfg,
			text: getPortfolioViewCaseButtonLabel(locale),
			_locale: locale,
		};
		const metrics = measureDetailsCanvas(measureCtx, localeCfg);
		maxWidth = Math.max(maxWidth, metrics.canvasWidth);
		maxHeight = Math.max(maxHeight, metrics.canvasHeight);
	}

	return {
		width: Math.ceil(maxWidth),
		height: Math.ceil(maxHeight),
	};
}

function resolveHubPlatesCfg(cfg = portfolioHubPlatesConfig, locale = getPortfolioLocale()) {
	return {
		...cfg,
		plateDetailsButton: resolveDetailsButtonCfg(cfg.plateDetailsButton ?? {}, locale),
	};
}

function isDetailsButtonUppercase(locale) {
	return normalizeSiteLocale(locale) !== "zh";
}

function createDetailsGlitchSlots(locale) {
	const normalizedLocale = normalizeSiteLocale(locale);
	return createGlitchTextSlots(getPortfolioViewCaseButtonLabel(normalizedLocale), isDetailsButtonUppercase(normalizedLocale));
}

function getDetailsBloomBoost(buttonCfg = {}) {
	return buttonCfg.textBloomBoost ?? 4;
}

/** HDR-bloom и цвет змейки кнопки — отдельно от textBloomBoost / color. */
function getDetailsSnakeShaderConfig(buttonCfg = {}) {
	const snake = buttonCfg.snake ?? {};
	const hubGlitch = getPortfolioHubGlitchConfig();

	return {
		snakeLetterColor: snake.color ?? hubGlitch.snakeLetterColor,
		snakeBloomBoost: snake.bloomBoost ?? hubGlitch.snakeBloomBoost ?? 4,
	};
}

/** Профиль отрисовки glitch-символов змейки (цвет/scale — отдельно от синего текста кнопки). */
function resolveDetailsButtonSnakeProfile(buttonCfg = {}) {
	const snake = buttonCfg.snake ?? {};
	const hubGlitch = getPortfolioHubGlitchConfig();
	const letterScale = snake.letterScale ?? hubGlitch.snakeLetterScale ?? 0.88;

	return {
		mainFontFamily: DETAILS_FONT_FAMILY,
		replacementFontFamily: DETAILS_FONT_FAMILY,
		replacementFontWeight: snake.letterFontWeight ?? hubGlitch.snakeLetterFontWeight ?? 600,
		replacementOffsetYEm: 0.12,
		replacementScaleX: letterScale,
		replacementScaleY: letterScale,
		replacementColor: snake.color ?? hubGlitch.snakeLetterColor,
		replacementGlowStrength: 0,
	};
}

function getDetailsGlitchDrawStyle(buttonCfg) {
	const fontSize = Math.round(buttonCfg.fontSize ?? 30);

	return {
		fontSize,
		fontWeight: buttonCfg.fontWeight ?? 600,
		letterSpacing: buttonCfg.letterSpacing ?? 0.1,
		color: buttonCfg.color ?? DEFAULT_COLOR,
		fontFamily: DETAILS_FONT_FAMILY,
		snakeProfile: resolveDetailsButtonSnakeProfile(buttonCfg),
	};
}

function measureGlitchSlotsWidth(ctx, slots, style) {
	const letterSpacingPx = style.fontSize * style.letterSpacing;
	ctx.font = `${style.fontWeight} ${style.fontSize}px ${style.fontFamily ?? DETAILS_FONT_FAMILY}`;

	let width = 0;

	for (let index = 0; index < slots.length; index += 1) {
		const slot = slots[index];

		if (slot.isSpace) {
			width += style.fontSize * GLITCH_SPACE_WIDTH_EM;
			continue;
		}

		width += ctx.measureText(slot.char).width;

		if (index < slots.length - 1) {
			width += letterSpacingPx;
		}
	}

	return width;
}

function drawDetailsGlitchGroups(ctx, controller, textRightX, baseY, style, drawOptions = {}) {
	const groups = [...controller.primaryGroups, ...(controller.secondaryGroups ?? [])];
	const layer = drawOptions.layer ?? "both";

	for (const group of groups) {
		const lineWidth = measureGlitchSlotsWidth(ctx, group.slots, style);
		drawGlitchTextLine(ctx, group.slots, textRightX - lineWidth, baseY, style, {
			clear: false,
			layer,
		});
	}
}

function clearDetailsSnakeTexture(snakeTexture) {
	const canvas = snakeTexture?.image;
	if (!(canvas instanceof HTMLCanvasElement)) {
		return;
	}

	const ctx = canvas.getContext("2d");
	if (!ctx) {
		return;
	}

	ctx.clearRect(0, 0, canvas.width, canvas.height);
	snakeTexture.needsUpdate = true;
}

function createDetailsSnakeTexture(stableSize = null) {
	const canvas = document.createElement("canvas");
	canvas.width = stableSize?.width ?? MIN_CANVAS_WIDTH;
	canvas.height = stableSize?.height ?? MIN_CANVAS_HEIGHT;

	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.minFilter = THREE.LinearFilter;
	texture.magFilter = THREE.LinearFilter;
	texture.needsUpdate = true;
	return texture;
}

function getDetailsPaintLayout(metrics, canvasWidth, canvasHeight, buttonCfg, options = {}) {
	const baseY = canvasHeight - metrics.paddingBottom - metrics.fontSize * 0.82;
	const arrowShift = Math.max(0, Math.min(metrics.arrowHoverOffset, options.arrowOffsetPx ?? 0));
	const arrowBaseTipX = canvasWidth - metrics.paddingRight - metrics.arrowHoverOffset;
	const arrowTipX = arrowBaseTipX + arrowShift;
	const textRightX = arrowBaseTipX - getArrowWidth(metrics.arrowSize, buttonCfg.arrowLineWidth ?? 1.4) - metrics.arrowGap;
	const textCenterY = baseY + metrics.fontSize * 0.48;

	return {
		baseY,
		arrowTipX,
		textRightX,
		textCenterY,
	};
}

function paintDetailsLocaleSwitchFrame(texture, snakeTexture, buttonCfg, stableSize, options, controller) {
	const measureCanvas = document.createElement("canvas");
	measureCanvas.width = 1;
	measureCanvas.height = 1;
	const measureCtx = measureCanvas.getContext("2d");

	if (!measureCtx || !controller) {
		return null;
	}

	const metrics = measureDetailsCanvas(measureCtx, buttonCfg);
	const canvasWidth = stableSize?.width ?? metrics.canvasWidth;
	const canvasHeight = stableSize?.height ?? metrics.canvasHeight;
	const canvas = texture.image instanceof HTMLCanvasElement ? texture.image : document.createElement("canvas");
	canvas.width = canvasWidth;
	canvas.height = canvasHeight;

	const ctx = canvas.getContext("2d");
	if (!ctx) {
		return null;
	}

	ctx.clearRect(0, 0, canvas.width, canvas.height);

	const layout = getDetailsPaintLayout(metrics, canvasWidth, canvasHeight, buttonCfg, options);
	const style = getDetailsGlitchDrawStyle(buttonCfg);
	drawDetailsGlitchGroups(ctx, controller, layout.textRightX, layout.baseY, style, { layer: "main" });
	drawChevronArrow(ctx, layout.arrowTipX, layout.textCenterY, metrics.arrowSize, metrics.color, buttonCfg);

	if (snakeTexture) {
		const snakeCanvas = snakeTexture.image instanceof HTMLCanvasElement ? snakeTexture.image : document.createElement("canvas");
		if (!(snakeTexture.image instanceof HTMLCanvasElement)) {
			snakeCanvas.width = canvasWidth;
			snakeCanvas.height = canvasHeight;
			snakeTexture.image = snakeCanvas;
		} else if (snakeCanvas.width !== canvasWidth || snakeCanvas.height !== canvasHeight) {
			snakeCanvas.width = canvasWidth;
			snakeCanvas.height = canvasHeight;
		}

		const snakeCtx = snakeCanvas.getContext("2d");
		if (snakeCtx) {
			snakeCtx.clearRect(0, 0, snakeCanvas.width, snakeCanvas.height);
			drawDetailsGlitchGroups(snakeCtx, controller, layout.textRightX, layout.baseY, style, { layer: "snake" });
		}

		snakeTexture.needsUpdate = true;
	}

	if (!(texture.image instanceof HTMLCanvasElement)) {
		texture.image = canvas;
	}

	texture.needsUpdate = true;

	return {
		canvasWidth,
		canvasHeight,
	};
}

function initDetailsGlitchState(entry, locale) {
	abortDetailsLocaleSwitch(entry);

	const slots = createDetailsGlitchSlots(locale);
	entry.glitchSlots = slots;

	if (!entry.glitchEngine) {
		entry.glitchEngine = new GlitchSnakeEngine(() => {});
	} else {
		entry.glitchEngine.abort();
	}

	entry.glitchEngine.setSlots(slots);
}

function abortDetailsLocaleSwitch(entry) {
	entry.localeSwitchController?.dispose?.();
	entry.localeSwitchController = null;
}

function getArrowHoverOffset(buttonCfg) {
	return Math.max(0, buttonCfg.arrowHoverOffset ?? 8);
}

function measureDetailsCanvas(ctx, buttonCfg) {
	const color = buttonCfg.color ?? DEFAULT_COLOR;
	const text = resolveDetailsButtonDisplayText(buttonCfg.text ?? DEFAULT_TEXT, buttonCfg._locale ?? getPortfolioLocale());
	const fontSize = Math.round(buttonCfg.fontSize ?? 30);
	const fontWeight = buttonCfg.fontWeight ?? 600;
	const letterSpacing = fontSize * (buttonCfg.letterSpacing ?? 0.1);
	const paddingRight = buttonCfg.canvasPaddingRight ?? 16;
	const paddingBottom = buttonCfg.canvasPaddingBottom ?? 18;
	const paddingLeft = buttonCfg.canvasPaddingLeft ?? 12;
	const topPad = buttonCfg.canvasTopPad ?? 8;
	const arrowGap = buttonCfg.arrowGap ?? 12;
	const arrowSize = buttonCfg.arrowSize ?? 14;
	const arrowGlow = buttonCfg.arrowGlow ?? 5;
	const arrowLineWidth = buttonCfg.arrowLineWidth ?? 1.4;
	const arrowHoverOffset = getArrowHoverOffset(buttonCfg);
	const arrowPad = Math.ceil(Math.max(8, arrowGlow * 0.55 + arrowLineWidth * 2));

	ctx.font = `${fontWeight} ${fontSize}px ManifoldExtended, "Segoe UI", sans-serif`;
	const textWidth = measureTextWithSpacing(ctx, text, letterSpacing);
	const arrowWidth = getArrowWidth(arrowSize, arrowLineWidth);
	const contentWidth = textWidth + arrowGap + arrowWidth + arrowHoverOffset;
	const contentHeight = fontSize * (buttonCfg.lineHeight ?? 1.25);

	const canvasWidth = Math.max(MIN_CANVAS_WIDTH, Math.ceil(paddingLeft + contentWidth + paddingRight + arrowPad));
	const canvasHeight = Math.max(MIN_CANVAS_HEIGHT, Math.ceil(topPad + contentHeight + paddingBottom + arrowPad));

	return {
		canvasWidth,
		canvasHeight,
		text,
		fontSize,
		fontWeight,
		letterSpacing,
		paddingRight,
		paddingBottom,
		arrowGap,
		arrowSize,
		arrowHoverOffset,
		color,
	};
}

function drawDetailsCanvas(buttonCfg = {}, options = {}, targetCanvas = null, stableSize = null) {
	const measureCanvas = document.createElement("canvas");
	measureCanvas.width = 1;
	measureCanvas.height = 1;
	const measureCtx = measureCanvas.getContext("2d");

	if (!measureCtx) {
		const fallback = targetCanvas ?? document.createElement("canvas");
		fallback.width = stableSize?.width ?? MIN_CANVAS_WIDTH;
		fallback.height = stableSize?.height ?? MIN_CANVAS_HEIGHT;
		return {
			canvas: fallback,
			canvasWidth: fallback.width,
			canvasHeight: fallback.height,
		};
	}

	const metrics = measureDetailsCanvas(measureCtx, buttonCfg);
	const canvasWidth = stableSize?.width ?? metrics.canvasWidth;
	const canvasHeight = stableSize?.height ?? metrics.canvasHeight;
	const canvas = targetCanvas ?? document.createElement("canvas");
	canvas.width = canvasWidth;
	canvas.height = canvasHeight;

	const ctx = canvas.getContext("2d");
	if (!ctx) {
		return { canvas, canvasWidth, canvasHeight };
	}

	ctx.clearRect(0, 0, canvas.width, canvas.height);

	const layout = getDetailsPaintLayout(metrics, canvasWidth, canvasHeight, buttonCfg, options);

	ctx.font = `${metrics.fontWeight} ${metrics.fontSize}px ${DETAILS_FONT_FAMILY}`;
	ctx.textBaseline = "top";
	ctx.textAlign = "left";
	ctx.fillStyle = metrics.color;

	fillTextWithSpacingRight(ctx, metrics.text, layout.textRightX, layout.baseY, metrics.letterSpacing);

	drawChevronArrow(ctx, layout.arrowTipX, layout.textCenterY, metrics.arrowSize, metrics.color, buttonCfg);

	return {
		canvas,
		canvasWidth,
		canvasHeight,
	};
}

/** Видимая область текста + стрелки на canvas (px) — для HUD-точек курсора. */
function getDetailsContentBoundsPx(ctx, buttonCfg, canvasWidth, canvasHeight, arrowOffsetPx = 0) {
	const metrics = measureDetailsCanvas(ctx, buttonCfg);
	const cw = canvasWidth ?? metrics.canvasWidth;
	const ch = canvasHeight ?? metrics.canvasHeight;
	const lineHeight = buttonCfg.lineHeight ?? 1.25;
	const arrowLineWidth = buttonCfg.arrowLineWidth ?? 1.4;

	ctx.font = `${metrics.fontWeight} ${metrics.fontSize}px ManifoldExtended, "Segoe UI", sans-serif`;
	const textWidth = measureTextWithSpacing(ctx, metrics.text, metrics.letterSpacing);
	const arrowWidth = getArrowWidth(metrics.arrowSize, arrowLineWidth);
	const boundsPad = Math.ceil(Math.max(8, (buttonCfg.arrowGlow ?? 5) * 0.55 + arrowLineWidth * 2));

	const baseY = ch - metrics.paddingBottom - metrics.fontSize * 0.82;
	const arrowBaseTipX = cw - metrics.paddingRight - metrics.arrowHoverOffset;
	const arrowTipX = arrowBaseTipX + Math.max(0, Math.min(arrowOffsetPx, metrics.arrowHoverOffset));
	const textRightX = arrowBaseTipX - arrowWidth - metrics.arrowGap;
	const textLeftX = textRightX - textWidth;
	const textBottom = baseY + metrics.fontSize * lineHeight;
	const arrowCenterY = baseY + metrics.fontSize * 0.48;
	const arrowHalf = metrics.arrowSize * 0.42;
	const visualBottom = Math.max(textBottom, arrowCenterY + arrowHalf);
	const topLift = buttonCfg.cursorPointsTopLiftPx ?? 8;

	return {
		left: Math.max(0, textLeftX - boundsPad * 0.3),
		top: Math.max(0, baseY - boundsPad * 0.35 - topLift),
		right: Math.min(cw, arrowTipX + boundsPad * 0.25),
		bottom: Math.min(ch, visualBottom + boundsPad * 0.25),
	};
}

function canvasPointToPlaneLocal(px, py, canvasWidth, canvasHeight, planeWidth, planeHeight, flipY = true) {
	const u = px / canvasWidth;
	const v = flipY ? 1 - py / canvasHeight : py / canvasHeight;

	return new THREE.Vector3((u - 0.5) * planeWidth, (v - 0.5) * planeHeight, 0);
}

function updateDetailsTexture(texture, buttonCfg, options = {}, stableSize = null) {
	const existingCanvas = texture.image instanceof HTMLCanvasElement ? texture.image : null;
	const { canvas, canvasWidth, canvasHeight } = drawDetailsCanvas(buttonCfg, options, existingCanvas, stableSize);

	if (!existingCanvas) {
		texture.image = canvas;
	}

	texture.needsUpdate = true;
	return { canvasWidth, canvasHeight };
}

function createDetailsTexture(buttonCfg, stableSize = null) {
	const { canvas } = drawDetailsCanvas(buttonCfg, {}, null, stableSize);
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.minFilter = THREE.LinearFilter;
	texture.magFilter = THREE.LinearFilter;
	texture.needsUpdate = true;
	return texture;
}

function getDetailsLayout(buttonCfg, cfg, canvasWidth, canvasHeight) {
	const aspect = canvasWidth / Math.max(canvasHeight, 1);
	let labelHeight = buttonCfg.height ?? 0.5;
	let labelWidth = labelHeight * aspect;
	const half = cfg.plateSize * 0.5;
	const depthHalf = cfg.depth * 0.5;
	const marginX = buttonCfg.marginX ?? 0.1;
	const marginY = buttonCfg.marginY ?? 0.1;
	const zOffset = buttonCfg.zOffset ?? 0;
	const maxLabelWidth = Math.max(0.12, cfg.plateSize - marginX * 2);

	if (labelWidth > maxLabelWidth) {
		const fitScale = maxLabelWidth / labelWidth;
		labelWidth = maxLabelWidth;
		labelHeight *= fitScale;
	}

	return {
		labelWidth,
		labelHeight,
		canvasWidth,
		canvasHeight,
		x: half - marginX - labelWidth * 0.5,
		y: -half + marginY + labelHeight * 0.5,
		frontZ: depthHalf + zOffset,
	};
}

function getLayerOpacity(buttonCfg, slotId) {
	const layer = buttonCfg.layers?.[slotId] ?? {};
	return layer.opacity ?? (slotId === "frontFloat" ? 1 : 0.035);
}

function getLayerBlur(cfg, slotId) {
	return slotId === "back" ? (cfg.hudBackTextBlur ?? 0.5) : 0;
}

function getLayerPosition(layout, cfg, buttonCfg, slot, hoverLift = 0) {
	const zOffset = buttonCfg.zOffset ?? 0;
	const z = slot.z(cfg.depth, buttonCfg, cfg) + zOffset + (slot.floatFromFront ? hoverLift : 0);
	return new THREE.Vector3(layout.x, layout.y, z);
}

function createInvisibleHitMaterial() {
	return new THREE.MeshBasicMaterial({
		transparent: true,
		opacity: 0,
		depthWrite: false,
	});
}

function getDetailsHitGeometry(layout, cfg) {
	const hitCfg = cfg.interaction?.hoverMotion?.hitAreas?.details ?? {};
	const scaleX = hitCfg.scaleX ?? 1;
	const scaleY = hitCfg.scaleY ?? 1;
	return new THREE.PlaneGeometry(layout.labelWidth * scaleX, layout.labelHeight * scaleY);
}

function applyDetailsSnakeOpacityToEntry(entry, buttonCfg, revealAlpha = 1) {
	const baseOpacity = buttonCfg.opacity ?? 1;

	for (let index = 0; index < (entry.snakePlanes?.length ?? 0); index += 1) {
		const snakePlane = entry.snakePlanes[index];
		const slotId = snakePlane.userData.detailsSlot?.id;
		const layerOpacity = getLayerOpacity(buttonCfg, slotId);
		applyHubScreenSnakeOpacity(snakePlane.material, baseOpacity * layerOpacity * revealAlpha);
	}
}

function applyDetailsBloomToEntry(entry, buttonCfg) {
	const mainBloom = getDetailsBloomBoost(buttonCfg);
	const snakeCfg = getDetailsSnakeShaderConfig(buttonCfg);

	for (const material of entry.materials ?? []) {
		applyHubPlateDetailsBloomUniforms(material, mainBloom);
	}

	for (const material of entry.snakeMaterials ?? []) {
		applyHubScreenSnakeUniforms(material, snakeCfg);
	}
}

function createDetailsGroup(projectIndex, cfg, stableSize = null) {
	const buttonCfg = cfg.plateDetailsButton ?? {};
	if (buttonCfg.enabled === false) {
		return null;
	}

	const { canvasWidth, canvasHeight } = drawDetailsCanvas(buttonCfg, {}, null, stableSize);
	const texture = createDetailsTexture(buttonCfg, stableSize);
	const snakeTexture = createDetailsSnakeTexture(stableSize);
	const layout = getDetailsLayout(buttonCfg, cfg, canvasWidth, canvasHeight);
	const geometry = new THREE.PlaneGeometry(layout.labelWidth, layout.labelHeight);
	const planes = [];
	const snakePlanes = [];
	const materials = [];
	const snakeMaterials = [];

	const hitGeometry = getDetailsHitGeometry(layout, cfg);
	const hitMaterial = createInvisibleHitMaterial();
	const hitArea = new THREE.Mesh(hitGeometry, hitMaterial);
	hitArea.name = `hubPlateDetailsHitArea_${projectIndex}`;

	const group = new THREE.Group();
	group.name = `hubPlateDetails_${projectIndex}`;
	group.visible = false;

	for (const slot of DETAILS_SLOT_DEFS) {
		const material = createHubPlateDetailsTextMaterial(texture, {
			opacity: 0,
			bloomBoost: getDetailsBloomBoost(buttonCfg),
			revealSeed: projectIndex * 0.11 + 0.62,
			reveal: buttonCfg.reveal,
			blur: getLayerBlur(cfg, slot.id),
			blurStep: new THREE.Vector2(1 / canvasWidth, 1 / canvasHeight),
		});
		const plane = new THREE.Mesh(geometry, material);
		const baseRenderOrder = slot.floatFromFront ? 6 : 4;
		plane.renderOrder = baseRenderOrder;
		plane.name = `hubPlateDetailsPlane_${slot.id}_${projectIndex}`;
		plane.raycast = () => {};
		plane.userData.detailsSlot = slot;
		plane.position.copy(getLayerPosition(layout, cfg, buttonCfg, slot));

		const snakeMaterial = createHubScreenSnakeTextMaterial(snakeTexture);
		applyHubScreenSnakeUniforms(snakeMaterial, getDetailsSnakeShaderConfig(buttonCfg));
		const snakePlane = new THREE.Mesh(geometry, snakeMaterial);
		snakePlane.renderOrder = baseRenderOrder + 1;
		snakePlane.name = `hubPlateDetailsSnakePlane_${slot.id}_${projectIndex}`;
		snakePlane.raycast = () => {};
		snakePlane.userData.detailsSlot = slot;
		snakePlane.position.copy(plane.position);

		planes.push(plane);
		snakePlanes.push(snakePlane);
		materials.push(material);
		snakeMaterials.push(snakeMaterial);
		group.add(plane);
		group.add(snakePlane);

		applyHubPlateLabelRevealUniforms(material.uniforms, 0, { entering: false }, buttonCfg.reveal);
		applyHubScreenSnakeOpacity(snakeMaterial, 0);
	}

	const frontFloat = planes.find((plane) => plane.userData.detailsSlot?.floatFromFront) ?? planes[0];
	hitArea.position.copy(frontFloat.position);
	group.add(hitArea);

	return {
		group,
		texture,
		snakeTexture,
		plane: frontFloat,
		planes,
		snakePlanes,
		hitArea,
		hitGeometry,
		hitMaterial,
		material: frontFloat.material,
		materials,
		snakeMaterials,
		geometry,
		canvasWidth,
		canvasHeight,
		basePlaneZ: frontFloat.position.z,
		glitchStartedAt: 0,
		glitchDurationMs: buttonCfg.shaderGlitch?.durationMs ?? 260,
		glitchActive: false,
		arrowHover: 0,
		lastArrowOffsetPx: 0,
		glitchEngine: null,
		glitchSlots: null,
		localeSwitchController: null,
	};
}

function applyDetailsEntry(entry, cfg, stableSize = null) {
	const buttonCfg = cfg.plateDetailsButton ?? {};
	const enabled = buttonCfg.enabled !== false;

	if (!enabled) {
		entry.group.visible = false;
		return;
	}

	const { canvasWidth, canvasHeight } = drawDetailsCanvas(buttonCfg, {}, null, stableSize);
	const layout = getDetailsLayout(buttonCfg, cfg, canvasWidth, canvasHeight);

	updateDetailsTexture(entry.texture, buttonCfg, {}, stableSize);
	clearDetailsSnakeTexture(entry.snakeTexture);
	entry.arrowHover = 0;
	entry.lastArrowOffsetPx = 0;
	const canvasSizeChanged = entry.canvasWidth !== canvasWidth || entry.canvasHeight !== canvasHeight;
	entry.canvasWidth = canvasWidth;
	entry.canvasHeight = canvasHeight;

	const geometryMismatch =
		Math.abs(entry.geometry.parameters.width - layout.labelWidth) > 0.0001 ||
		Math.abs(entry.geometry.parameters.height - layout.labelHeight) > 0.0001;

	if (canvasSizeChanged || geometryMismatch) {
		entry.geometry.dispose();
		entry.geometry = new THREE.PlaneGeometry(layout.labelWidth, layout.labelHeight);
		for (const plane of entry.planes) {
			plane.geometry = entry.geometry;
		}
		for (const plane of entry.snakePlanes ?? []) {
			plane.geometry = entry.geometry;
		}
	}

	const hitCfg = cfg.interaction?.hoverMotion?.hitAreas?.details ?? {};
	const hitWidth = layout.labelWidth * (hitCfg.scaleX ?? 1);
	const hitHeight = layout.labelHeight * (hitCfg.scaleY ?? 1);
	if (Math.abs(entry.hitGeometry.parameters.width - hitWidth) > 0.0001 || Math.abs(entry.hitGeometry.parameters.height - hitHeight) > 0.0001) {
		entry.hitGeometry?.dispose?.();
		entry.hitGeometry = new THREE.PlaneGeometry(hitWidth, hitHeight);
		entry.hitArea.geometry = entry.hitGeometry;
	}

	const hoverLift = entry.plane.position.z - (entry.basePlaneZ ?? entry.plane.position.z);
	for (let index = 0; index < entry.planes.length; index += 1) {
		const plane = entry.planes[index];
		const snakePlane = entry.snakePlanes?.[index];
		const slot = plane.userData.detailsSlot;
		const position = getLayerPosition(layout, cfg, buttonCfg, slot, slot.floatFromFront ? hoverLift : 0);
		plane.position.copy(position);
		snakePlane?.position.copy(position);
		applyHubPlateLabelBlurUniforms(plane.material.uniforms, getLayerBlur(cfg, slot.id), new THREE.Vector2(1 / canvasWidth, 1 / canvasHeight));
	}
	const frontFloat = entry.planes.find((plane) => plane.userData.detailsSlot?.floatFromFront) ?? entry.planes[0];
	entry.plane = frontFloat;
	entry.material = frontFloat.material;
	entry.basePlaneZ = getLayerPosition(layout, cfg, buttonCfg, frontFloat.userData.detailsSlot).z;
	entry.hitArea.position.copy(frontFloat.position);
	applyDetailsBloomToEntry(entry, buttonCfg);
}

/**
 * «Смотреть кейс» + HUD-стрелка на проектных плитах — правый нижний угол.
 */
export class HubPlateDetailsButtons {
	constructor() {
		/** @type {Array<{ plateMesh: THREE.Mesh, projectIndex: number, entry: ReturnType<typeof createDetailsGroup> }>} */
		this.attachments = [];
		this.focusProjectIndex = -1;
		this._locale = getPortfolioLocale();
		this._stableCanvasSize = null;
		/** 0…1 — hover: кнопка выше поверхности плиты. */
		this._detailsHover = 0;
		this._detailsHoverTarget = 0;
		this._boundsMeasureCtx = null;
		this._attachPromise = Promise.resolve();
	}

	_getResolvedCfg(cfg = portfolioHubPlatesConfig) {
		return resolveHubPlatesCfg(cfg, this._locale);
	}

	async _syncStableCanvasSize(cfg = portfolioHubPlatesConfig) {
		const resolvedCfg = this._getResolvedCfg(cfg);
		this._stableCanvasSize = await measureWidestDetailsButtonCanvas(resolvedCfg.plateDetailsButton ?? {});
	}

	/** Обновить подпись кнопки при смене языка (змейка на видимой плите). */
	async updateLocale(locale, cfg = portfolioHubPlatesConfig) {
		const targetLocale = normalizeSiteLocale(locale);

		if (targetLocale === this._locale) {
			return;
		}

		await this._attachPromise;
		await ensureDetailsFont();
		const previousLocale = this._locale;
		await this._syncStableCanvasSize(cfg);

		this._locale = targetLocale;
		const resolvedCfg = this._getResolvedCfg(cfg);
		const buttonCfg = resolvedCfg.plateDetailsButton ?? {};
		const nextText = getPortfolioViewCaseButtonLabel(targetLocale);
		const uppercase = isDetailsButtonUppercase(targetLocale);
		const runOptions = getHeroGlitchSnakeRunOptions({ playSound: false });
		const focused = this._getFocusedAttachment();

		for (const attachment of this.attachments) {
			const isFocusedVisible = focused && attachment === focused && attachment.entry.group.visible;

			if (isFocusedVisible) {
				continue;
			}

			applyDetailsEntry(attachment.entry, resolvedCfg, this._stableCanvasSize);
			initDetailsGlitchState(attachment.entry, targetLocale);
		}

		if (focused?.entry.group.visible) {
			await this._runFocusedLocaleSwitch(focused.entry, buttonCfg, nextText, uppercase, runOptions, previousLocale);
			applyDetailsEntry(focused.entry, resolvedCfg, this._stableCanvasSize);
			initDetailsGlitchState(focused.entry, targetLocale);
		}
	}

	async _runFocusedLocaleSwitch(entry, buttonCfg, nextText, uppercase, runOptions, previousLocale) {
		abortDetailsLocaleSwitch(entry);

		if (!entry.glitchSlots) {
			initDetailsGlitchState(entry, previousLocale);
		}

		if (!entry.glitchEngine) {
			entry.glitchEngine = new GlitchSnakeEngine(() => {});
		}

		entry.glitchEngine.setSlots(entry.glitchSlots);

		const stableSize = this._stableCanvasSize;
		const onRedraw = () => {
			paintDetailsLocaleSwitchFrame(
				entry.texture,
				entry.snakeTexture,
				buttonCfg,
				stableSize,
				{ arrowOffsetPx: entry.lastArrowOffsetPx },
				entry.localeSwitchController,
			);
		};

		// Первый switch: engine создан с пустым onChange — без этого змейка не рисуется.
		entry.glitchEngine.onChange = onRedraw;

		const controller = new HeroTextGlitchController({ uppercase, onRedraw });
		controller.primaryGroups = [{ engine: entry.glitchEngine, slots: entry.glitchSlots }];
		entry.localeSwitchController = controller;

		await controller.runLanguageSwitch([nextText], runOptions);

		const group = controller.primaryGroups[0];
		entry.glitchEngine = group.engine;
		entry.glitchSlots = group.slots;
		entry.localeSwitchController = null;
	}

	_getBoundsMeasureContext() {
		if (this._boundsMeasureCtx || typeof document === "undefined") {
			return this._boundsMeasureCtx;
		}

		const measureCanvas = document.createElement("canvas");
		measureCanvas.width = 1;
		measureCanvas.height = 1;
		this._boundsMeasureCtx = measureCanvas.getContext("2d");
		return this._boundsMeasureCtx;
	}

	_getFocusedAttachment() {
		if (this.focusProjectIndex < 0) {
			return null;
		}

		return this.attachments.find((item) => item.projectIndex === this.focusProjectIndex) ?? null;
	}

	async attachToPlates(plates, cfg = portfolioHubPlatesConfig) {
		const attachTask = (async () => {
			const resolvedCfg = this._getResolvedCfg(cfg);
			this.dispose();
			await ensureDetailsFont();
			await this._syncStableCanvasSize(cfg);

			for (const plate of plates) {
				if (plate.projectIndex < 0 || !plate.mesh) {
					continue;
				}

				const entry = createDetailsGroup(plate.projectIndex, resolvedCfg, this._stableCanvasSize);
				if (!entry) {
					continue;
				}

				plate.mesh.add(entry.group);
				initDetailsGlitchState(entry, this._locale);
				this.attachments.push({ plateMesh: plate.mesh, projectIndex: plate.projectIndex, entry });
			}
		})();

		this._attachPromise = attachTask;
		return attachTask;
	}

	async applyFromConfig(cfg = portfolioHubPlatesConfig) {
		const resolvedCfg = this._getResolvedCfg(cfg);
		await this._syncStableCanvasSize(cfg);

		for (const attachment of this.attachments) {
			applyDetailsEntry(attachment.entry, resolvedCfg, this._stableCanvasSize);
			initDetailsGlitchState(attachment.entry, this._locale);
		}
	}

	/** Dev-панель: цвет / bloom кнопки и змейки без полной пересборки сцены. */
	applyDetailsButtonLive(cfg = portfolioHubPlatesConfig) {
		const resolvedCfg = this._getResolvedCfg(cfg);

		for (const attachment of this.attachments) {
			applyDetailsEntry(attachment.entry, resolvedCfg, this._stableCanvasSize);
		}
	}

	/** Только на активной плите — синхронно с логотипом и подписью. */
	getFocusedPlane() {
		if (this.focusProjectIndex < 0) {
			return null;
		}

		const attachment = this._getFocusedAttachment();
		if (!attachment?.entry.group.visible) {
			return null;
		}

		return attachment.entry.plane;
	}

	getFocusedHitArea() {
		if (this.focusProjectIndex < 0) {
			return null;
		}

		const attachment = this._getFocusedAttachment();
		if (!attachment?.entry.group.visible) {
			return null;
		}

		return attachment.entry.hitArea;
	}

	/** Центр видимой кнопки «Подробнее» в мировых координатах. */
	getFocusedWorldCenter(target = new THREE.Vector3()) {
		const plane = this.getFocusedPlane();
		if (!plane) {
			return null;
		}

		return plane.getWorldPosition(target);
	}

	/** 4 угла видимого контента «Подробнее» в мировых координатах. */
	getFocusedCornerWorldPoints(outTopLeft = new THREE.Vector3(), outTopRight = new THREE.Vector3(), outBottomLeft = new THREE.Vector3(), outBottomRight = new THREE.Vector3()) {
		const plane = this.getFocusedPlane();
		const attachment = this._getFocusedAttachment();
		if (!plane?.geometry?.parameters || !attachment?.entry) {
			return null;
		}

		const measureCtx = this._getBoundsMeasureContext();
		if (!measureCtx) {
			return null;
		}

		const resolvedCfg = this._getResolvedCfg();
		const buttonCfg = resolvedCfg.plateDetailsButton ?? {};
		const { canvasWidth, canvasHeight, lastArrowOffsetPx = 0 } = attachment.entry;
		const bounds = getDetailsContentBoundsPx(measureCtx, buttonCfg, canvasWidth, canvasHeight, lastArrowOffsetPx);

		const { width, height } = plane.geometry.parameters;
		const texture = plane.material?.uniforms?.map?.value;
		const flipY = texture?.flipY !== false;

		outTopLeft.copy(canvasPointToPlaneLocal(bounds.left, bounds.top, canvasWidth, canvasHeight, width, height, flipY));
		outTopRight.copy(canvasPointToPlaneLocal(bounds.right, bounds.top, canvasWidth, canvasHeight, width, height, flipY));
		outBottomLeft.copy(canvasPointToPlaneLocal(bounds.left, bounds.bottom, canvasWidth, canvasHeight, width, height, flipY));
		outBottomRight.copy(canvasPointToPlaneLocal(bounds.right, bounds.bottom, canvasWidth, canvasHeight, width, height, flipY));

		plane.localToWorld(outTopLeft);
		plane.localToWorld(outTopRight);
		plane.localToWorld(outBottomLeft);
		plane.localToWorld(outBottomRight);

		return {
			topLeft: outTopLeft,
			topRight: outTopRight,
			bottomLeft: outBottomLeft,
			bottomRight: outBottomRight,
		};
	}

	setDetailsHover(active) {
		const wasActive = this._detailsHoverTarget > 0;
		this._detailsHoverTarget = active ? 1 : 0;

		if (active && !wasActive) {
			this._startFocusedGlitch();
		}
	}

	_startFocusedGlitch(cfg = portfolioHubPlatesConfig) {
		const resolvedCfg = this._getResolvedCfg(cfg);
		const buttonCfg = resolvedCfg.plateDetailsButton ?? {};
		const glitchCfg = buttonCfg.shaderGlitch ?? {};
		if (glitchCfg.enabled === false) {
			return;
		}

		const attachment = this._getFocusedAttachment();
		if (!attachment?.entry.group.visible) {
			return;
		}

		attachment.entry.glitchStartedAt = performance.now();
		attachment.entry.glitchDurationMs = glitchCfg.durationMs ?? 260;
		attachment.entry.glitchActive = true;
		playSound("glitch_button", undefined, HUB_PLATE_HOVER_GLITCH_GAIN);
		for (const material of attachment.entry.materials) {
			applyHubPlateLabelGlitchUniforms(material.uniforms, 1, 0, glitchCfg);
		}
	}

	_updateFocusedGlitchTexture(cfg = portfolioHubPlatesConfig) {
		const resolvedCfg = this._getResolvedCfg(cfg);
		const buttonCfg = resolvedCfg.plateDetailsButton ?? {};
		const glitchCfg = buttonCfg.shaderGlitch ?? {};
		const attachment = this._getFocusedAttachment();
		if (!attachment?.entry.group.visible || !attachment.entry.glitchActive) {
			return;
		}

		const elapsedMs = performance.now() - attachment.entry.glitchStartedAt;
		const durationMs = Math.max(attachment.entry.glitchDurationMs, 1);
		if (elapsedMs >= durationMs) {
			attachment.entry.glitchActive = false;
			for (const material of attachment.entry.materials) {
				applyHubPlateLabelGlitchUniforms(material.uniforms, 0, elapsedMs / 1000, glitchCfg);
			}
			return;
		}

		const linear = elapsedMs / durationMs;
		const progress = Math.sin(linear * Math.PI);
		for (const material of attachment.entry.materials) {
			applyHubPlateLabelGlitchUniforms(material.uniforms, progress, elapsedMs / 1000, glitchCfg);
		}
	}

	updateHover(delta, cfg = portfolioHubPlatesConfig) {
		const resolvedCfg = this._getResolvedCfg(cfg);
		const duration = resolvedCfg.interaction?.hoverMotion?.smoothDuration ?? 0.22;
		const lift = resolvedCfg.interaction?.hoverMotion?.detailsZLift ?? 0.006;
		const t = 1 - Math.exp(-delta / Math.max(duration, 0.001));
		const arrowDuration = resolvedCfg.plateDetailsButton?.arrowHoverDuration ?? 0.07;
		const arrowT = 1 - Math.exp(-delta / Math.max(arrowDuration, 0.001));

		this._detailsHover += (this._detailsHoverTarget - this._detailsHover) * t;

		if (Math.abs(this._detailsHover - this._detailsHoverTarget) < 0.0005) {
			this._detailsHover = this._detailsHoverTarget;
		}

		const attachment = this._getFocusedAttachment();
		if (!attachment?.entry.group.visible) {
			return;
		}

		const baseZ = attachment.entry.basePlaneZ ?? attachment.entry.plane.position.z;
		const hoverZ = baseZ + lift * this._detailsHover;
		attachment.entry.plane.position.z = hoverZ;
		const frontFloatIndex = attachment.entry.planes.findIndex((plane) => plane.userData.detailsSlot?.floatFromFront);
		if (frontFloatIndex >= 0) {
			attachment.entry.snakePlanes?.[frontFloatIndex]?.position.setZ(hoverZ);
		}
		attachment.entry.hitArea.position.z = hoverZ;
		attachment.entry.arrowHover += (this._detailsHoverTarget - attachment.entry.arrowHover) * arrowT;
		const arrowOffsetPx = getArrowHoverOffset(resolvedCfg.plateDetailsButton ?? {}) * attachment.entry.arrowHover;
		if (!attachment.entry.localeSwitchController && Math.abs(arrowOffsetPx - attachment.entry.lastArrowOffsetPx) > 0.1) {
			const size = updateDetailsTexture(attachment.entry.texture, resolvedCfg.plateDetailsButton ?? {}, {
				arrowOffsetPx,
			}, this._stableCanvasSize);
			if (size) {
				attachment.entry.canvasWidth = size.canvasWidth;
				attachment.entry.canvasHeight = size.canvasHeight;
			}
			attachment.entry.lastArrowOffsetPx = arrowOffsetPx;
		}
		this._updateFocusedGlitchTexture(resolvedCfg);
	}

	setFocusReveal(projectIndex, alpha = 0, revealState = {}, cfg = portfolioHubPlatesConfig) {
		const resolvedCfg = this._getResolvedCfg(cfg);
		const buttonCfg = resolvedCfg.plateDetailsButton ?? {};
		const enabled = buttonCfg.enabled !== false;
		this.focusProjectIndex = projectIndex;

		if (projectIndex < 0) {
			this._detailsHover = 0;
			this._detailsHoverTarget = 0;
		}

		for (const attachment of this.attachments) {
			const isFocused = enabled && attachment.projectIndex === projectIndex && projectIndex >= 0;

			attachment.entry.group.visible = isFocused;

			if (!isFocused) {
				attachment.entry.glitchActive = false;
				attachment.entry.arrowHover = 0;
				attachment.entry.lastArrowOffsetPx = 0;
				updateDetailsTexture(attachment.entry.texture, buttonCfg, {}, this._stableCanvasSize);
				clearDetailsSnakeTexture(attachment.entry.snakeTexture);
				for (const material of attachment.entry.materials) {
					applyHubPlateLabelGlitchUniforms(material.uniforms, 0, 0, buttonCfg.shaderGlitch);
					material.uniforms.opacity.value = 0;
					applyHubPlateLabelRevealUniforms(material.uniforms, 0, { entering: false }, buttonCfg.reveal);
				}
				for (const material of attachment.entry.snakeMaterials ?? []) {
					applyHubScreenSnakeOpacity(material, 0);
				}
				continue;
			}

			for (let index = 0; index < attachment.entry.planes.length; index += 1) {
				const plane = attachment.entry.planes[index];
				const slotId = plane.userData.detailsSlot?.id;
				const layerOpacity = getLayerOpacity(buttonCfg, slotId);
				plane.material.uniforms.opacity.value = (buttonCfg.opacity ?? 1) * layerOpacity;
				applyHubPlateLabelRevealUniforms(plane.material.uniforms, alpha, revealState, buttonCfg.reveal);
			}

			applyDetailsSnakeOpacityToEntry(attachment.entry, buttonCfg, alpha);
		}
	}

	dispose() {
		for (const { plateMesh, entry } of this.attachments) {
			abortDetailsLocaleSwitch(entry);
			entry.glitchEngine?.abort?.();
			plateMesh?.remove(entry.group);
			entry.geometry?.dispose?.();
			entry.hitGeometry?.dispose?.();
			for (const material of entry.materials ?? []) {
				material?.dispose?.();
			}
			for (const material of entry.snakeMaterials ?? []) {
				material?.dispose?.();
			}
			entry.hitMaterial?.dispose?.();
			entry.texture?.dispose?.();
			entry.snakeTexture?.dispose?.();
		}
		this.attachments = [];
		this.focusProjectIndex = -1;
	}
}
