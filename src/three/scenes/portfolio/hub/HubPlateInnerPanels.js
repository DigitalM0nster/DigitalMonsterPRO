import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { getSiteCopy } from "@/app/i18n/siteCopy.js";
import { playGlitchTextSound } from "@/sounds/soundDesign.js";
import { getHeroGlitchSnakeRunOptions } from "@/three/scenes/home/heroText/heroTextGlitchConfig.js";
import { SITE_MAIN_COLOR, siteMainRgba } from "@/app/config/siteMainColor.js";
import { normalizeSiteLocale } from "@/functions/siteLocale.js";
import { getPortfolioLocale } from "@/pages/portfolio/data/portfolioProjectsCopy.js";
import { projectsData } from "./projectsData.js";
import { getHubPlateInnerPanelData } from "./hubPlateInnerPanelData.js";
import {
	createHubPlateCasePanelMaterial,
	createHubPlateCasePanelGlassMaterial,
	getHubPlateCasePanelOpacity,
	setHubPlateCasePanelOpacity,
	updateHubPlateCasePanelMaterial,
} from "./hubPlateCasePanelMaterial.js";
import { HubPlateGalleryCarousel } from "./HubPlateGalleryCarousel.js";
import { HubPlateLocalizedTextLayer } from "./HubPlateLocalizedTextLayer.js";
import {
	applyHubPlateLabelHoverUniforms,
	applyHubPlateLabelRevealUniforms,
	createHubPlateLabelMaterial,
} from "./hubPlateLabelMaterial.js";
import {
	getHubPlateGalleryNavigationDirectionAtPoint,
	getHubPlateGallerySlotAtPoint,
	HUB_PLATE_GALLERY_ASPECT,
	HUB_PLATE_GALLERY_NAV_LAYOUT,
	HUB_PLATE_GALLERY_NAV_HIT_RECTS,
	HUB_PLATE_PANEL_HEIGHT,
	HUB_PLATE_PANEL_WIDTH,
	paintHubPlateGalleryAccentChrome,
	paintHubPlateGallerySecondaryChrome,
	wrapHubPlateGalleryIndex,
} from "./hubPlateGalleryLayout.js";

const CANVAS_WIDTH = HUB_PLATE_PANEL_WIDTH;
const CANVAS_HEIGHT = HUB_PLATE_PANEL_HEIGHT;
const GALLERY_ATLAS_MAX_COLUMNS = 2;
const GALLERY_ATLAS_TILE_WIDTH = 1920;
const GALLERY_ATLAS_TILE_HEIGHT = 945;
const GALLERY_ATLAS_GUTTER = 4;
const GALLERY_ATLAS_CELL_WIDTH = GALLERY_ATLAS_TILE_WIDTH + GALLERY_ATLAS_GUTTER * 2;
const GALLERY_ATLAS_CELL_HEIGHT = GALLERY_ATLAS_TILE_HEIGHT + GALLERY_ATLAS_GUTTER * 2;
const SECONDARY_TEXT_CANVAS_SCALE = 2;
const HUB_PANEL_BODY_FONT = 'Jura, "Segoe UI", system-ui, sans-serif';
const INNER_PANEL_TEXT_PIXEL_RATIO = 1.5;
const INNER_PANEL_EYEBROW_Y = 9;
const INNER_PANEL_EYEBROW_FONT_SIZE = 15;
const INNER_PANEL_CASE_COUNTER_GAP = 10;
const INNER_PANEL_TITLE_RECT = { x: 52, y: 55, width: 780, height: 72 };
const INNER_PANEL_SITE_LINK_RECT = { x: 52, y: 238, width: 360, height: 30 };
const INNER_PANEL_BODY_RECT = { x: 52, y: 32, width: 720, height: 215 };
const INNER_PANEL_CASE_LABEL_RECT = { x: 1010, y: 32, width: 190, height: 28 };
const INNER_PANEL_NAV_LABEL_RECT = { x: 430, y: 650, width: 420, height: 60 };
const NAVIGATION_HOVER_RESPONSE = 30;
const NAVIGATION_LEFT_ARROW_RECT = { x: 440, y: 652, width: 34, height: 36 };
const NAVIGATION_RIGHT_ARROW_RECT = { x: 806, y: 652, width: 34, height: 36 };
const INNER_PANEL_COPY = Object.freeze({
	case: Object.freeze({
		ru: "КЕЙС",
		en: "CASE",
		zh: "案例",
	}),
	previous: Object.freeze({
		ru: "НАЗАД",
		en: "PREV",
		zh: "上一张",
	}),
	next: Object.freeze({
		ru: "ДАЛЕЕ",
		en: "NEXT",
		zh: "下一张",
	}),
});

async function ensureHubPlateInnerPanelFonts() {
	if (!document.fonts?.load) {
		return;
	}
	await Promise.all([
		document.fonts.load("400 18px Jura"),
		document.fonts.load("400 16px Jura"),
		document.fonts.load("500 13px Jura"),
		document.fonts.load("500 15px Jura"),
		document.fonts.load("500 10px ManifoldExtended"),
		document.fonts.load("500 11px ManifoldExtended"),
		document.fonts.load("500 13px ManifoldExtended"),
		document.fonts.load("500 14px ManifoldExtended"),
		document.fonts.load("400 56px ManifoldExtended"),
		document.fonts.load("500 40px ManifoldExtended"),
		document.fonts.load("500 17px ManifoldExtended"),
	]);
	await document.fonts.ready;
}

function cloneAttributeRange(attribute, start, count) {
	const itemStart = start * attribute.itemSize;
	const itemEnd = (start + count) * attribute.itemSize;
	const data = attribute.array.slice(itemStart, itemEnd);
	const cloned = new THREE.BufferAttribute(data, attribute.itemSize, attribute.normalized);
	cloned.name = attribute.name;
	cloned.gpuType = attribute.gpuType;
	return cloned;
}

function offsetSurfaceAlongNormals(geometry, distance) {
	if (Math.abs(distance) < 0.000001) {
		return;
	}

	const position = geometry.getAttribute("position");
	const normal = geometry.getAttribute("normal");
	for (let index = 0; index < position.count; index += 1) {
		position.setXYZ(
			index,
			position.getX(index) + normal.getX(index) * distance,
			position.getY(index) + normal.getY(index) * distance,
			position.getZ(index) + normal.getZ(index) * distance,
		);
	}
	position.needsUpdate = true;
}

/**
 * Builds the actual rounded plate face instead of faking it with PlaneGeometry.
 * depthRatio is measured inside the plate: 0 = rear wall, 1 = front wall.
 * Every layer keeps the same topology, so UVs wrap through the curved bevels.
 */
function createPlateScreenSurfaceGeometry(cfg, depthRatio, surfaceOffset = 0) {
	const width = cfg.plateSize * Math.max(cfg.caseSelection?.aspectRatio ?? 1, 1);
	const source = new RoundedBoxGeometry(
		width,
		cfg.plateSize,
		cfg.depth,
		cfg.cornerSegments,
		cfg.cornerRadius,
	);
	// RoundedBoxGeometry groups: ±X, ±Y, +Z, -Z. Always start from +Z so
	// every inner layer keeps stable camera-facing UVs and normals.
	const frontGroup = source.groups[4];
	if (!frontGroup) {
		source.dispose();
		throw new Error("Rounded portfolio plate has no front surface group");
	}

	const geometry = new THREE.BufferGeometry();
	for (const [name, attribute] of Object.entries(source.attributes)) {
		geometry.setAttribute(
			name,
			cloneAttributeRange(attribute, frontGroup.start, frontGroup.count),
		);
	}
	source.dispose();

	const safeDepthRatio = clamp01(depthRatio);
	geometry.translate(0, 0, -cfg.depth * (1 - safeDepthRatio));
	offsetSurfaceAlongNormals(geometry, surfaceOffset);
	geometry.computeBoundingBox();
	geometry.computeBoundingSphere();
	return geometry;
}

function createGalleryPlateGeometry(cfg, config = {}) {
	const thickness = Math.max(0.01, config.thickness ?? 0.055);
	const cornerRadius = Math.min(
		Math.max(0.001, config.plateCornerRadius ?? 0.022),
		thickness * 0.45,
	);
	const geometry = new RoundedBoxGeometry(
		HUB_PLATE_GALLERY_ASPECT,
		1,
		thickness,
		cfg.cornerSegments,
		cornerRadius,
	);
	if (!geometry.groups[4]) {
		geometry.dispose();
		throw new Error("Rounded gallery plate has no front surface group");
	}
	for (let index = 0; index < geometry.groups.length; index += 1) {
		geometry.groups[index].materialIndex = index === 4 ? 0 : 1;
	}
	return geometry;
}

function clamp01(value) {
	return Math.max(0, Math.min(1, value));
}

