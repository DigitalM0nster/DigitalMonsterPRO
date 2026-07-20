import * as THREE from "three";
import { getHubPlateLabelSegments, projectsData } from "./projectsData.js";
import { portfolioHubPlatesConfig } from "./portfolioHubConfig.js";
import { applyHubPlateLabelBlurUniforms, applyHubPlateLabelBloomUniforms, applyHubPlateLabelRevealUniforms, createHubPlateLabelMaterial } from "./hubPlateLabelMaterial.js";
import { createHubScreenSnakeTextMaterial, applyHubScreenSnakeUniforms, applyHubScreenSnakeOpacity } from "./screenTitle/hubScreenSnakeTextMaterial.js";
import { createGlitchTextSlots } from "@/shared/glitchText/glitchLetterModel.js";
import { GlitchSnakeEngine } from "@/shared/glitchText/glitchSnakeEngine.js";
import { drawGlitchTextLine } from "@/shared/glitchText/drawGlitchText.js";
import { HeroTextGlitchController } from "@/three/scenes/home/heroText/HeroTextGlitchController.js";
import { getHeroGlitchSnakeRunOptions } from "@/three/scenes/home/heroText/heroTextGlitchConfig.js";
import { SITE_LOCALES } from "@/utils/siteLocale.js";
import { getPortfolioLocale } from "@/i18n/portfolioProjectsCopy.js";
import { store } from "@/store.jsx";
const MIN_CANVAS_WIDTH = 320;
const MIN_CANVAS_HEIGHT = 160;
const LABEL_SLOT_DEFS = [
	{ id: "back", z: (depth) => -depth * 0.5 },
	{
		id: "frontFloat",
		z: (depth) => depth * 0.5,
		floatFromFront: true,
	},
];

let labelFontReady = false;

async function ensureLabelFont() {
	if (labelFontReady || typeof document === "undefined" || !document.fonts?.load) {
		labelFontReady = true;
		return;
	}

	try {
		await Promise.all([
			document.fonts.load("500 12px ManifoldExtended"),
			document.fonts.load("600 14px ManifoldExtended"),
			document.fonts.load("500 28px ManifoldExtended"),
			document.fonts.load("600 40px ManifoldExtended"),
			document.fonts.load("600 50px ManifoldExtended"),
		]);
	} catch {
		// Fallback на системный шрифт в canvas.
	}

	labelFontReady = true;
}

/**
 * @deprecated Используйте getHubPlateLabelSegments из projectsData.
 */
export function getHubPlateLabelCopy(project) {
	const segments = getHubPlateLabelSegments(project);
	return {
		text: segments.map((segment) => segment.text).join(" · "),
		segments,
	};
}

const DEFAULT_LABEL_COLOR = "#1886fb";
const DEFAULT_SECONDARY_COLOR = "#ffffff";
/** Белый main-текст без HDR-bloom (только змейка светится). */
const LABEL_SECONDARY_BLOOM = 1;

function getPrimaryFontSize(labelCfg) {
	return Math.round(labelCfg.fontSize ?? 35);
}

function getSecondaryFontSize(labelCfg) {
	const scale = labelCfg.secondaryFontScale ?? 0.58;
	return Math.round(getPrimaryFontSize(labelCfg) * scale);
}

function getFontWeight(labelCfg, isPrimary) {
	if (isPrimary) {
		return labelCfg.primaryFontWeight ?? 600;
	}
	return labelCfg.secondaryFontWeight ?? 500;
}

function getLetterSpacingPx(labelCfg, fontSize, isPrimary = true) {
	const spacing = isPrimary ? (labelCfg.primaryLetterSpacing ?? labelCfg.letterSpacing ?? 0.16) : (labelCfg.secondaryLetterSpacing ?? labelCfg.letterSpacing ?? 0.22);
	return fontSize * spacing;
}