function getLocaleSnakeProjectIndices(activeProjectIndex, projectCount) {
	const indices = new Set();
	if (
		!Number.isInteger(activeProjectIndex) ||
		activeProjectIndex < 0 ||
		projectCount <= 0
	) {
		return indices;
	}

	indices.add(activeProjectIndex % projectCount);
	indices.add((activeProjectIndex - 1 + projectCount) % projectCount);
	indices.add((activeProjectIndex + 1) % projectCount);
	return indices;
}

function drawImageCover(ctx, image, x, y, width, height) {
	if (!image?.width || !image?.height) {
		return;
	}
	const scale = Math.max(width / image.width, height / image.height);
	const sourceWidth = width / scale;
	const sourceHeight = height / scale;
	const sourceX = (image.width - sourceWidth) * 0.5;
	const sourceY = (image.height - sourceHeight) * 0.5;
	ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
}

function measureTextWithSpacing(ctx, text, letterSpacingPx) {
	const characters = Array.from(String(text ?? ""));
	return characters.reduce((width, character, index) => (
		width + ctx.measureText(character).width + (index < characters.length - 1 ? letterSpacingPx : 0)
	), 0);
}

function getWrappedTextLines(ctx, text, maxWidth, maxLines = 3, letterSpacingPx = 0) {
	const words = String(text ?? "").split(/\s+/).filter(Boolean);
	const lines = [];
	let line = "";

	for (let index = 0; index < words.length; index += 1) {
		const candidate = line ? `${line} ${words[index]}` : words[index];
		if (measureTextWithSpacing(ctx, candidate, letterSpacingPx) <= maxWidth || !line) {
			line = candidate;
			continue;
		}

		lines.push(line);
		line = words[index];
		if (lines.length >= maxLines - 1) {
			break;
		}
	}

	if (line && lines.length < maxLines) {
		lines.push(line);
	}
	return lines;
}

function loadImage(src) {
	return new Promise((resolve) => {
		const image = new Image();
		image.decoding = "async";
		image.onload = () => resolve(image);
		image.onerror = () => resolve(null);
		image.src = src;
	});
}

function normalizeGalleryImages(images) {
	const available = images.filter(Boolean);
	if (available.length === 0) {
		return [null];
	}
	return available;
}

function createGalleryAtlasCanvas(images) {
	const availableImages = images.filter(Boolean);
	const atlasImages = availableImages.length > 0 ? availableImages : [null];
	const columns = Math.min(GALLERY_ATLAS_MAX_COLUMNS, atlasImages.length);
	const rows = Math.ceil(atlasImages.length / columns);
	const canvas = document.createElement("canvas");
	canvas.width = columns * GALLERY_ATLAS_CELL_WIDTH;
	canvas.height = rows * GALLERY_ATLAS_CELL_HEIGHT;
	const ctx = canvas.getContext("2d");
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = "high";

	for (let index = 0; index < atlasImages.length; index += 1) {
		const x = (index % columns) * GALLERY_ATLAS_CELL_WIDTH;
		const y = Math.floor(index / columns) * GALLERY_ATLAS_CELL_HEIGHT;
		ctx.fillStyle = "#010a14";
		ctx.fillRect(x, y, GALLERY_ATLAS_CELL_WIDTH, GALLERY_ATLAS_CELL_HEIGHT);
		drawImageCover(
			ctx,
			atlasImages[index],
			x + GALLERY_ATLAS_GUTTER,
			y + GALLERY_ATLAS_GUTTER,
			GALLERY_ATLAS_TILE_WIDTH,
			GALLERY_ATLAS_TILE_HEIGHT,
		);

		// Repeat the exact 1920:945 tile edge into the gutter. Linear filtering
		// then stays clean without changing the image's requested aspect ratio.
		const innerX = x + GALLERY_ATLAS_GUTTER;
		const innerY = y + GALLERY_ATLAS_GUTTER;
		ctx.drawImage(canvas, innerX, innerY, 1, GALLERY_ATLAS_TILE_HEIGHT, x, innerY, GALLERY_ATLAS_GUTTER, GALLERY_ATLAS_TILE_HEIGHT);
		ctx.drawImage(canvas, innerX + GALLERY_ATLAS_TILE_WIDTH - 1, innerY, 1, GALLERY_ATLAS_TILE_HEIGHT, innerX + GALLERY_ATLAS_TILE_WIDTH, innerY, GALLERY_ATLAS_GUTTER, GALLERY_ATLAS_TILE_HEIGHT);
		ctx.drawImage(canvas, x, innerY, GALLERY_ATLAS_CELL_WIDTH, 1, x, y, GALLERY_ATLAS_CELL_WIDTH, GALLERY_ATLAS_GUTTER);
		ctx.drawImage(canvas, x, innerY + GALLERY_ATLAS_TILE_HEIGHT - 1, GALLERY_ATLAS_CELL_WIDTH, 1, x, innerY + GALLERY_ATLAS_TILE_HEIGHT, GALLERY_ATLAS_CELL_WIDTH, GALLERY_ATLAS_GUTTER);
	}

	return {
		canvas,
		columns,
		rows,
		imageCount: atlasImages.length,
		gutterUv: [
			GALLERY_ATLAS_GUTTER / GALLERY_ATLAS_CELL_WIDTH,
			GALLERY_ATLAS_GUTTER / GALLERY_ATLAS_CELL_HEIGHT,
		],
	};
}

function createCanvasTexture(canvas, { useMipmaps = false, anisotropy = 1 } = {}) {
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.minFilter = useMipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
	texture.magFilter = THREE.LinearFilter;
	texture.generateMipmaps = useMipmaps;
	texture.anisotropy = useMipmaps ? anisotropy : 1;
	texture.needsUpdate = true;
	return texture;
}

function createLogicalCanvas(scale = 1) {
	const canvas = document.createElement("canvas");
	canvas.width = CANVAS_WIDTH * scale;
	canvas.height = CANVAS_HEIGHT * scale;
	if (scale !== 1) {
		canvas.getContext("2d").setTransform(scale, 0, 0, scale, 0, 0);
	}
	return canvas;
}

function toPanelUvRect(rect) {
	return new THREE.Vector4(
		rect.x / CANVAS_WIDTH,
		1 - (rect.y + rect.height) / CANVAS_HEIGHT,
		(rect.x + rect.width) / CANVAS_WIDTH,
		1 - rect.y / CANVAS_HEIGHT,
	);
}

function paintInnerPanelBaseCanvas(canvas, images) {
	const ctx = canvas.getContext("2d");

	ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
	// The interface is the plate's front display, not an opaque cover over it.
	// Keep the glass material and its lighting visible below the HUD layer.
	ctx.fillStyle = "rgba(1, 8, 17, 0.24)";
	ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

	if (images[0]) {
		ctx.save();
		ctx.globalAlpha = 0.075;
		ctx.filter = "blur(24px)";
		drawImageCover(ctx, images[0], -60, -40, CANVAS_WIDTH + 120, CANVAS_HEIGHT + 80);
		ctx.restore();
	}

	const gradient = ctx.createLinearGradient(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
	gradient.addColorStop(0, "rgba(3, 20, 35, 0.18)");
	gradient.addColorStop(0.55, "rgba(0, 4, 11, 0.04)");
	gradient.addColorStop(1, "rgba(0, 21, 38, 0.16)");
	ctx.fillStyle = gradient;
	ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

	ctx.textAlign = "left";
}

function paintInnerPanelAccentTextCanvas(
	canvas,
	projectIndex,
	galleryIndex = 0,
	galleryCount = 1,
) {
	const ctx = canvas.getContext("2d");
	ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

	const activeProject = String(projectIndex + 1).padStart(2, "0");
	const projectCount = String(projectsData.length).padStart(2, "0");
	const counterX = 1010;
	ctx.textAlign = "left";
	ctx.textBaseline = "alphabetic";
	ctx.fillStyle = SITE_MAIN_COLOR;
	ctx.font = '400 56px "ManifoldExtended", sans-serif';
	const activeProjectMetrics = ctx.measureText(activeProject);
	const counterTopY =
		INNER_PANEL_CASE_LABEL_RECT.y +
		INNER_PANEL_EYEBROW_Y +
		INNER_PANEL_EYEBROW_FONT_SIZE +
		INNER_PANEL_CASE_COUNTER_GAP;
	const counterBaselineY = counterTopY + (
		activeProjectMetrics.actualBoundingBoxAscent || 56 * 0.78
	);
	ctx.fillText(activeProject, counterX, counterBaselineY);
	const activeProjectWidth = activeProjectMetrics.width;
	ctx.font = '400 20px "ManifoldExtended", sans-serif';
	const slashX = counterX + activeProjectWidth + 16;
	const slashWidth = ctx.measureText("/").width;
	const totalX = slashX + slashWidth + 10;
	ctx.fillStyle = siteMainRgba(0.76);
	ctx.fillText("/", slashX, counterBaselineY);
	ctx.fillStyle = siteMainRgba(0.9);
	ctx.fillText(projectCount, totalX, counterBaselineY);
	paintHubPlateGalleryAccentChrome(ctx, galleryIndex, galleryCount);
	ctx.textBaseline = "alphabetic";
	ctx.textAlign = "left";
}

function paintInnerPanelSecondaryTextCanvas(canvas, galleryIndex = 0, galleryCount = 1) {
	const ctx = canvas.getContext("2d");
	ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
	ctx.textAlign = "left";
	paintHubPlateGallerySecondaryChrome(ctx, galleryIndex, galleryCount);
	ctx.textAlign = "left";
}

function getInnerPanelLocalizedLines(
	project,
	locale = getPortfolioLocale(),
) {
	const data = getHubPlateInnerPanelData(project, locale);
	const copy = Object.fromEntries(
		Object.entries(INNER_PANEL_COPY).map(([key, value]) => [key, getSiteCopy(value, locale)]),
	);
	const measureCanvas = document.createElement("canvas");
	const ctx = measureCanvas.getContext("2d");
	ctx.font = `400 18px ${HUB_PANEL_BODY_FONT}`;
	const descriptionLines = getWrappedTextLines(ctx, data.description, 640, 3, 1.05);

	return {
		title: [{
			text: String(data.title).toUpperCase(),
			x: 12,
			y: 9,
			fontSize: 40,
			fontWeight: 500,
			fontFamily: '"ManifoldExtended", sans-serif',
			letterSpacing: 0,
			color: SITE_MAIN_COLOR,
		}],
		siteLink: data.url ? [{
			text: `${data.visitSiteLabel}  \u203a`,
			x: 12,
			y: 5,
			fontSize: 13,
			fontWeight: 500,
			fontFamily: '"ManifoldExtended", sans-serif',
			letterSpacing: 0,
			color: SITE_MAIN_COLOR,
		}] : [],
		body: [
			{
				text: data.currentProjectLabel,
				x: 12,
				y: INNER_PANEL_EYEBROW_Y,
				fontSize: INNER_PANEL_EYEBROW_FONT_SIZE,
				fontWeight: 500,
				fontFamily: HUB_PANEL_BODY_FONT,
				letterSpacing: 2.15 / 15,
				color: "rgba(173, 205, 226, 0.66)",
			},
			{
				text: String(data.type).toUpperCase(),
				x: 12,
				y: 92,
				fontSize: 16,
				fontWeight: 400,
				fontFamily: HUB_PANEL_BODY_FONT,
				letterSpacing: 1.2 / 16,
				color: "rgba(220, 235, 246, 0.78)",
			},
			...descriptionLines.map((line, lineIndex) => ({
				text: line,
				x: 12,
				y: 128 + lineIndex * 27,
				fontSize: 18,
				fontWeight: 400,
				fontFamily: HUB_PANEL_BODY_FONT,
				letterSpacing: 1.05 / 18,
				color: "rgba(190, 215, 232, 0.7)",
			})),
		],
		caseLabel: [{
			text: copy.case,
			x: 0,
			y: INNER_PANEL_EYEBROW_Y,
			fontSize: INNER_PANEL_EYEBROW_FONT_SIZE,
			fontWeight: 500,
			fontFamily: HUB_PANEL_BODY_FONT,
			letterSpacing: 2.15 / INNER_PANEL_EYEBROW_FONT_SIZE,
			color: "rgba(174, 211, 232, 0.66)",
		}],
		navigation: [
			{
				text: copy.previous,
				align: "center",
				x: HUB_PLATE_GALLERY_NAV_LAYOUT.previousCenterX - INNER_PANEL_NAV_LABEL_RECT.x,
				y:
					HUB_PLATE_GALLERY_NAV_LAYOUT.baselineY -
					INNER_PANEL_NAV_LABEL_RECT.y -
					11 * 0.5,
				fontSize: 11,
				fontWeight: 500,
				fontFamily: '"ManifoldExtended", sans-serif',
				letterSpacing: 0.6 / 11,
				color: "rgba(188, 217, 234, 0.68)",
			},
			{
				text: copy.next,
				align: "center",
				x: HUB_PLATE_GALLERY_NAV_LAYOUT.nextCenterX - INNER_PANEL_NAV_LABEL_RECT.x,
				y:
					HUB_PLATE_GALLERY_NAV_LAYOUT.baselineY -
					INNER_PANEL_NAV_LABEL_RECT.y -
					11 * 0.5,
				fontSize: 11,
				fontWeight: 500,
				fontFamily: '"ManifoldExtended", sans-serif',
				letterSpacing: 0.6 / 11,
				color: "rgba(188, 217, 234, 0.68)",
			},
		],
	};
}

function createInnerPanelLocalizedTextLayers({
	mesh,
	geometry,
	project,
	projectIndex,
	locale,
	cfg,
	textShaderConfig,
	textRevealConfig,
}) {
	const lines = getInnerPanelLocalizedLines(project, locale);
	const common = {
		parent: mesh,
		geometry,
		panelWidth: CANVAS_WIDTH,
		panelHeight: CANVAS_HEIGHT,
		pixelRatio: INNER_PANEL_TEXT_PIXEL_RATIO,
		revealSeed: projectIndex * 0.17 + 0.3,
		revealConfig: textRevealConfig,
	};

	return [
		{
			id: "body",
			layer: new HubPlateLocalizedTextLayer({
				...common,
				name: `hubPlateCasePanelBodyText_${project.id}`,
				rect: INNER_PANEL_BODY_RECT,
				lines: lines.body,
				pixelRatio: 2,
				opacity: textShaderConfig.secondaryOpacity ?? 1,
				bloomBoost: textShaderConfig.secondaryBloomBoost ?? 1,
				renderOrder: 33,
				z: 0.00075,
			}),
		},
		{
			id: "title",
			layer: new HubPlateLocalizedTextLayer({
				...common,
				name: `hubPlateCasePanelTitleText_${project.id}`,
				rect: INNER_PANEL_TITLE_RECT,
				lines: lines.title,
				opacity: textShaderConfig.accentOpacity ?? 1,
				bloomBoost: textShaderConfig.accentBloomBoost ?? cfg.plateLabel?.textBloomBoost ?? 5,
				renderOrder: 34,
				z: 0.0011,
			}),
		},
		{
			id: "siteLink",
			layer: new HubPlateLocalizedTextLayer({
				...common,
				name: `hubPlateCasePanelSiteLinkText_${project.id}`,
				rect: INNER_PANEL_SITE_LINK_RECT,
				lines: lines.siteLink,
				opacity: textShaderConfig.accentOpacity ?? 1,
				bloomBoost: textShaderConfig.accentBloomBoost ?? cfg.plateLabel?.textBloomBoost ?? 5,
				renderOrder: 34,
				z: 0.0011,
			}),
		},
		{
			id: "caseLabel",
			layer: new HubPlateLocalizedTextLayer({
				...common,
				name: `hubPlateCasePanelCaseLabelText_${project.id}`,
				rect: INNER_PANEL_CASE_LABEL_RECT,
				lines: lines.caseLabel,
				opacity: textShaderConfig.secondaryOpacity ?? 1,
				bloomBoost: textShaderConfig.secondaryBloomBoost ?? 1,
				renderOrder: 33,
				z: 0.00075,
			}),
		},
		{
			id: "navigation",
			animateLocale: false,
			layer: new HubPlateLocalizedTextLayer({
				...common,
				name: `hubPlateCasePanelNavigationText_${project.id}`,
				rect: INNER_PANEL_NAV_LABEL_RECT,
				lines: lines.navigation,
				pixelRatio: 2,
				opacity: textShaderConfig.secondaryOpacity ?? 1,
				bloomBoost: textShaderConfig.secondaryBloomBoost ?? 1,
				hover: {
					leftRect: toPanelUvRect(HUB_PLATE_GALLERY_NAV_HIT_RECTS.previous),
					rightRect: toPanelUvRect(HUB_PLATE_GALLERY_NAV_HIT_RECTS.next),
					bloomBoost: textShaderConfig.accentBloomBoost ?? cfg.plateLabel?.textBloomBoost ?? 5,
					color: SITE_MAIN_COLOR,
				},
				renderOrder: 33,
				z: 0.00075,
			}),
		},
	];
}

function syncGalleryChrome(entry, galleryIndex) {
	if (!entry) {
		return;
	}
	const galleryCount = entry.galleryCarousel?.imageCount ?? entry.images?.length ?? 1;
	const nextIndex = wrapHubPlateGalleryIndex(galleryIndex, galleryCount);
	if (entry.paintedGalleryIndex === nextIndex) {
		return;
	}

	paintInnerPanelAccentTextCanvas(
		entry.accentTextCanvas,
		entry.projectIndex,
		nextIndex,
		galleryCount,
	);
	paintInnerPanelSecondaryTextCanvas(
		entry.secondaryTextCanvas,
		nextIndex,
		galleryCount,
	);
	entry.accentTextTexture.needsUpdate = true;
	entry.secondaryTextTexture.needsUpdate = true;
	entry.paintedGalleryIndex = nextIndex;
}

function startGalleryTransition(entry, targetIndex, nowSeconds, options = {}) {
	if (!entry || targetIndex === entry.galleryIndex) {
		return false;
	}

	const galleryCount = entry.galleryCarousel?.imageCount ?? entry.images?.length ?? 1;
	const forwardDistance = wrapHubPlateGalleryIndex(
		targetIndex - entry.galleryIndex,
		galleryCount,
	);
	const direction = forwardDistance <= galleryCount * 0.5 ? 1 : -1;
	const stepTargetIndex = wrapHubPlateGalleryIndex(
		entry.galleryIndex + direction,
		galleryCount,
	);
	const startProgress = clamp01(options.startProgress ?? 0);
	const fullDurationMs = Math.max(120, entry.galleryTransitionConfig.durationMs ?? 760);
	const durationMs = Math.max(120, fullDurationMs * Math.max(0.18, 1 - startProgress));
	entry.galleryTransition = {
		active: true,
		mode: "commit",
		fromIndex: entry.galleryIndex,
		toIndex: stepTargetIndex,
		direction,
		startedAt: nowSeconds,
		durationMs,
		startProgress,
	};
	const canReuseCarousel = Boolean(
		options.reuseCarousel &&
		entry.galleryCarousel.canContinueTransition(direction, stepTargetIndex)
	);
	if (!canReuseCarousel) {
		entry.galleryCarousel.startTransition(direction, stepTargetIndex);
	}
	entry.galleryCarousel.updateTransition(startProgress, { direct: true });
	playGlitchTextSound(
		durationMs,
		"hover",
		undefined,
		undefined,
		{ volumeGain: entry.galleryTransitionConfig.soundGain ?? 0.56 },
	);
	return true;
}

function startGalleryReturn(entry, direction, startProgress, nowSeconds) {
	const safeProgress = clamp01(startProgress);
	if (!entry || safeProgress <= 0.001 || direction === 0) {
		entry?.galleryCarousel.cancelTransition();
		return false;
	}
	const fullDurationMs = Math.max(
		120,
		entry.galleryTransitionConfig.returnDurationMs ?? 360,
	);
	entry.galleryTransition = {
		active: true,
		mode: "return",
		fromIndex: entry.galleryIndex,
		toIndex: entry.galleryIndex,
		direction,
		startedAt: nowSeconds,
		durationMs: Math.max(120, fullDurationMs * Math.max(0.34, safeProgress)),
		startProgress: safeProgress,
	};
	return true;
}

export class HubPlateInnerPanels {
	constructor() {
		this.entries = [];
		this.activeProjectIndex = -1;
		this._raycaster = new THREE.Raycaster();
		this._pointer = new THREE.Vector2();
		this.hoveredGalleryIndex = null;
		this.hoveredGalleryNavigationDirection = 0;
		this._galleryDrag = null;
		this._suppressNextGalleryClick = false;
		this.galleryDragThresholdNdc = 0.06;
		this.galleryDragTravelNdc = 0.64;
		this.galleryDragClickToleranceNdc = 0.008;
		this.galleryDragFlickVelocityNdc = 0.55;
		this.galleryDragFollowRate = 16;
		this._localeUpdateChain = Promise.resolve();
		this._localeAnimationId = 0;
		this._localeAnimationRaf = 0;
		this._localeAnimationResolve = null;
		this._pendingLocale = null;
		this._pendingLocaleAnimate = false;
		this._localePreparePromise = null;
		this._localePrepareTarget = null;
		this._localeSwitchActive = false;
		this._lastUpdateTimeSeconds = null;
		this._disposed = false;
	}

	async attachToPlates(plates, cfg) {
		this.dispose();
		this._disposed = false;
		await ensureHubPlateInnerPanelFonts();

		const contentGeometry = createPlateScreenSurfaceGeometry(
			cfg,
			cfg.caseSelection?.innerPanel?.contentDepthRatio ?? 0.5,
		);
		const glassGeometry = createPlateScreenSurfaceGeometry(
			cfg,
			1,
			Math.max(0.001, cfg.caseSelection?.innerPanel?.glassFrontOffset ?? 0.001),
		);
		this.sharedGeometry = contentGeometry;
		this.glassGeometry = glassGeometry;
		const galleryPlanesConfig = cfg.caseSelection?.innerPanel?.galleryPlanes ?? {};
		this.galleryPlateGeometry = createGalleryPlateGeometry(cfg, galleryPlanesConfig);
		this.galleryDragThresholdNdc = galleryPlanesConfig.dragThresholdNdc ?? 0.06;
		this.galleryDragTravelNdc = galleryPlanesConfig.dragTravelNdc ?? 0.64;
		this.galleryDragClickToleranceNdc = galleryPlanesConfig.dragClickToleranceNdc ?? 0.008;
		this.galleryDragFlickVelocityNdc = galleryPlanesConfig.dragFlickVelocityNdc ?? 0.55;
		this.galleryDragFollowRate = galleryPlanesConfig.dragFollowRate ?? 16;
		const initialLocale = getPortfolioLocale();

		for (const project of projectsData) {
			const data = getHubPlateInnerPanelData(project, initialLocale);
			const loadedImages = await Promise.all(data.gallery.map(loadImage));
			const images = normalizeGalleryImages(loadedImages);
			const canvas = createLogicalCanvas();
			const accentTextCanvas = createLogicalCanvas();
			const secondaryTextCanvas = createLogicalCanvas(SECONDARY_TEXT_CANVAS_SCALE);
			paintInnerPanelBaseCanvas(canvas, images);
			paintInnerPanelAccentTextCanvas(
				accentTextCanvas,
				this.entries.length,
				0,
				images.length,
			);
			paintInnerPanelSecondaryTextCanvas(secondaryTextCanvas, 0, images.length);
			const galleryAtlas = createGalleryAtlasCanvas(loadedImages);
			const texture = createCanvasTexture(canvas);
			// Keep source screenshots at 1920×945 and sample the full-resolution
			// pixels directly. Mipmap averaging softens the tiny UI lettering.
			const galleryAtlasTexture = createCanvasTexture(galleryAtlas.canvas);
			const accentTextTexture = createCanvasTexture(accentTextCanvas);
			const secondaryTextTexture = createCanvasTexture(secondaryTextCanvas);
			const textShaderConfig = cfg.caseSelection?.innerPanel?.textShader ?? {};
			const textRevealConfig = textShaderConfig.reveal ?? cfg.plateLabel?.reveal ?? {};
			const navigationBaseBloomBoost = textShaderConfig.secondaryBloomBoost ?? 1;
			const navigationHoverBloomBoost = Math.max(
				navigationBaseBloomBoost,
				textShaderConfig.accentBloomBoost ?? cfg.plateLabel?.textBloomBoost ?? 5,
			);

			const material = createHubPlateCasePanelMaterial(
				texture,
				galleryAtlasTexture,
				{
					...cfg.caseSelection?.innerPanel?.hologram,
					fresnelStrength: 0,
					frameStrength: 0,
					cornerRadius: cfg.cornerRadius / cfg.plateSize,
				},
			);
			const mesh = new THREE.Mesh(contentGeometry, material);
			mesh.name = `hubPlateCasePanel_${project.id}`;
			// The screen and text float inside the plate. Gallery planes use their own
			// prepared depths so the active image can physically move toward the glass.
			mesh.renderOrder = 30;
			mesh.visible = false;
			const galleryCarousel = new HubPlateGalleryCarousel(
				{
					texture: galleryAtlasTexture,
					columns: galleryAtlas.columns,
					rows: galleryAtlas.rows,
					imageCount: galleryAtlas.imageCount,
					gutterUv: galleryAtlas.gutterUv,
				},
				this.galleryPlateGeometry,
				cfg,
			);
			mesh.add(galleryCarousel.group);

			const glassMaterial = createHubPlateCasePanelGlassMaterial({
				...cfg.caseSelection?.innerPanel?.glass,
				cornerRadius: cfg.cornerRadius / cfg.plateSize,
			});
			const glassMesh = new THREE.Mesh(glassGeometry, glassMaterial);
			glassMesh.name = `hubPlateCasePanelGlass_${project.id}`;
			glassMesh.renderOrder = 36;
			glassMesh.visible = false;
			glassMesh.raycast = () => {};

			const accentTextMaterial = createHubPlateLabelMaterial(accentTextTexture, {
				opacity: textShaderConfig.accentOpacity ?? 1,
				bloomBoost: textShaderConfig.accentBloomBoost ?? cfg.plateLabel?.textBloomBoost ?? 5,
				revealSeed: this.entries.length * 0.17 + 0.3,
				reveal: textRevealConfig,
			});
			const secondaryTextMaterial = createHubPlateLabelMaterial(secondaryTextTexture, {
				opacity: textShaderConfig.secondaryOpacity ?? 1,
				bloomBoost: textShaderConfig.secondaryBloomBoost ?? 1,
				revealSeed: this.entries.length * 0.17 + 0.3,
				reveal: textRevealConfig,
				hover: {
					leftRect: toPanelUvRect(NAVIGATION_LEFT_ARROW_RECT),
					rightRect: toPanelUvRect(NAVIGATION_RIGHT_ARROW_RECT),
					bloomBoost: navigationHoverBloomBoost,
					color: SITE_MAIN_COLOR,
				},
			});
			accentTextMaterial.depthTest = false;
			accentTextMaterial.side = THREE.DoubleSide;
			secondaryTextMaterial.depthTest = false;
			secondaryTextMaterial.side = THREE.DoubleSide;

			const accentTextMesh = new THREE.Mesh(contentGeometry, accentTextMaterial);
			accentTextMesh.name = `hubPlateCasePanelAccentText_${project.id}`;
			accentTextMesh.position.z = 0.001;
			accentTextMesh.renderOrder = 34;
			accentTextMesh.raycast = () => {};
			const secondaryTextMesh = new THREE.Mesh(contentGeometry, secondaryTextMaterial);
			secondaryTextMesh.name = `hubPlateCasePanelSecondaryText_${project.id}`;
			secondaryTextMesh.position.z = 0.0005;
			secondaryTextMesh.renderOrder = 33;
			secondaryTextMesh.raycast = () => {};
			mesh.add(secondaryTextMesh, accentTextMesh);
			const localizedTextLayers = createInnerPanelLocalizedTextLayers({
				mesh,
				geometry: contentGeometry,
				project,
				projectIndex: this.entries.length,
				locale: initialLocale,
				cfg,
				textShaderConfig,
				textRevealConfig,
			});
			applyHubPlateLabelRevealUniforms(
				accentTextMaterial.uniforms,
				0,
				{ entering: false },
				textRevealConfig,
			);
			applyHubPlateLabelRevealUniforms(
				secondaryTextMaterial.uniforms,
				0,
				{ entering: false },
				textRevealConfig,
			);

			const plate = plates.find((entry) => entry.projectIndex === this.entries.length);
			plate?.mesh?.add(mesh, glassMesh);
			this.entries.push({
				mesh,
				material,
				glassMesh,
				glassMaterial,
				texture,
				galleryAtlasTexture,
				galleryCarousel,
				accentTextTexture,
				secondaryTextTexture,
				accentTextCanvas,
				secondaryTextCanvas,
				accentTextMaterial,
				secondaryTextMaterial,
				localizedTextLayers,
				textRevealConfig,
				project,
				images,
				galleryIndex: 0,
				requestedGalleryIndex: 0,
				paintedGalleryIndex: 0,
				navigationHoverDirection: 0,
				navigationHoverLeftProgress: 0,
				navigationHoverRightProgress: 0,
				navigationBaseBloomBoost,
				navigationHoverBloomBoost,
				galleryTransition: null,
				galleryTransitionConfig: cfg.caseSelection?.innerPanel?.galleryTransition ?? {},
				projectIndex: this.entries.length,
				displayedLocale: initialLocale,
				textRevealAlpha: 0,
				textRevealState: { entering: false, partLinear: 0 },
			});
		}
	}

	_applyEntryTextReveal(entry) {
		if (!entry) {
			return;
		}

		const baseAlpha = clamp01(entry.textRevealAlpha ?? 0);
		// Route/case reveal stays in the prepared material. Locale changes are
		// rendered by compact main/snake atlases on the same curved geometry.
		const revealState = entry.textRevealState;
		const alpha = baseAlpha;

		applyHubPlateLabelRevealUniforms(
			entry.accentTextMaterial.uniforms,
			alpha,
			revealState,
			entry.textRevealConfig,
		);
		applyHubPlateLabelRevealUniforms(
			entry.secondaryTextMaterial.uniforms,
			alpha,
			revealState,
			entry.textRevealConfig,
		);
		for (const localized of entry.localizedTextLayers ?? []) {
			localized.layer.setReveal(alpha, revealState);
		}
	}

	_setEntryTextReveal(entry, alpha, revealState = {}) {
		entry.textRevealAlpha = clamp01(alpha);
		entry.textRevealState = {
			entering: revealState.entering === true,
			partLinear: clamp01(revealState.partLinear ?? revealState.linear ?? alpha),
		};
		this._applyEntryTextReveal(entry);
	}

	_repaintEntryLocale(entry, locale) {
		const nextLines = getInnerPanelLocalizedLines(
			entry.project,
			locale,
			entry.navigationHoverDirection ?? 0,
		);
		for (const localized of entry.localizedTextLayers ?? []) {
			const lines = nextLines[localized.id] ?? [];
			if (localized.layer.hasLineChanges(lines)) {
				localized.layer.setLinesImmediate(lines);
			}
		}
		entry.displayedLocale = locale;
	}

	_cancelLocaleFrameWork() {
		this._localeAnimationId += 1;
		if (this._localeAnimationRaf) {
			cancelAnimationFrame(this._localeAnimationRaf);
			this._localeAnimationRaf = 0;
		}
		if (this._localeAnimationResolve) {
			this._localeAnimationResolve(false);
			this._localeAnimationResolve = null;
		}
		this._localePreparePromise = null;
		this._localePrepareTarget = null;
	}

	_repaintLocaleChunked(locale, animationId, entries = this.entries) {
		if (entries.length === 0) {
			return Promise.resolve(true);
		}
		return new Promise((resolve) => {
			let index = 0;
			this._localeAnimationResolve = resolve;
			const paintNext = () => {
				if (this._disposed || animationId !== this._localeAnimationId) {
					this._localeAnimationRaf = 0;
					this._localeAnimationResolve = null;
					resolve(false);
					return;
				}

				const entry = entries[index];
				if (entry) {
					this._repaintEntryLocale(entry, locale);
				}
				index += 1;
				if (index >= entries.length) {
					this._localeAnimationRaf = 0;
					this._localeAnimationResolve = null;
					resolve(true);
					return;
				}
				this._localeAnimationRaf = requestAnimationFrame(paintNext);
			};

			paintNext();
		});
	}

	_preparePendingLocaleForProject(projectIndex) {
		const targetLocale = this._pendingLocale;
		if (
			!targetLocale ||
			this._pendingLocaleAnimate ||
			this._localeSwitchActive ||
			this._disposed ||
			this.entries.length === 0 ||
			!Number.isInteger(projectIndex) ||
			projectIndex < 0 ||
			projectIndex >= this.entries.length
		) {
			return;
		}
		if (this._localePreparePromise && this._localePrepareTarget === targetLocale) {
			return;
		}
		if (this._localePreparePromise) {
			this._cancelLocaleFrameWork();
		}

		const count = this.entries.length;
		const priority = [
			projectIndex,
			(projectIndex - 1 + count) % count,
			(projectIndex + 1) % count,
		];
		// Only the current screen and its immediately visible neighbours are
		// prepared. Other warm plates keep the pending locale until they are
		// actually about to enter the project column.
		const orderedEntries = priority
			.map((index) => this.entries[index])
			.filter((entry) => entry && entry.displayedLocale !== targetLocale);
		if (orderedEntries.length === 0) {
			if (this.entries.every((entry) => entry.displayedLocale === targetLocale)) {
				this._pendingLocale = null;
			}
			return;
		}
		const animationId = ++this._localeAnimationId;
		this._localePrepareTarget = targetLocale;
		this._localePreparePromise = this._repaintLocaleChunked(
			targetLocale,
			animationId,
			orderedEntries,
		).then((completed) => {
			if (
				completed &&
				this._pendingLocale === targetLocale &&
				this.entries.every((entry) => entry.displayedLocale === targetLocale)
			) {
				this._pendingLocale = null;
			}
		}).finally(() => {
			if (this._localePrepareTarget === targetLocale) {
				this._localePreparePromise = null;
				this._localePrepareTarget = null;
			}
		});
	}

	_tryPlayPendingLocaleSnake(cfg) {
		if (
			!this._pendingLocaleAnimate ||
			!this._pendingLocale ||
			this._localeSwitchActive ||
			this._disposed
		) {
			return;
		}

		const activeEntry = this.entries.find((entry) => entry.projectIndex === this.activeProjectIndex);
		if (!activeEntry?.mesh.visible || activeEntry.textRevealAlpha < 0.999) {
			return;
		}

		const targetLocale = this._pendingLocale;
		this._pendingLocaleAnimate = false;
		void this.updateLocale(targetLocale, cfg, { animate: true });
	}

	updateLocale(locale, cfg, { animate = true } = {}) {
		const targetLocale = normalizeSiteLocale(locale);
		this._localeUpdateChain = this._localeUpdateChain.then(() => (
			this._updateLocaleImpl(targetLocale, cfg, { animate })
		));
		return this._localeUpdateChain;
	}

	async _updateLocaleImpl(targetLocale, cfg, { animate = true } = {}) {
		if (this._disposed || this.entries.length === 0) {
			return;
		}
		if (this._localePreparePromise) {
			this._cancelLocaleFrameWork();
		}
		if (this.entries.every((entry) => entry.displayedLocale === targetLocale)) {
			this._pendingLocale = null;
			this._pendingLocaleAnimate = false;
			return;
		}

		if (!animate) {
			this._pendingLocale = targetLocale;
			this._pendingLocaleAnimate = false;
			return;
		}

		// Visibility is transitional while the project column scrolls, so it is
		// not a safe animation budget. Locale snakes are hard-limited to the
		// route-current project and its two ring neighbours.
		const snakeProjectIndices = getLocaleSnakeProjectIndices(
			this.activeProjectIndex,
			this.entries.length,
		);
		const snakeCandidates = this.entries.filter((entry) => (
			entry.displayedLocale !== targetLocale &&
			snakeProjectIndices.has(entry.projectIndex)
		));
		const animatedEntries = snakeCandidates.filter((entry) => (
			entry.mesh.visible && entry.textRevealAlpha > 0.001
		));

		if (animatedEntries.length === 0) {
			// The locale click may arrive while the cold case is still appearing.
			// Keep the old prepared glyphs until the panel is fully visible, then run
			// the exact same portfolio snake instead of replacing text under reveal.
			this._pendingLocale = targetLocale;
			this._pendingLocaleAnimate = snakeCandidates.length > 0;

			// Far projects still receive the locale immediately, but their static
			// canvases are uploaded one plate per frame and never enter the snake.
			const silentEntries = this.entries.filter((entry) => (
				entry.displayedLocale !== targetLocale &&
				!snakeProjectIndices.has(entry.projectIndex)
			));
			if (silentEntries.length > 0) {
				this._localeSwitchActive = true;
				try {
					const animationId = ++this._localeAnimationId;
					await this._repaintLocaleChunked(targetLocale, animationId, silentEntries);
				} finally {
					this._localeSwitchActive = false;
				}
			}
			if (this.entries.every((entry) => entry.displayedLocale === targetLocale)) {
				this._pendingLocale = null;
				this._pendingLocaleAnimate = false;
			}
			return;
		}

		this._localeSwitchActive = true;
		const runOptions = getHeroGlitchSnakeRunOptions({ playSound: false });
		let maxSwitchDuration = 0;
		const nextLinesByEntry = new Map();
		const changedLayersByEntry = new Map();
		for (const entry of animatedEntries) {
			const nextLines = getInnerPanelLocalizedLines(
				entry.project,
				targetLocale,
				entry.navigationHoverDirection ?? 0,
			);
			nextLinesByEntry.set(entry, nextLines);
			const localizedLayers = entry.localizedTextLayers ?? [];
			const immediateLayers = localizedLayers.filter((localized) => (
				localized.animateLocale === false &&
				localized.layer.hasLineChanges(nextLines[localized.id] ?? [])
			));
			for (const localized of immediateLayers) {
				localized.layer.setLinesImmediate(nextLines[localized.id] ?? []);
			}
			const changedLayers = localizedLayers.filter((localized) => (
				localized.animateLocale !== false &&
				localized.layer.hasLineChanges(nextLines[localized.id] ?? [])
			));
			changedLayersByEntry.set(entry, changedLayers);
			for (const localized of changedLayers) {
				maxSwitchDuration = Math.max(
					maxSwitchDuration,
					localized.layer.estimateSwitchDuration(nextLines[localized.id] ?? [], runOptions),
				);
			}
		}
		if (maxSwitchDuration > 0) {
			// One shared sound, exactly like HubScreenProjectsColumn.switchLocale().
			playGlitchTextSound(maxSwitchDuration, "hover");
		}

		try {
			await Promise.all(animatedEntries.map(async (entry) => {
				const nextLines = nextLinesByEntry.get(entry);
				const results = await Promise.all((changedLayersByEntry.get(entry) ?? []).map((localized) => (
					localized.layer.switchLines(
						nextLines[localized.id] ?? [],
						runOptions,
					)
				)));
				if (!this._disposed && results.every(Boolean)) {
					entry.displayedLocale = targetLocale;
				}
			}));

			if (!this._disposed) {
				// The animation budget is the trio captured when the locale was clicked.
				// If the user scrolls to another case mid-snake, do not start a second
				// wave on the newly visible trio; finish every remaining plate statically.
				const silentEntries = this.entries.filter((entry) => (
					entry.displayedLocale !== targetLocale
				));
				if (silentEntries.length > 0) {
					const animationId = ++this._localeAnimationId;
					await this._repaintLocaleChunked(targetLocale, animationId, silentEntries);
				}
			}
		} finally {
			if (!this._disposed) {
				this._localeSwitchActive = false;
				this._pendingLocaleAnimate = false;
				this._pendingLocale = this.entries.every((entry) => entry.displayedLocale === targetLocale)
					? null
					: targetLocale;
				if (this._pendingLocale) {
					this._preparePendingLocaleForProject(this.activeProjectIndex);
				}
			}
		}
	}

	setActiveProject(projectIndex) {
		this.activeProjectIndex = projectIndex;
		this._preparePendingLocaleForProject(projectIndex);
		for (const entry of this.entries) {
			entry.navigationHoverDirection = 0;
			entry.navigationHoverLeftProgress = 0;
			entry.navigationHoverRightProgress = 0;
			applyHubPlateLabelHoverUniforms(entry.secondaryTextMaterial, 0, 0);
			const navigationLayer = (entry.localizedTextLayers ?? []).find(
				(localized) => localized.id === "navigation",
			)?.layer;
			applyHubPlateLabelHoverUniforms(navigationLayer?.mainMaterial, 0, 0);
			setHubPlateCasePanelOpacity(entry.material, 0);
			setHubPlateCasePanelOpacity(entry.glassMaterial, 0);
			this._setEntryTextReveal(entry, 0, { entering: false, partLinear: 0 });
			entry.galleryIndex = 0;
			entry.requestedGalleryIndex = 0;
			entry.galleryTransition = null;
			entry.galleryCarousel.reset(0);
			entry.galleryCarousel.setReveal(0);
			syncGalleryChrome(entry, 0);
			const active = entry.projectIndex === projectIndex;
			entry.mesh.visible = active;
			entry.glassMesh.visible = active;
			entry.galleryCarousel.setVisible(active);
		}
	}

	switchActiveProject(projectIndex) {
		if (projectIndex === this.activeProjectIndex) {
			return;
		}
		this.clearGalleryPointer();
		this.clearGalleryHover();
		const previousEntry = this.entries.find(
			(entry) => entry.projectIndex === this.activeProjectIndex,
		);
		if (previousEntry) {
			previousEntry.navigationHoverLeftProgress = 0;
			previousEntry.navigationHoverRightProgress = 0;
			applyHubPlateLabelHoverUniforms(previousEntry.secondaryTextMaterial, 0, 0);
			const navigationLayer = (previousEntry.localizedTextLayers ?? []).find(
				(localized) => localized.id === "navigation",
			)?.layer;
			applyHubPlateLabelHoverUniforms(navigationLayer?.mainMaterial, 0, 0);
		}
		this.activeProjectIndex = projectIndex;
		this._preparePendingLocaleForProject(projectIndex);
	}

	setRevealProgress(progress, config = {}) {
		this._preparePendingLocaleForProject(this.activeProjectIndex);
		const start = clamp01(config.revealStartFraction ?? 0.32);
		const end = Math.max(start + 0.001, clamp01(config.revealEndFraction ?? 0.78));
		const reveal = clamp01((progress - start) / (end - start));
		const eased = reveal * reveal * (3 - 2 * reveal);

		for (const entry of this.entries) {
			if (entry.projectIndex !== this.activeProjectIndex) {
				continue;
			}
			entry.mesh.visible = eased > 0.001;
			setHubPlateCasePanelOpacity(entry.material, eased);
			entry.glassMesh.visible = eased > 0.001;
			setHubPlateCasePanelOpacity(entry.glassMaterial, eased);
			entry.galleryCarousel.setVisible(eased > 0.001);
			entry.galleryCarousel.setReveal(eased);
			const revealState = { entering: true, partLinear: reveal };
			this._setEntryTextReveal(entry, eased, revealState);
		}
		this._tryPlayPendingLocaleSnake(config);
	}

	_setEntryColumnReveal(entry, reveal) {
		const alpha = clamp01(reveal);
		const visible = alpha > 0.001;
		entry.mesh.visible = visible;
		setHubPlateCasePanelOpacity(entry.material, alpha);
		entry.glassMesh.visible = visible;
		setHubPlateCasePanelOpacity(entry.glassMaterial, alpha);
		entry.galleryCarousel.setVisible(visible);
		entry.galleryCarousel.setReveal(alpha);
		const revealState = { entering: true, partLinear: 1 };
		this._setEntryTextReveal(entry, alpha, revealState);
	}

	/** Current, previous and next project screens remain live while the column moves. */
	setColumnProjectProgress(activeProjectIndex, progress, config = {}) {
		if (activeProjectIndex < 0 || this.entries.length === 0) {
			return;
		}
		const count = this.entries.length;
		const localProgress = Math.max(-1.5, Math.min(1.5, Number(progress) || 0));
		const sideOpacity = clamp01(config.sideOpacity ?? 0.7);
		const fadeDistance = Math.max(0.05, config.fadeDistance ?? 0.38);

		for (const entry of this.entries) {
			const forward = (entry.projectIndex - activeProjectIndex + count) % count;
			const half = Math.floor(count / 2);
			const offset = forward > half ? forward - count : forward;
			const distance = Math.abs(offset - localProgress);
			let reveal = 0;
			if (distance <= 1) {
				reveal = sideOpacity + (1 - sideOpacity) * (1 - distance);
			} else if (distance < 1 + fadeDistance) {
				const fade = 1 - (distance - 1) / fadeDistance;
				reveal = sideOpacity * fade * fade * (3 - 2 * fade);
			}
			this._setEntryColumnReveal(entry, reveal);
		}
	}

	showOnlyActiveProject() {
		for (const entry of this.entries) {
			if (entry.projectIndex !== this.activeProjectIndex) {
				this._setEntryColumnReveal(entry, 0);
			}
		}
	}

	update(timeSeconds) {
		const deltaSeconds = this._lastUpdateTimeSeconds == null
			? 1 / 60
			: Math.max(0, Math.min(0.05, timeSeconds - this._lastUpdateTimeSeconds));
		this._lastUpdateTimeSeconds = timeSeconds;
		for (const entry of this.entries) {
			if (!entry.mesh.visible) {
				continue;
			}
			updateHubPlateCasePanelMaterial(entry.material, timeSeconds);
			updateHubPlateCasePanelMaterial(entry.glassMaterial, timeSeconds);
			entry.galleryCarousel.updateTime(timeSeconds);
			if (entry.projectIndex !== this.activeProjectIndex) {
				continue;
			}
			const hoverAlpha = 1 - Math.exp(-NAVIGATION_HOVER_RESPONSE * deltaSeconds);
			const leftTarget = entry.navigationHoverDirection < 0 ? 1 : 0;
			const rightTarget = entry.navigationHoverDirection > 0 ? 1 : 0;
			entry.navigationHoverLeftProgress +=
				(leftTarget - entry.navigationHoverLeftProgress) * hoverAlpha;
			entry.navigationHoverRightProgress +=
				(rightTarget - entry.navigationHoverRightProgress) * hoverAlpha;
			applyHubPlateLabelHoverUniforms(
				entry.secondaryTextMaterial,
				entry.navigationHoverLeftProgress,
				entry.navigationHoverRightProgress,
			);
			const navigationLayer = (entry.localizedTextLayers ?? []).find(
				(localized) => localized.id === "navigation",
			)?.layer;
			applyHubPlateLabelHoverUniforms(
				navigationLayer?.mainMaterial,
				entry.navigationHoverLeftProgress,
				entry.navigationHoverRightProgress,
			);
			const transition = entry.galleryTransition;
			if (transition?.active) {
				const elapsedMs = Math.max(0, (timeSeconds - transition.startedAt) * 1000);
				const linearProgress = clamp01(elapsedMs / transition.durationMs);
				const easedProgress = linearProgress * linearProgress * (3 - 2 * linearProgress);
				const startProgress = clamp01(transition.startProgress ?? 0);
				const progress = transition.mode === "return"
					? startProgress * (1 - easedProgress)
					: startProgress + (1 - startProgress) * easedProgress;
				entry.galleryCarousel.updateTransition(progress, { direct: true });
				if (linearProgress >= 1) {
					if (transition.mode === "return") {
						entry.galleryCarousel.cancelTransition();
					} else {
						entry.galleryIndex = transition.toIndex;
						entry.galleryCarousel.completeTransition();
					}
					entry.galleryTransition = null;
					if (entry.requestedGalleryIndex !== entry.galleryIndex) {
						startGalleryTransition(
							entry,
							entry.requestedGalleryIndex,
							timeSeconds,
						);
					}
				}
			}
		}
	}

	_getGalleryCanvasPointAtPointer(camera, pointer) {
		const entry = this.entries.find((candidate) => candidate.projectIndex === this.activeProjectIndex);
		if (
			!entry?.mesh.visible ||
			getHubPlateCasePanelOpacity(entry.material) < 0.2 ||
			!camera ||
			!pointer
		) {
			return null;
		}

		this._pointer.set(pointer.x, pointer.y);
		this._raycaster.setFromCamera(this._pointer, camera);
		const hit = this._raycaster.intersectObject(entry.mesh, false)[0];
		if (!hit?.uv) {
			return null;
		}

		return {
			x: hit.uv.x * CANVAS_WIDTH,
			y: (1 - hit.uv.y) * CANVAS_HEIGHT,
		};
	}

	_getGallerySlotAtPointer(camera, pointer) {
		const point = this._getGalleryCanvasPointAtPointer(camera, pointer);
		return point ? getHubPlateGallerySlotAtPoint(point.x, point.y) : null;
	}

	_getGalleryNavigationDirectionAtPointer(camera, pointer) {
		const point = this._getGalleryCanvasPointAtPointer(camera, pointer);
		if (!point) {
			return 0;
		}
		return (
			getHubPlateGalleryNavigationDirectionAtPoint(point.x, point.y) ||
			getHubPlateGallerySlotAtPoint(point.x, point.y) ||
			0
		);
	}

	_setGalleryNavigationHover(direction) {
		const safeDirection = direction < 0 ? -1 : direction > 0 ? 1 : 0;
		const entry = this.entries.find(
			(candidate) => candidate.projectIndex === this.activeProjectIndex,
		);
		if (!entry || entry.navigationHoverDirection === safeDirection) {
			return;
		}

		entry.navigationHoverDirection = safeDirection;
	}

	updateGalleryHover(camera, pointer) {
		const point = this._getGalleryCanvasPointAtPointer(camera, pointer);
		this.hoveredGalleryIndex = point
			? getHubPlateGallerySlotAtPoint(point.x, point.y)
			: null;
		const navigationDirection = point
			? getHubPlateGalleryNavigationDirectionAtPoint(point.x, point.y)
			: 0;
		if (navigationDirection !== this.hoveredGalleryNavigationDirection) {
			this._setGalleryNavigationHover(navigationDirection);
		}
		this.hoveredGalleryNavigationDirection = navigationDirection;
		return this.hoveredGalleryIndex !== null || this.hoveredGalleryNavigationDirection !== 0;
	}

	isGalleryNavigationHovered() {
		return this.hoveredGalleryNavigationDirection !== 0;
	}

	clearGalleryHover() {
		this._setGalleryNavigationHover(0);
		this.hoveredGalleryIndex = null;
		this.hoveredGalleryNavigationDirection = 0;
	}

	clearGalleryPointer() {
		if (this._galleryDrag) {
			const entry = this.entries.find(
				(candidate) => candidate.projectIndex === this.activeProjectIndex,
			);
			if (!entry?.galleryTransition?.active) {
				entry?.galleryCarousel.cancelTransition();
			}
		}
		this._galleryDrag = null;
		this._suppressNextGalleryClick = false;
	}

	_requestGalleryDirection(entry, direction, nowSeconds) {
		if (!entry || direction === 0) {
			return false;
		}
		const targetIndex = wrapHubPlateGalleryIndex(
			entry.requestedGalleryIndex + direction,
			entry.galleryCarousel.imageCount,
		);
		entry.requestedGalleryIndex = targetIndex;
		syncGalleryChrome(entry, targetIndex);
		if (!entry.galleryTransition?.active) {
			startGalleryTransition(entry, targetIndex, nowSeconds);
		}
		return true;
	}

	updateGalleryDrag(camera, pointer, pointerDown, nowSeconds = performance.now() / 1000) {
		const entry = this.entries.find((candidate) => candidate.projectIndex === this.activeProjectIndex);
		if (!entry?.mesh.visible || !camera || !pointer) {
			if (!pointerDown) {
				this._galleryDrag = null;
			}
			return false;
		}

		if (pointerDown) {
			if (!this._galleryDrag) {
				if (entry.galleryTransition?.active) {
					return false;
				}
				const slot = this._getGallerySlotAtPointer(camera, pointer);
				if (slot === null) {
					return false;
				}
				this._galleryDrag = {
					startX: pointer.x,
					lastX: pointer.x,
					lastAt: nowSeconds,
					velocityX: 0,
					visualOffset: 0,
					direction: 0,
					progress: 0,
					moved: false,
				};
			}

			const drag = this._galleryDrag;
			const elapsed = Math.min(0.05, Math.max(1 / 240, nowSeconds - drag.lastAt));
			const frameVelocity = (pointer.x - drag.lastX) / elapsed;
			drag.velocityX += (frameVelocity - drag.velocityX) * 0.35;
			drag.lastX = pointer.x;
			drag.lastAt = nowSeconds;

			const dragDistance = pointer.x - drag.startX;
			const absoluteDistance = Math.abs(dragDistance);
			if (absoluteDistance >= this.galleryDragClickToleranceNdc) {
				drag.moved = true;
				this._suppressNextGalleryClick = true;
			}

			const targetOffset = Math.max(
				-1,
				Math.min(1, dragDistance / Math.max(0.05, this.galleryDragTravelNdc)),
			);
			const followAlpha = 1 - Math.exp(-Math.max(1, this.galleryDragFollowRate) * elapsed);
			drag.visualOffset += (targetOffset - drag.visualOffset) * followAlpha;

			if (Math.abs(drag.visualOffset) <= 0.0005) {
				if (drag.direction !== 0) {
					entry.galleryCarousel.cancelTransition();
				}
				drag.visualOffset = 0;
				drag.direction = 0;
				drag.progress = 0;
				return true;
			}

			const direction = drag.visualOffset < 0 ? 1 : -1;
			const targetIndex = wrapHubPlateGalleryIndex(
				entry.galleryIndex + direction,
				entry.galleryCarousel.imageCount,
			);
			if (
				drag.direction !== direction ||
				!entry.galleryCarousel.canContinueTransition(direction, targetIndex)
			) {
				entry.galleryCarousel.startTransition(direction, targetIndex);
			}
			drag.direction = direction;
			drag.progress = clamp01(Math.abs(drag.visualOffset));
			entry.galleryCarousel.updateTransition(drag.progress, { direct: true });
			return true;
		}

		const drag = this._galleryDrag;
		this._galleryDrag = null;
		if (!drag) {
			return false;
		}
		if (!drag.moved || drag.direction === 0) {
			entry.galleryCarousel.cancelTransition();
			return false;
		}

		const dragDistance = Math.abs(drag.lastX - drag.startX);
		const releaseDirection = Math.sign(drag.lastX - drag.startX);
		const requestedDirection = releaseDirection < 0 ? 1 : -1;
		const directionAligned = releaseDirection !== 0 && requestedDirection === drag.direction;
		const hasTravel = directionAligned && dragDistance >= this.galleryDragThresholdNdc;
		const hasFlick = (
			directionAligned &&
			drag.progress >= 0.04 &&
			Math.abs(drag.velocityX) >= this.galleryDragFlickVelocityNdc &&
			Math.sign(drag.velocityX) === releaseDirection
		);
		if (hasTravel || hasFlick) {
			const targetIndex = wrapHubPlateGalleryIndex(
				entry.galleryIndex + drag.direction,
				entry.galleryCarousel.imageCount,
			);
			entry.requestedGalleryIndex = targetIndex;
			syncGalleryChrome(entry, targetIndex);
			startGalleryTransition(entry, targetIndex, nowSeconds, {
				startProgress: drag.progress,
				reuseCarousel: true,
			});
		} else {
			entry.requestedGalleryIndex = entry.galleryIndex;
			startGalleryReturn(entry, drag.direction, drag.progress, nowSeconds);
		}
		return true;
	}

	trySelectGalleryAtPointer(camera, pointer, nowSeconds = performance.now() / 1000) {
		if (this._suppressNextGalleryClick) {
			this._suppressNextGalleryClick = false;
			return true;
		}
		const entry = this.entries.find((candidate) => candidate.projectIndex === this.activeProjectIndex);
		const direction = this._getGalleryNavigationDirectionAtPointer(camera, pointer);
		if (direction === 0) {
			return false;
		}
		return this._requestGalleryDirection(entry, direction, nowSeconds);
	}

	reset() {
		this.activeProjectIndex = -1;
		this.hoveredGalleryIndex = null;
		this.hoveredGalleryNavigationDirection = 0;
		this.clearGalleryPointer();
		for (const entry of this.entries) {
			setHubPlateCasePanelOpacity(entry.material, 0);
			setHubPlateCasePanelOpacity(entry.glassMaterial, 0);
			this._setEntryTextReveal(entry, 0, { entering: false, partLinear: 0 });
			entry.galleryTransition = null;
			entry.requestedGalleryIndex = entry.galleryIndex;
			entry.galleryCarousel.reset(entry.galleryIndex);
			entry.galleryCarousel.setReveal(0);
			entry.galleryCarousel.setVisible(false);
			entry.mesh.visible = false;
			entry.glassMesh.visible = false;
		}
	}

	beginWarmupDraw() {
		const token = {
			activeProjectIndex: this.activeProjectIndex,
			states: this.entries.map((entry) => ({
				visible: entry.mesh.visible,
				glassVisible: entry.glassMesh.visible,
				opacity: getHubPlateCasePanelOpacity(entry.material),
				glassOpacity: getHubPlateCasePanelOpacity(entry.glassMaterial),
				textReveal: entry.accentTextMaterial.uniforms.revealProgress.value,
				galleryVisible: entry.galleryCarousel.group.visible,
				galleryReveal: entry.galleryCarousel.reveal,
			})),
		};
		for (const entry of this.entries) {
			entry.mesh.visible = true;
			entry.glassMesh.visible = true;
			entry.galleryCarousel.setVisible(true);
			entry.galleryCarousel.setReveal(1);
			setHubPlateCasePanelOpacity(entry.material, 1);
			setHubPlateCasePanelOpacity(entry.glassMaterial, 1);
			this._setEntryTextReveal(entry, 1, { entering: true, partLinear: 1 });
		}
		return token;
	}

	endWarmupDraw(token) {
		this.activeProjectIndex = token?.activeProjectIndex ?? -1;
		for (let index = 0; index < this.entries.length; index += 1) {
			const state = token?.states?.[index];
			this.entries[index].mesh.visible = state?.visible ?? false;
			this.entries[index].glassMesh.visible = state?.glassVisible ?? false;
			this.entries[index].galleryCarousel.setVisible(state?.galleryVisible ?? false);
			this.entries[index].galleryCarousel.setReveal(state?.galleryReveal ?? 0);
			setHubPlateCasePanelOpacity(this.entries[index].material, state?.opacity ?? 0);
			setHubPlateCasePanelOpacity(this.entries[index].glassMaterial, state?.glassOpacity ?? 0);
			const textReveal = state?.textReveal ?? 0;
			this._setEntryTextReveal(
				this.entries[index],
				textReveal,
				{ entering: false, partLinear: textReveal },
			);
		}
	}

	dispose() {
		this._disposed = true;
		this._cancelLocaleFrameWork();
		for (const entry of this.entries) {
			entry.mesh.parent?.remove(entry.mesh);
			entry.glassMesh.parent?.remove(entry.glassMesh);
			entry.material.dispose();
			entry.glassMaterial.dispose();
			entry.accentTextMaterial.dispose();
			entry.secondaryTextMaterial.dispose();
			entry.galleryCarousel.dispose();
			entry.texture.dispose();
			entry.galleryAtlasTexture.dispose();
			entry.accentTextTexture.dispose();
			entry.secondaryTextTexture.dispose();
			for (const localized of entry.localizedTextLayers ?? []) {
				localized.layer.dispose();
			}
		}
		this.entries = [];
		this.sharedGeometry?.dispose();
		this.sharedGeometry = null;
		this.glassGeometry?.dispose();
		this.glassGeometry = null;
		this.galleryPlateGeometry?.dispose();
		this.galleryPlateGeometry = null;
		this.activeProjectIndex = -1;
		this.clearGalleryHover();
		this.clearGalleryPointer();
		this._localeUpdateChain = Promise.resolve();
		this._pendingLocale = null;
		this._pendingLocaleAnimate = false;
		this._localePreparePromise = null;
		this._localePrepareTarget = null;
		this._localeSwitchActive = false;
	}
}