function getLineGap(labelCfg) {
	return labelCfg.lineGap ?? 10;
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

/**
 * Строки сегмента: без автопереноса — только явные \n в тексте.
 */
function segmentTextToLines(text) {
	const raw = String(text).trim();
	if (!raw) {
		return [];
	}

	const parts = raw
		.split(/\r?\n/)
		.map((part) => part.trim())
		.filter(Boolean);
	if (parts.length === 0) {
		return [];
	}

	return parts.map((part) => part.toUpperCase());
}

function buildStyledLines(ctx, segments, labelCfg) {
	const styled = [];

	for (const segment of segments) {
		const isPrimary = segment.role === "primary";
		const fontSize = isPrimary ? getPrimaryFontSize(labelCfg) : getSecondaryFontSize(labelCfg);
		const spacing = getLetterSpacingPx(labelCfg, fontSize, isPrimary);
		const fontWeight = getFontWeight(labelCfg, isPrimary);

		ctx.font = `${fontWeight} ${fontSize}px ManifoldExtended, "Segoe UI", sans-serif`;

		for (const line of segmentTextToLines(segment.text)) {
			styled.push({
				text: line,
				role: segment.role,
				fontSize,
				spacing,
				fontWeight,
			});
		}
	}

	return styled;
}

function computeStyledBlockHeight(styledLines, labelCfg) {
	const lineGap = getLineGap(labelCfg);
	let totalHeight = 0;

	for (let index = 0; index < styledLines.length; index += 1) {
		const line = styledLines[index];
		const prev = styledLines[index - 1];
		if (index > 0 && prev.role !== line.role) {
			totalHeight += lineGap;
		}
		totalHeight += line.fontSize * (labelCfg.lineHeight ?? 1.15);
	}

	return totalHeight;
}

function getLabelCorner(labelCfg = {}) {
	return labelCfg.corner === "bottomLeft" ? "bottomLeft" : "topLeft";
}

function layoutStyledLines(styledLines, labelCfg, canvasHeight, pads) {
	const lineGap = getLineGap(labelCfg);
	const totalHeight = computeStyledBlockHeight(styledLines, labelCfg);
	const corner = getLabelCorner(labelCfg);
	const topPad = pads.topPad ?? 12;
	const bottomPad = pads.bottomPad ?? 36;
	let cursorY = corner === "topLeft" ? topPad : canvasHeight - bottomPad - totalHeight;
	const layouts = [];

	for (let index = 0; index < styledLines.length; index += 1) {
		const line = styledLines[index];
		const prev = styledLines[index - 1];
		if (index > 0 && prev.role !== line.role) {
			cursorY += lineGap;
		}

		const lineHeight = line.fontSize * (labelCfg.lineHeight ?? 1.15);
		layouts.push({
			...line,
			y: cursorY,
			centerY: cursorY + line.fontSize * 0.52,
			lineHeight,
		});
		cursorY += lineHeight;
	}

	return layouts;
}

/** Фиксированная длина gradient-линии под названием (canvas px). */
function getFixedBottomLineWidth(markers) {
	return markers.bottomLineWidth > 0 ? markers.bottomLineWidth : 300;
}

function resolveFadeRuler(layouts, ctx, labelCfg, markers, textX) {
	let fadeRuler = null;
	const lineWidth = getFixedBottomLineWidth(markers);

	for (const layout of layouts) {
		if (layout.role !== "primary") {
			continue;
		}

		fadeRuler = {
			y: layout.y + layout.fontSize + markers.bottomOffsetY,
			width: lineWidth,
		};
	}

	return fadeRuler;
}

function paintLabelStaticFrame(entry, segments, labelCfg) {
	const { canvasWidth, canvasHeight } = resolveLabelPaintCanvasSize(entry, segments, labelCfg);

	const primaryCanvas = ensureLabelTextureCanvas(entry.primaryTexture, canvasWidth, canvasHeight);
	const primaryCtx = primaryCanvas.getContext("2d");
	if (primaryCtx) {
		paintPrimaryLabelCanvas(primaryCtx, segments, labelCfg, canvasWidth, canvasHeight);
	}
	entry.primaryTexture.needsUpdate = true;

	const secondaryCanvas = ensureLabelTextureCanvas(entry.secondaryTexture, canvasWidth, canvasHeight);
	const secondaryCtx = secondaryCanvas.getContext("2d");
	if (secondaryCtx) {
		paintSecondaryLabelCanvas(secondaryCtx, segments, labelCfg, canvasWidth, canvasHeight);
	}
	entry.secondaryTexture.needsUpdate = true;

	clearLabelSnakeTexture(entry.primarySnakeTexture);
	clearLabelSnakeTexture(entry.secondarySnakeTexture);
}

function getPlateDetailsButtonDefaults() {
	return portfolioHubPlatesConfig.plateDetailsButton ?? {};
}

function getLabelPrimaryBloomBoost(labelCfg = {}) {
	const button = getPlateDetailsButtonDefaults();
	return labelCfg.textBloomBoost ?? button.textBloomBoost ?? 5;
}

function getLabelSnakeShaderConfig(labelCfg = {}) {
	const button = getPlateDetailsButtonDefaults();
	const snake = { ...button.snake, ...(labelCfg.snake ?? {}) };

	return {
		snakeLetterColor: snake.color ?? "rgb(171, 224, 247)",
		snakeBloomBoost: snake.bloomBoost ?? 4,
	};
}

function resolveLabelSnakeProfile(labelCfg = {}) {
	const button = getPlateDetailsButtonDefaults();
	const snake = { ...button.snake, ...(labelCfg.snake ?? {}) };
	const letterScale = snake.letterScale ?? 1;

	return {
		mainFontFamily: 'ManifoldExtended, "Segoe UI", sans-serif',
		replacementFontFamily: 'ManifoldExtended, "Segoe UI", sans-serif',
		replacementFontWeight: snake.letterFontWeight ?? 600,
		replacementOffsetYEm: 0.12,
		replacementScaleX: letterScale,
		replacementScaleY: letterScale,
		replacementColor: snake.color ?? "rgb(171, 224, 247)",
		replacementGlowStrength: 0,
	};
}

function getLabelAccentColor(labelCfg = {}) {
	const button = getPlateDetailsButtonDefaults();
	return labelCfg.color ?? button.color ?? DEFAULT_LABEL_COLOR;
}

function getLabelGlitchDrawStyle(layout, labelCfg) {
	const isPrimary = layout.role === "primary";
	const accentColor = getLabelAccentColor(labelCfg);
	const secondaryColor = labelCfg.secondaryColor ?? DEFAULT_SECONDARY_COLOR;

	return {
		fontSize: layout.fontSize,
		fontWeight: layout.fontWeight,
		letterSpacing: layout.spacing / Math.max(layout.fontSize, 1),
		color: isPrimary ? accentColor : secondaryColor,
		fontFamily: 'ManifoldExtended, "Segoe UI", sans-serif',
		mainOpacity: isPrimary ? 1 : (labelCfg.secondaryOpacity ?? 0.52),
		snakeProfile: resolveLabelSnakeProfile(labelCfg),
	};
}

function getLabelLineLayouts(segments, labelCfg, canvasWidth, canvasHeight) {
	const measureCanvas = document.createElement("canvas");
	measureCanvas.width = 1;
	measureCanvas.height = 1;
	const measureCtx = measureCanvas.getContext("2d");

	if (!measureCtx) {
		return { layouts: [], topPad: 12, bottomPad: 36 };
	}

	const metrics = measureCanvasExtents(measureCtx, segments, labelCfg);
	const topPad = metrics.topPad;
	const bottomPad = metrics.bottomPad;
	const styledLines = buildStyledLines(measureCtx, segments, labelCfg);
	const layouts = layoutStyledLines(styledLines, labelCfg, canvasHeight || metrics.canvasHeight, {
		topPad,
		bottomPad,
	});

	return { layouts, topPad, bottomPad, canvasWidth: canvasWidth || metrics.canvasWidth, canvasHeight: canvasHeight || metrics.canvasHeight };
}

function getLabelLineTexts(segments, labelCfg) {
	const measureCanvas = document.createElement("canvas");
	measureCanvas.width = 1;
	measureCanvas.height = 1;
	const measureCtx = measureCanvas.getContext("2d");

	if (!measureCtx) {
		return [];
	}

	return buildStyledLines(measureCtx, segments, labelCfg).map((line) => line.text);
}

function createLabelSnakeTexture(canvasWidth = MIN_CANVAS_WIDTH, canvasHeight = MIN_CANVAS_HEIGHT) {
	const canvas = document.createElement("canvas");
	canvas.width = canvasWidth;
	canvas.height = canvasHeight;

	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.minFilter = THREE.LinearFilter;
	texture.magFilter = THREE.LinearFilter;
	texture.needsUpdate = true;
	return texture;
}

function clearLabelSnakeTexture(snakeTexture) {
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

function drawLabelDecorations(ctx, segments, labelCfg, canvasWidth, canvasHeight) {
	const measureCanvas = document.createElement("canvas");
	measureCanvas.width = 1;
	measureCanvas.height = 1;
	const measureCtx = measureCanvas.getContext("2d");

	if (!measureCtx) {
		return;
	}

	const accentColor = getLabelAccentColor(labelCfg);
	const secondaryColor = labelCfg.secondaryColor ?? DEFAULT_SECONDARY_COLOR;
	const markers = resolveMarkerSettings(labelCfg);
	const textX = markers.textX;
	const { layouts, topPad, bottomPad } = getLabelLineLayouts(segments, labelCfg, canvasWidth, canvasHeight);
	const fadeRuler = resolveFadeRuler(layouts, measureCtx, labelCfg, markers, textX);

	drawRowMarkers(ctx, layouts, accentColor, secondaryColor, markers);

	if (fadeRuler) {
		drawBottomRow(ctx, markers.columnX, textX, fadeRuler.y, fadeRuler.width, accentColor, markers);
	}
}

function paintGlitchGroupsOnCanvas(ctx, groups, layouts, labelCfg, layer, role) {
	if (!ctx || !groups?.length) {
		return;
	}

	const textX = resolveMarkerSettings(labelCfg).textX;

	for (let index = 0; index < groups.length; index += 1) {
		const layout = layouts[index];
		if (!layout || layout.role !== role) {
			continue;
		}

		drawGlitchTextLine(ctx, groups[index].slots, textX, layout.y, getLabelGlitchDrawStyle(layout, labelCfg), {
			clear: false,
			layer,
		});
	}
}

function paintLabelLocaleSwitchFrame(entry, segments, labelCfg, controller, nextSegments = null) {
	if (!controller) {
		return;
	}

	const { canvasWidth, canvasHeight } = resolveLabelPaintCanvasSize(entry, segments, labelCfg);
	const oldLayouts = getLabelLineLayouts(segments, labelCfg, canvasWidth, canvasHeight).layouts;
	const newLayouts = getLabelLineLayouts(nextSegments ?? segments, labelCfg, canvasWidth, canvasHeight).layouts;

	const primaryCanvas = ensureLabelTextureCanvas(entry.primaryTexture, canvasWidth, canvasHeight);
	const primaryCtx = primaryCanvas.getContext("2d");
	if (primaryCtx) {
		primaryCtx.clearRect(0, 0, canvasWidth, canvasHeight);
		drawLabelDecorations(primaryCtx, segments, labelCfg, canvasWidth, canvasHeight);
		paintGlitchGroupsOnCanvas(primaryCtx, controller.primaryGroups, oldLayouts, labelCfg, "main", "primary");
		paintGlitchGroupsOnCanvas(primaryCtx, controller.secondaryGroups, newLayouts, labelCfg, "main", "primary");
	}
	entry.primaryTexture.needsUpdate = true;

	const secondaryCanvas = ensureLabelTextureCanvas(entry.secondaryTexture, canvasWidth, canvasHeight);
	const secondaryCtx = secondaryCanvas.getContext("2d");
	if (secondaryCtx) {
		secondaryCtx.clearRect(0, 0, canvasWidth, canvasHeight);
		paintSecondaryLabelDecorations(secondaryCtx, segments, labelCfg, canvasWidth, canvasHeight);
		paintGlitchGroupsOnCanvas(secondaryCtx, controller.primaryGroups, oldLayouts, labelCfg, "main", "secondary");
		paintGlitchGroupsOnCanvas(secondaryCtx, controller.secondaryGroups, newLayouts, labelCfg, "main", "secondary");
	}
	entry.secondaryTexture.needsUpdate = true;

	const primarySnakeCanvas = ensureLabelTextureCanvas(entry.primarySnakeTexture, canvasWidth, canvasHeight);
	const primarySnakeCtx = primarySnakeCanvas.getContext("2d");
	if (primarySnakeCtx) {
		primarySnakeCtx.clearRect(0, 0, canvasWidth, canvasHeight);
		paintGlitchGroupsOnCanvas(primarySnakeCtx, controller.primaryGroups, oldLayouts, labelCfg, "snake", "primary");
		paintGlitchGroupsOnCanvas(primarySnakeCtx, controller.secondaryGroups, newLayouts, labelCfg, "snake", "primary");
	}
	entry.primarySnakeTexture.needsUpdate = true;

	const secondarySnakeCanvas = ensureLabelTextureCanvas(entry.secondarySnakeTexture, canvasWidth, canvasHeight);
	const secondarySnakeCtx = secondarySnakeCanvas.getContext("2d");
	if (secondarySnakeCtx) {
		secondarySnakeCtx.clearRect(0, 0, canvasWidth, canvasHeight);
		paintGlitchGroupsOnCanvas(secondarySnakeCtx, controller.primaryGroups, oldLayouts, labelCfg, "snake", "secondary");
		paintGlitchGroupsOnCanvas(secondarySnakeCtx, controller.secondaryGroups, newLayouts, labelCfg, "snake", "secondary");
	}
	entry.secondarySnakeTexture.needsUpdate = true;
}

function abortLabelLocaleSwitch(entry) {
	entry.localeSwitchController?.dispose?.();
	entry.localeSwitchController = null;
	entry.localeSwitchStableSize = null;
	entry.localeSwitchId = (entry.localeSwitchId ?? 0) + 1;
}

function initLabelGlitchState(entry, segments, labelCfg) {
	abortLabelLocaleSwitch(entry);

	const lineTexts = getLabelLineTexts(segments, labelCfg);
	entry.glitchLineTexts = lineTexts;
	entry.glitchGroups = lineTexts.map((lineText) => {
		const slots = createGlitchTextSlots(lineText, true);
		const engine = new GlitchSnakeEngine(() => {});
		engine.setSlots(slots);
		return { engine, slots };
	});
}

function applyLabelSnakeBloomToEntry(entry, labelCfg) {
	const snakeCfg = getLabelSnakeShaderConfig(labelCfg);

	for (const material of entry.snakeMaterials ?? []) {
		applyHubScreenSnakeUniforms(material, snakeCfg);
	}
}

function applyLabelBloomToEntry(entry, labelCfg) {
	const primaryBloom = getLabelPrimaryBloomBoost(labelCfg);

	for (const material of entry.primaryMaterials ?? []) {
		applyHubPlateLabelBloomUniforms(material, primaryBloom);
	}

	for (const material of entry.secondaryMaterials ?? []) {
		applyHubPlateLabelBloomUniforms(material, LABEL_SECONDARY_BLOOM);
	}
}

function applyLabelSnakeOpacityToEntry(entry, labelCfg, revealAlpha = 1) {
	const baseOpacity = labelCfg.opacity ?? 1;

	for (let index = 0; index < (entry.snakePlanes?.length ?? 0); index += 1) {
		const snakePlane = entry.snakePlanes[index];
		const slotId = snakePlane.userData.labelSlot?.id;
		const layerOpacity = getLabelLayerOpacity(labelCfg, slotId);
		applyHubScreenSnakeOpacity(snakePlane.material, baseOpacity * layerOpacity * revealAlpha);
	}
}

function measureCanvasExtents(ctx, segments, labelCfg) {
	const bottomPad = labelCfg.canvasBottomPad ?? 36;
	const topPad = labelCfg.canvasTopPad ?? 12;
	const rightPad = labelCfg.canvasPaddingRight ?? 48;
	const markers = resolveMarkerSettings(labelCfg);
	const textX = markers.textX;

	const styledLines = buildStyledLines(ctx, segments, labelCfg);
	const contentHeight = computeStyledBlockHeight(styledLines, labelCfg);
	const canvasHeight = Math.max(MIN_CANVAS_HEIGHT, Math.ceil(contentHeight + topPad + bottomPad));
	const layouts = layoutStyledLines(styledLines, labelCfg, canvasHeight, { topPad, bottomPad });

	let maxRight = Math.max(markers.columnX + markers.primaryTopBarWidth, textX);

	for (const layout of layouts) {
		ctx.font = `${layout.fontWeight} ${layout.fontSize}px ManifoldExtended, "Segoe UI", sans-serif`;
		const lineWidth = measureTextWithSpacing(ctx, layout.text, layout.spacing);
		maxRight = Math.max(maxRight, textX + lineWidth);
	}

	const fadeRuler = resolveFadeRuler(layouts, ctx, labelCfg, markers, textX);
	if (fadeRuler) {
		const lineEnd = textX + markers.bottomDotOffsetX + markers.bottomLineStartGap + fadeRuler.width;
		maxRight = Math.max(maxRight, lineEnd);
	}

	const glowPad = 8;
	const canvasWidth = Math.max(MIN_CANVAS_WIDTH, Math.ceil(maxRight + rightPad + glowPad));

	return {
		canvasWidth,
		canvasHeight,
		styledLines,
		layouts,
		fadeRuler,
		topPad,
		bottomPad,
	};
}

function withAlpha(hex, alpha) {
	const normalized = hex.replace("#", "");
	const r = Number.parseInt(normalized.slice(0, 2), 16);
	const g = Number.parseInt(normalized.slice(2, 4), 16);
	const b = Number.parseInt(normalized.slice(4, 6), 16);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function resolveMarkerSettings(labelCfg = {}) {
	const markers = labelCfg.markers ?? {};
	return {
		columnX: markers.columnX ?? 22,
		textX: markers.textX ?? 52,
		secondaryMarkerOffsetY: markers.secondaryMarkerOffsetY ?? 0,
		primaryMarkerOffsetY: markers.primaryMarkerOffsetY ?? 0,
		primaryStackHalfGap: markers.primaryStackHalfGap ?? 5,
		secondaryBarWidth: markers.secondaryBarWidth ?? 14,
		primaryTopBarWidth: markers.primaryTopBarWidth ?? 14,
		primaryBottomBarWidth: markers.primaryBottomBarWidth ?? 9,
		bottomBarWidth: markers.bottomBarWidth ?? 14,
		bottomOffsetY: markers.bottomOffsetY ?? 16,
		bottomFadeWidthScale: markers.bottomFadeWidthScale ?? 0.62,
		bottomDotOffsetX: markers.bottomDotOffsetX ?? 0,
		bottomDotOffsetY: markers.bottomDotOffsetY ?? 0,
		bottomDotRadius: markers.bottomDotRadius ?? 2.4,
		bottomDotGlow: markers.bottomDotGlow ?? 8,
		bottomDotAlpha: markers.bottomDotAlpha ?? 0.95,
		bottomLineStartGap: markers.bottomLineStartGap ?? 0,
		bottomLineWidth: markers.bottomLineWidth ?? 0,
		bottomLineWidthMul: markers.bottomLineWidthMul ?? 1.15,
		bottomLineThickness: markers.bottomLineThickness ?? 1.1,
		bottomLineGlow: markers.bottomLineGlow ?? 4,
		bottomLineFadeStart: markers.bottomLineFadeStart ?? 0.72,
		bottomLineFadeMid: markers.bottomLineFadeMid ?? 0.25,
	};
}

function drawSideBar(ctx, x, y, width, color, alpha, glow = 6) {
	ctx.save();
	ctx.strokeStyle = color;
	ctx.lineWidth = 2.6;
	ctx.lineCap = "round";
	ctx.globalAlpha = alpha;
	ctx.shadowColor = color;
	ctx.shadowBlur = glow;
	ctx.beginPath();
	ctx.moveTo(x, y);
	ctx.lineTo(x + width, y);
	ctx.stroke();
	ctx.restore();
}

function drawMarkerDot(ctx, x, y, color, markers) {
	ctx.save();
	ctx.fillStyle = color;
	ctx.globalAlpha = markers.bottomDotAlpha;
	ctx.shadowColor = color;
	ctx.shadowBlur = markers.bottomDotGlow;
	ctx.beginPath();
	ctx.arc(x, y, markers.bottomDotRadius, 0, Math.PI * 2);
	ctx.fill();
	ctx.restore();
}

function drawSecondaryRowMarker(ctx, markerX, centerY, markerColor, markers) {
	const y = centerY + markers.secondaryMarkerOffsetY;
	drawSideBar(ctx, markerX, y, markers.secondaryBarWidth, markerColor, 0.55, 0);
}

function drawPrimaryRowMarkers(ctx, layouts, accentColor, markers) {
	for (const layout of layouts) {
		if (layout.role === "primary") {
			drawPrimaryRowMarker(ctx, markers.columnX, layout.centerY, accentColor, markers);
		}
	}
}

function drawSecondaryRowMarkers(ctx, layouts, secondaryColor, markers) {
	for (const layout of layouts) {
		if (layout.role === "secondary") {
			drawSecondaryRowMarker(ctx, markers.columnX, layout.centerY, secondaryColor, markers);
		}
	}
}

function paintSecondaryLabelDecorations(ctx, segments, labelCfg, canvasWidth, canvasHeight) {
	const secondaryColor = labelCfg.secondaryColor ?? DEFAULT_SECONDARY_COLOR;
	const markers = resolveMarkerSettings(labelCfg);
	const { layouts } = getLabelLineLayouts(segments, labelCfg, canvasWidth, canvasHeight);
	drawSecondaryRowMarkers(ctx, layouts, secondaryColor, markers);
}

function drawPrimaryRowMarker(ctx, markerX, centerY, accentColor, markers) {
	const anchorY = centerY + markers.primaryMarkerOffsetY;
	const gap = markers.primaryStackHalfGap;
	drawSideBar(ctx, markerX, anchorY - gap, markers.primaryTopBarWidth, accentColor, 0.9, 6);
	drawSideBar(ctx, markerX, anchorY + gap, markers.primaryBottomBarWidth, accentColor, 0.9, 6);
}

function drawBottomRow(ctx, markerX, textX, y, width, color, markers) {
	const lineY = y + markers.bottomDotOffsetY;
	const dotX = textX + markers.bottomDotOffsetX;

	drawSideBar(ctx, markerX, lineY, markers.bottomBarWidth, color, 0.88, 6);

	const lineStart = dotX + markers.bottomLineStartGap;
	const safeWidth = Math.max(0, width);

	if (safeWidth > 0.5) {
		const lineEnd = lineStart + safeWidth;
		const gradient = ctx.createLinearGradient(lineStart, lineY, lineEnd, lineY);
		gradient.addColorStop(0, withAlpha(color, markers.bottomLineFadeStart));
		gradient.addColorStop(0.55, withAlpha(color, markers.bottomLineFadeMid));
		gradient.addColorStop(1, withAlpha(color, 0));

		ctx.save();
		ctx.strokeStyle = gradient;
		ctx.lineWidth = markers.bottomLineThickness;
		ctx.lineCap = "round";
		ctx.globalAlpha = 1;
		ctx.shadowColor = color;
		ctx.shadowBlur = markers.bottomLineGlow;
		ctx.beginPath();
		ctx.moveTo(lineStart, lineY);
		ctx.lineTo(lineEnd, lineY);
		ctx.stroke();
		ctx.restore();
	}

	drawMarkerDot(ctx, dotX, lineY, color, markers);
}

function drawRowMarkers(ctx, layouts, accentColor, secondaryColor, markers) {
	drawPrimaryRowMarkers(ctx, layouts, accentColor, markers);
}

function applyLabelEntryCanvasGeometry(entry, cfg, labelCfg, canvasWidth, canvasHeight) {
	const layout = getLabelLayout(labelCfg, cfg, canvasWidth, canvasHeight);

	entry.canvasWidth = canvasWidth;
	entry.canvasHeight = canvasHeight;

	for (const texture of [entry.primaryTexture, entry.secondaryTexture, entry.primarySnakeTexture, entry.secondarySnakeTexture]) {
		ensureLabelTextureCanvas(texture, canvasWidth, canvasHeight);
	}

	if (Math.abs(entry.geometry.parameters.width - layout.labelWidth) > 0.0001 || Math.abs(entry.geometry.parameters.height - layout.labelHeight) > 0.0001) {
		entry.geometry.dispose();
		entry.geometry = new THREE.PlaneGeometry(layout.labelWidth, layout.labelHeight);
		for (const plane of entry.planes) {
			plane.geometry = entry.geometry;
		}
		for (const plane of entry.snakePlanes ?? []) {
			plane.geometry = entry.geometry;
		}
	}

	for (let index = 0; index < entry.primaryPlanes.length; index += 1) {
		const slot = entry.primaryPlanes[index].userData.labelSlot;
		const position = getLabelLayerPosition(layout, cfg, labelCfg, slot);
		const blurStep = new THREE.Vector2(1 / canvasWidth, 1 / canvasHeight);
		const blur = getLabelLayerBlur(cfg, slot.id);

		entry.primaryPlanes[index].position.copy(position);
		entry.secondaryPlanes[index].position.copy(position);
		entry.primarySnakePlanes[index].position.copy(position);
		entry.secondarySnakePlanes[index].position.copy(position);

		applyHubPlateLabelBlurUniforms(entry.primaryPlanes[index].material.uniforms, blur, blurStep);
		applyHubPlateLabelBlurUniforms(entry.secondaryPlanes[index].material.uniforms, blur, blurStep);
	}

	const frontFloat = entry.planes.find((plane) => plane.userData.labelSlot?.floatFromFront) ?? entry.planes[0];
	entry.plane = frontFloat;
	entry.material = frontFloat.material;
}

function measureLabelCanvasSize(segments, labelCfg = {}) {
	const measureCanvas = document.createElement("canvas");
	measureCanvas.width = 1;
	measureCanvas.height = 1;
	const measureCtx = measureCanvas.getContext("2d");

	if (!measureCtx) {
		return { canvasWidth: MIN_CANVAS_WIDTH, canvasHeight: MIN_CANVAS_HEIGHT };
	}

	const metrics = measureCanvasExtents(measureCtx, segments, labelCfg);
	return { canvasWidth: metrics.canvasWidth, canvasHeight: metrics.canvasHeight };
}

/** Максимальный canvas подписи по всем языкам — длинные названия (BELKA PRODUCTION) не обрезают змейку. */
function measureWidestHubPlateLabelCanvas(project, labelCfg = {}) {
	let canvasWidth = MIN_CANVAS_WIDTH;
	let canvasHeight = MIN_CANVAS_HEIGHT;

	for (const locale of SITE_LOCALES) {
		const segments = getHubPlateLabelSegments(project, locale);
		const size = measureLabelCanvasSize(segments, labelCfg);
		canvasWidth = Math.max(canvasWidth, size.canvasWidth);
		canvasHeight = Math.max(canvasHeight, size.canvasHeight);
	}

	return { canvasWidth, canvasHeight };
}

function syncLabelGlitchState(entry, segments, labelCfg) {
	const lineTexts = getLabelLineTexts(segments, labelCfg);
	const needsReinit =
		!entry.glitchGroups?.length ||
		entry.glitchGroups.length !== lineTexts.length ||
		entry.glitchLineTexts?.join("\0") !== lineTexts.join("\0");

	if (needsReinit) {
		initLabelGlitchState(entry, segments, labelCfg);
	}
}

function resolveEntryWidestCanvasSize(entry, segments, labelCfg) {
	const project = projectsData[entry?.projectIndex];
	if (project) {
		return measureWidestHubPlateLabelCanvas(project, labelCfg);
	}

	return measureLabelCanvasSize(segments ?? entry.segments, labelCfg);
}

function resolveLabelPaintCanvasSize(entry, segments, labelCfg) {
	if (entry?.localeSwitchStableSize) {
		return entry.localeSwitchStableSize;
	}

	return resolveEntryWidestCanvasSize(entry, segments, labelCfg);
}

function ensureLabelTextureCanvas(texture, canvasWidth, canvasHeight) {
	let canvas = texture.image;
	if (!(canvas instanceof HTMLCanvasElement)) {
		canvas = document.createElement("canvas");
		texture.image = canvas;
	}

	if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
		canvas.width = canvasWidth;
		canvas.height = canvasHeight;
	}

	return canvas;
}

function paintPrimaryLabelCanvas(ctx, segments, labelCfg, canvasWidth, canvasHeight) {
	const accentColor = getLabelAccentColor(labelCfg);
	const secondaryColor = labelCfg.secondaryColor ?? DEFAULT_SECONDARY_COLOR;
	const markers = resolveMarkerSettings(labelCfg);
	const textX = markers.textX;
	const topPad = labelCfg.canvasTopPad ?? 12;
	const bottomPad = labelCfg.canvasBottomPad ?? 36;

	ctx.clearRect(0, 0, canvasWidth, canvasHeight);

	const styledLines = buildStyledLines(ctx, segments, labelCfg);
	const layouts = layoutStyledLines(styledLines, labelCfg, canvasHeight, { topPad, bottomPad });
	const fadeRuler = resolveFadeRuler(layouts, ctx, labelCfg, markers, textX);

	drawRowMarkers(ctx, layouts, accentColor, secondaryColor, markers);

	ctx.textBaseline = "top";
	ctx.textAlign = "left";

	for (const layout of layouts) {
		if (layout.role !== "primary") {
			continue;
		}

		ctx.font = `${layout.fontWeight} ${layout.fontSize}px ManifoldExtended, "Segoe UI", sans-serif`;
		ctx.fillStyle = accentColor;
		ctx.shadowBlur = 0;
		ctx.globalAlpha = 1;
		fillTextWithSpacing(ctx, layout.text, textX, layout.y, layout.spacing);
	}

	if (fadeRuler) {
		drawBottomRow(ctx, markers.columnX, textX, fadeRuler.y, fadeRuler.width, accentColor, markers);
	}
}

function paintSecondaryLabelCanvas(ctx, segments, labelCfg, canvasWidth, canvasHeight) {
	const secondaryColor = labelCfg.secondaryColor ?? DEFAULT_SECONDARY_COLOR;
	const secondaryOpacity = labelCfg.secondaryOpacity ?? 0.52;
	const markers = resolveMarkerSettings(labelCfg);
	const textX = markers.textX;
	const topPad = labelCfg.canvasTopPad ?? 12;
	const bottomPad = labelCfg.canvasBottomPad ?? 36;

	ctx.clearRect(0, 0, canvasWidth, canvasHeight);

	const styledLines = buildStyledLines(ctx, segments, labelCfg);
	const layouts = layoutStyledLines(styledLines, labelCfg, canvasHeight, { topPad, bottomPad });

	paintSecondaryLabelDecorations(ctx, segments, labelCfg, canvasWidth, canvasHeight);

	ctx.textBaseline = "top";
	ctx.textAlign = "left";

	for (const layout of layouts) {
		if (layout.role !== "secondary") {
			continue;
		}

		ctx.font = `${layout.fontWeight} ${layout.fontSize}px ManifoldExtended, "Segoe UI", sans-serif`;
		ctx.fillStyle = secondaryColor;
		ctx.shadowBlur = 0;
		ctx.globalAlpha = secondaryOpacity;
		fillTextWithSpacing(ctx, layout.text, textX, layout.y, layout.spacing);
	}
}

function updatePrimaryLabelTexture(texture, segments, labelCfg, canvasWidth, canvasHeight) {
	const canvas = ensureLabelTextureCanvas(texture, canvasWidth, canvasHeight);
	const ctx = canvas.getContext("2d");
	if (ctx) {
		paintPrimaryLabelCanvas(ctx, segments, labelCfg, canvasWidth, canvasHeight);
	}
	texture.needsUpdate = true;
}

function updateSecondaryLabelTexture(texture, segments, labelCfg, canvasWidth, canvasHeight) {
	const canvas = ensureLabelTextureCanvas(texture, canvasWidth, canvasHeight);
	const ctx = canvas.getContext("2d");
	if (ctx) {
		paintSecondaryLabelCanvas(ctx, segments, labelCfg, canvasWidth, canvasHeight);
	}
	texture.needsUpdate = true;
}

function createPrimaryLabelTexture(segments, labelCfg, canvasWidth, canvasHeight) {
	const canvas = document.createElement("canvas");
	canvas.width = canvasWidth;
	canvas.height = canvasHeight;
	const ctx = canvas.getContext("2d");
	if (ctx) {
		paintPrimaryLabelCanvas(ctx, segments, labelCfg, canvasWidth, canvasHeight);
	}

	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.minFilter = THREE.LinearFilter;
	texture.magFilter = THREE.LinearFilter;
	texture.needsUpdate = true;
	return texture;
}

function createSecondaryLabelTexture(segments, labelCfg, canvasWidth, canvasHeight) {
	const canvas = document.createElement("canvas");
	canvas.width = canvasWidth;
	canvas.height = canvasHeight;
	const ctx = canvas.getContext("2d");
	if (ctx) {
		paintSecondaryLabelCanvas(ctx, segments, labelCfg, canvasWidth, canvasHeight);
	}

	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.minFilter = THREE.LinearFilter;
	texture.magFilter = THREE.LinearFilter;
	texture.needsUpdate = true;
	return texture;
}

function getLabelLayout(labelCfg, cfg, canvasWidth, canvasHeight) {
	const aspect = canvasWidth / canvasHeight;
	const labelHeight = labelCfg.height ?? 0.9;
	const labelWidth = labelHeight * aspect;
	const half = cfg.plateSize * 0.5;
	const depthHalf = cfg.depth * 0.5;
	const marginX = labelCfg.marginX ?? 0.1;
	const marginY = labelCfg.marginY ?? 0.1;
	const zOffset = labelCfg.zOffset ?? 0;
	const corner = getLabelCorner(labelCfg);
	const planeY = corner === "topLeft" ? half - marginY - labelHeight * 0.5 : -half + marginY + labelHeight * 0.5;

	return {
		labelWidth,
		labelHeight,
		canvasWidth,
		canvasHeight,
		x: -half + marginX + labelWidth * 0.5,
		y: planeY,
		frontZ: depthHalf + zOffset,
	};
}

function getLabelLayerOpacity(labelCfg, slotId) {
	const layer = labelCfg.layers?.[slotId] ?? {};
	return layer.opacity ?? (slotId === "frontFloat" ? 1 : 0.035);
}

function getLabelLayerBlur(cfg, slotId) {
	return slotId === "back" ? (cfg.hudBackTextBlur ?? 0.5) : 0;
}

function getLabelLayerPosition(layout, cfg, labelCfg, slot) {
	const zOffset = labelCfg.zOffset ?? 0;
	return new THREE.Vector3(layout.x, layout.y, slot.z(cfg.depth, labelCfg, cfg) + zOffset);
}

function createLabelGroup(projectIndex, cfg) {
	const project = projectsData[projectIndex];
	if (!project) {
		return null;
	}

	const labelCfg = cfg.plateLabel ?? {};
	if (labelCfg.enabled === false) {
		return null;
	}

	const segments = getHubPlateLabelSegments(project);
	const { canvasWidth, canvasHeight } = measureWidestHubPlateLabelCanvas(project, labelCfg);
	const primaryTexture = createPrimaryLabelTexture(segments, labelCfg, canvasWidth, canvasHeight);
	const secondaryTexture = createSecondaryLabelTexture(segments, labelCfg, canvasWidth, canvasHeight);
	const primarySnakeTexture = createLabelSnakeTexture(canvasWidth, canvasHeight);
	const secondarySnakeTexture = createLabelSnakeTexture(canvasWidth, canvasHeight);
	const layout = getLabelLayout(labelCfg, cfg, canvasWidth, canvasHeight);
	const geometry = new THREE.PlaneGeometry(layout.labelWidth, layout.labelHeight);
	const primaryPlanes = [];
	const secondaryPlanes = [];
	const primarySnakePlanes = [];
	const secondarySnakePlanes = [];
	const primaryMaterials = [];
	const secondaryMaterials = [];
	const snakeMaterials = [];
	const primaryBloom = getLabelPrimaryBloomBoost(labelCfg);
	const snakeCfg = getLabelSnakeShaderConfig(labelCfg);

	const group = new THREE.Group();
	group.name = `hubPlateProjectLabel_${projectIndex}`;
	group.visible = false;

	for (const slot of LABEL_SLOT_DEFS) {
		const position = getLabelLayerPosition(layout, cfg, labelCfg, slot);
		const baseRenderOrder = slot.floatFromFront ? 5 : 3;
		const blurStep = new THREE.Vector2(1 / canvasWidth, 1 / canvasHeight);
		const blur = getLabelLayerBlur(cfg, slot.id);

		const primaryMaterial = createHubPlateLabelMaterial(primaryTexture, {
			opacity: 0,
			bloomBoost: primaryBloom,
			revealSeed: projectIndex * 0.17 + 0.3,
			reveal: labelCfg.reveal,
			blur,
			blurStep,
		});
		const primaryPlane = new THREE.Mesh(geometry, primaryMaterial);
		primaryPlane.renderOrder = baseRenderOrder;
		primaryPlane.raycast = () => {};
		primaryPlane.userData.labelSlot = slot;
		primaryPlane.position.copy(position);

		const secondaryMaterial = createHubPlateLabelMaterial(secondaryTexture, {
			opacity: 0,
			bloomBoost: LABEL_SECONDARY_BLOOM,
			revealSeed: projectIndex * 0.17 + 0.3,
			reveal: labelCfg.reveal,
			blur,
			blurStep,
		});
		const secondaryPlane = new THREE.Mesh(geometry, secondaryMaterial);
		secondaryPlane.renderOrder = baseRenderOrder;
		secondaryPlane.raycast = () => {};
		secondaryPlane.userData.labelSlot = slot;
		secondaryPlane.position.copy(position);

		const primarySnakeMaterial = createHubScreenSnakeTextMaterial(primarySnakeTexture);
		applyHubScreenSnakeUniforms(primarySnakeMaterial, snakeCfg);
		const primarySnakePlane = new THREE.Mesh(geometry, primarySnakeMaterial);
		primarySnakePlane.renderOrder = baseRenderOrder + 1;
		primarySnakePlane.raycast = () => {};
		primarySnakePlane.userData.labelSlot = slot;
		primarySnakePlane.position.copy(position);

		const secondarySnakeMaterial = createHubScreenSnakeTextMaterial(secondarySnakeTexture);
		applyHubScreenSnakeUniforms(secondarySnakeMaterial, snakeCfg);
		const secondarySnakePlane = new THREE.Mesh(geometry, secondarySnakeMaterial);
		secondarySnakePlane.renderOrder = baseRenderOrder + 1;
		secondarySnakePlane.raycast = () => {};
		secondarySnakePlane.userData.labelSlot = slot;
		secondarySnakePlane.position.copy(position);

		primaryPlanes.push(primaryPlane);
		secondaryPlanes.push(secondaryPlane);
		primarySnakePlanes.push(primarySnakePlane);
		secondarySnakePlanes.push(secondarySnakePlane);
		primaryMaterials.push(primaryMaterial);
		secondaryMaterials.push(secondaryMaterial);
		snakeMaterials.push(primarySnakeMaterial, secondarySnakeMaterial);

		group.add(primaryPlane);
		group.add(secondaryPlane);
		group.add(primarySnakePlane);
		group.add(secondarySnakePlane);

		applyHubPlateLabelRevealUniforms(primaryMaterial.uniforms, 0, { entering: false }, labelCfg.reveal);
		applyHubPlateLabelRevealUniforms(secondaryMaterial.uniforms, 0, { entering: false }, labelCfg.reveal);
		applyHubScreenSnakeOpacity(primarySnakeMaterial, 0);
		applyHubScreenSnakeOpacity(secondarySnakeMaterial, 0);
	}

	const frontFloat = primaryPlanes.find((plane) => plane.userData.labelSlot?.floatFromFront) ?? primaryPlanes[0];
	const planes = [...primaryPlanes, ...secondaryPlanes];
	const snakePlanes = [...primarySnakePlanes, ...secondarySnakePlanes];

	return {
		projectIndex,
		group,
		primaryTexture,
		secondaryTexture,
		primarySnakeTexture,
		secondarySnakeTexture,
		plane: frontFloat,
		planes,
		primaryPlanes,
		secondaryPlanes,
		snakePlanes,
		primarySnakePlanes,
		secondarySnakePlanes,
		material: frontFloat.material,
		materials: [...primaryMaterials, ...secondaryMaterials],
		primaryMaterials,
		secondaryMaterials,
		snakeMaterials,
		geometry,
		segments,
		canvasWidth,
		canvasHeight,
		glitchGroups: null,
		glitchLineTexts: null,
		localeSwitchController: null,
	};
}

function applyLabelEntry(entry, cfg) {
	const labelCfg = cfg.plateLabel ?? {};
	const enabled = labelCfg.enabled !== false;

	if (!enabled) {
		entry.group.visible = false;
		return;
	}

	entry.localeSwitchStableSize = null;

	const { canvasWidth, canvasHeight } = resolveEntryWidestCanvasSize(entry, entry.segments, labelCfg);

	applyLabelEntryCanvasGeometry(entry, cfg, labelCfg, canvasWidth, canvasHeight);
	updatePrimaryLabelTexture(entry.primaryTexture, entry.segments, labelCfg, canvasWidth, canvasHeight);
	updateSecondaryLabelTexture(entry.secondaryTexture, entry.segments, labelCfg, canvasWidth, canvasHeight);
	clearLabelSnakeTexture(entry.primarySnakeTexture);
	clearLabelSnakeTexture(entry.secondarySnakeTexture);
	applyLabelBloomToEntry(entry, labelCfg);
	applyLabelSnakeBloomToEntry(entry, labelCfg);
}

/**
 * HUD-подписи на проектных плитах (верхний/нижний левый угол — plateLabel.corner).
 */
export class HubPlateProjectLabels {
	constructor() {
		/** @type {Array<{ plateMesh: THREE.Mesh, projectIndex: number, entry: ReturnType<typeof createLabelGroup> }>} */
		this.attachments = [];
		this.focusProjectIndex = -1;
		this._localeUpdateChain = Promise.resolve();
		/** Segments updated off-page without canvas upload — paint on next focus/enter. */
		this._localeTexturesStale = false;
	}

	_getFocusedAttachment() {
		if (this.focusProjectIndex < 0) {
			return null;
		}

		return this.attachments.find((item) => item.projectIndex === this.focusProjectIndex) ?? null;
	}

	async _runFocusedLocaleSwitch(entry, nextSegments, labelCfg, cfg) {
		const switchId = (entry.localeSwitchId = (entry.localeSwitchId ?? 0) + 1);
		abortLabelLocaleSwitch(entry);
		entry.localeSwitchId = switchId;

		syncLabelGlitchState(entry, entry.segments, labelCfg);

		const nextLines = getLabelLineTexts(nextSegments, labelCfg);
		const runOptions = getHeroGlitchSnakeRunOptions({ playSound: false });

		const stableSize = resolveEntryWidestCanvasSize(entry, nextSegments, labelCfg);
		entry.localeSwitchStableSize = stableSize;
		applyLabelEntryCanvasGeometry(entry, cfg, labelCfg, stableSize.canvasWidth, stableSize.canvasHeight);
		paintLabelStaticFrame(entry, entry.segments, labelCfg);

		const repaint = () => {
			if (!entry.localeSwitchController || entry.localeSwitchId !== switchId) {
				return;
			}

			paintLabelLocaleSwitchFrame(
				entry,
				entry.segments,
				labelCfg,
				entry.localeSwitchController,
				nextSegments,
			);
		};

		const onRedraw = () => {
			repaint();
		};

		for (const group of entry.glitchGroups) {
			group.engine.onChange = onRedraw;
		}

		const controller = new HeroTextGlitchController({ uppercase: true, onRedraw });
		controller.primaryGroups = entry.glitchGroups;
		entry.localeSwitchController = controller;

		await controller.runLanguageSwitch(nextLines, runOptions);

		if (entry.localeSwitchId !== switchId) {
			return false;
		}

		entry.localeSwitchStableSize = null;
		entry.glitchGroups = controller.primaryGroups;
		entry.glitchLineTexts = nextLines;
		entry.localeSwitchController = null;
		return true;
	}

	async attachToPlates(plates, cfg = portfolioHubPlatesConfig) {
		this.dispose();
		await ensureLabelFont();

		for (const plate of plates) {
			if (plate.projectIndex < 0 || !plate.mesh) {
				continue;
			}

			const entry = createLabelGroup(plate.projectIndex, cfg);
			if (!entry) {
				continue;
			}

			initLabelGlitchState(entry, entry.segments, cfg.plateLabel ?? {});
			plate.mesh.add(entry.group);
			this.attachments.push({ plateMesh: plate.mesh, projectIndex: plate.projectIndex, entry });
		}
	}

	applyFromConfig(cfg = portfolioHubPlatesConfig) {
		const labelCfg = cfg.plateLabel ?? {};

		for (const attachment of this.attachments) {
			if (attachment.entry.localeSwitchController) {
				continue;
			}

			applyLabelEntry(attachment.entry, cfg);
			initLabelGlitchState(attachment.entry, attachment.entry.segments, labelCfg);
		}
	}

	/** Обновить подписи на плитах при смене языка (змейка на активной плите). */
	updateLocale(locale, cfg = portfolioHubPlatesConfig, { animate = true } = {}) {
		this._localeUpdateChain = this._localeUpdateChain.then(() =>
			this._updateLocaleImpl(locale, cfg, { animate }),
		);
		return this._localeUpdateChain;
	}

	async _updateLocaleImpl(locale, cfg = portfolioHubPlatesConfig, { animate = true } = {}) {
		const labelCfg = cfg.plateLabel ?? {};
		const focused = this._getFocusedAttachment();

		for (const attachment of this.attachments) {
			const project = projectsData[attachment.projectIndex];
			if (!project) {
				continue;
			}

			const nextSegments = getHubPlateLabelSegments(project, locale);

			// Off-page: keep OLD segments for a later snake; stash next copy.
			// Do not overwrite segments or paint — setFocusReveal would pop new language.
			if (!animate) {
				attachment.entry.pendingSegments = nextSegments;
				this._localeTexturesStale = true;
				continue;
			}

			const isFocusedVisible = focused && attachment === focused && attachment.entry.group.visible;
			let switchCompleted = true;
			const toSegments = attachment.entry.pendingSegments ?? nextSegments;

			if (isFocusedVisible) {
				// Keep entry.segments = OLD during snake — switch paints old→new.
				switchCompleted = await this._runFocusedLocaleSwitch(attachment.entry, toSegments, labelCfg, cfg);
			}

			if (!switchCompleted) {
				continue;
			}

			attachment.entry.segments = toSegments;
			attachment.entry.pendingSegments = null;
			applyLabelEntry(attachment.entry, cfg);
			initLabelGlitchState(attachment.entry, toSegments, labelCfg);
		}
		if (animate) {
			this._localeTexturesStale = false;
		}
	}

	/**
	 * Apply deferred locale after returning to hub.
	 * Focused plate snakes old→new; others paint silently.
	 */
	async playPendingLocaleReveal(cfg = portfolioHubPlatesConfig) {
		if (!this._localeTexturesStale) {
			return;
		}
		if (this.focusProjectIndex < 0) {
			this.focusProjectIndex = Math.max(0, store.portfolioHubFocusIndex ?? 0);
		}
		const focused = this._getFocusedAttachment();
		if (focused) {
			focused.entry.group.visible = true;
		}
		await this._updateLocaleImpl(getPortfolioLocale(), cfg, { animate: true });
	}

	/** Paint deferred locale segments (after off-page silent update) — no snake. */
	flushPendingLocaleTextures(cfg = portfolioHubPlatesConfig) {
		if (!this._localeTexturesStale) {
			return;
		}
		const labelCfg = cfg.plateLabel ?? {};
		for (const attachment of this.attachments) {
			if (attachment.entry.pendingSegments) {
				attachment.entry.segments = attachment.entry.pendingSegments;
				attachment.entry.pendingSegments = null;
			}
			applyLabelEntry(attachment.entry, cfg);
			initLabelGlitchState(attachment.entry, attachment.entry.segments, labelCfg);
		}
		this._localeTexturesStale = false;
	}

	/** Подпись только на активной плитке — синхронно с логотипом. */
	setFocusReveal(projectIndex, alpha = 0, revealState = {}, cfg = portfolioHubPlatesConfig) {
		const labelCfg = cfg.plateLabel ?? {};
		const labelsEnabled = labelCfg.enabled !== false;
		this.focusProjectIndex = projectIndex;

		for (const attachment of this.attachments) {
			const isFocused = labelsEnabled && attachment.projectIndex === projectIndex && projectIndex >= 0;

			attachment.entry.group.visible = isFocused;

			if (!isFocused) {
				const hadLocaleSwitch = Boolean(
					attachment.entry.localeSwitchController || attachment.entry.localeSwitchStableSize,
				);
				abortLabelLocaleSwitch(attachment.entry);
				if (hadLocaleSwitch) {
					applyLabelEntry(attachment.entry, cfg);
				}
				for (const material of attachment.entry.materials) {
					material.uniforms.opacity.value = 0;
					applyHubPlateLabelRevealUniforms(material.uniforms, 0, { entering: false }, labelCfg.reveal);
				}
				for (const material of attachment.entry.snakeMaterials ?? []) {
					applyHubScreenSnakeOpacity(material, 0);
				}
				continue;
			}

			// Never instant-paint deferred locale here — that skipped the snake when
			// language changed while hub was previous (About/home). Enter / playPendingLocaleReveal owns it.

			for (const plane of attachment.entry.planes) {
				const slotId = plane.userData.labelSlot?.id;
				const layerOpacity = getLabelLayerOpacity(labelCfg, slotId);
				plane.material.uniforms.opacity.value = (labelCfg.opacity ?? 1) * layerOpacity;
				applyHubPlateLabelRevealUniforms(plane.material.uniforms, alpha, revealState, labelCfg.reveal);
			}

			applyLabelSnakeOpacityToEntry(attachment.entry, labelCfg, alpha);
		}
	}

	dispose() {
		for (const { plateMesh, entry } of this.attachments) {
			abortLabelLocaleSwitch(entry);
			for (const group of entry.glitchGroups ?? []) {
				group.engine?.abort?.();
			}
			plateMesh?.remove(entry.group);
			entry.geometry?.dispose?.();
			for (const material of entry.materials ?? []) {
				material?.dispose?.();
			}
			for (const material of entry.snakeMaterials ?? []) {
				material?.dispose?.();
			}
			entry.primaryTexture?.dispose?.();
			entry.secondaryTexture?.dispose?.();
			entry.primarySnakeTexture?.dispose?.();
			entry.secondarySnakeTexture?.dispose?.();
		}
		this.attachments = [];
		this.focusProjectIndex = -1;
	}
}
