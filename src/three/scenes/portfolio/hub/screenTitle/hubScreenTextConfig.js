import * as THREE from "three";
import { portfolioHubPlatesConfig } from "../portfolioHubConfig.js";

const DEFAULT_LAYER = {
	enabled: true,
	text: "",
	uppercase: false,
	fontSize: 28,
	fontWeight: 500,
	color: "#ffffff",
	letterSpacing: 0.08,
	glow: 0,
	opacity: 1,
	planeHeight: 0.3,
	planeWidth: null,
	paddingLeft: 24,
	paddingTop: 12,
	paddingRight: 24,
	paddingBottom: 12,
	shader: "basic",
	reveal: {},
	blur: 0,
	glitch: {},
	renderOrder: 999,
};

const DEFAULT_PROJECTS_COLUMN = {
	enabled: true,
	offset: [5.8, 0.05, 0],
	lineGap: -0.09,
	layerDefaults: {
		fontSize: 30,
		fontWeight: 600,
		color: "#ffffff",
		letterSpacing: 0,
		uppercase: true,
		glow: 0,
		activeGlow: 12,
		planeHeight: 0.34,
		shader: "whiteText",
		snakeShader: "snakeText",
		inactiveOpacity: 0.5,
		hoveredOpacity: 0.72,
		activeOpacity: 1,
		activeColor: "#f4fbff",
	},
};

export function resolveLayer(layerDef = {}, stackDefaults = {}) {
	const merged = {
		...DEFAULT_LAYER,
		...stackDefaults.layerDefaults,
		...layerDef,
	};

	return {
		id: merged.id ?? "text",
		enabled: merged.enabled !== false,
		text: String(merged.text ?? ""),
		uppercase: merged.uppercase === true,
		fontSize: merged.fontSize ?? 28,
		fontWeight: merged.fontWeight ?? 500,
		color: merged.color ?? "#ffffff",
		letterSpacing: merged.letterSpacing ?? 0.08,
		glow: merged.glow ?? 0,
		activeGlow: merged.activeGlow ?? merged.glow ?? 0,
		activeColor: merged.activeColor ?? merged.color ?? "#ffffff",
		opacity: merged.opacity ?? 1,
		planeHeight: merged.planeHeight ?? 0.3,
		planeWidth: merged.planeWidth ?? null,
		paddingLeft: merged.paddingLeft ?? 24,
		paddingTop: merged.paddingTop ?? 12,
		paddingRight: merged.paddingRight ?? 24,
		paddingBottom: merged.paddingBottom ?? 12,
		shader: merged.shader ?? "basic",
		snakeShader: merged.snakeShader ?? "snakeText",
		reveal: merged.reveal ?? {},
		blur: merged.blur ?? 0,
		glitch: merged.glitch ?? {},
		renderOrder: merged.renderOrder ?? 999,
		meta: merged.meta ?? null,
	};
}

function legacyLayersFromFlat(titleCfg) {
	return [
		{
			id: "primary",
			text: titleCfg.primary ?? "ПОРТФОЛИО",
			uppercase: true,
			fontSize: titleCfg.primaryFontSize ?? 56,
			fontWeight: titleCfg.primaryFontWeight ?? 600,
			color: titleCfg.color ?? "#7cc5fe",
			letterSpacing: titleCfg.letterSpacing ?? 0.12,
			glow: titleCfg.primaryGlow ?? 12,
			planeHeight: titleCfg.size?.[1] ? titleCfg.size[1] * 0.52 : 0.55,
			opacity: 1,
			shader: "basic",
		},
		{
			id: "secondary",
			text: titleCfg.secondary ?? "Последние проекты",
			fontSize: titleCfg.secondaryFontSize ?? 28,
			fontWeight: titleCfg.secondaryFontWeight ?? 500,
			color: titleCfg.secondaryColor ?? "#ffffff",
			letterSpacing: titleCfg.secondaryLetterSpacing ?? 0.08,
			planeHeight: titleCfg.size?.[1] ? titleCfg.size[1] * 0.48 : 0.28,
			opacity: titleCfg.secondaryOpacity ?? 0.72,
			shader: "basic",
		},
	];
}

function resolveLeftColumn(titleCfg) {
	const rawLayers = Array.isArray(titleCfg.left?.layers)
		? titleCfg.left.layers
		: Array.isArray(titleCfg.layers) && titleCfg.layers.length > 0
			? titleCfg.layers
			: titleCfg.left?.layers === undefined && !titleCfg.layers
				? legacyLayersFromFlat(titleCfg)
				: [];

	const stackDefaults = {
		lineGap: titleCfg.left?.lineGap ?? titleCfg.lineGap ?? 14,
		layerDefaults: titleCfg.left?.layerDefaults ?? titleCfg.layerDefaults ?? {},
	};

	return {
		offset: titleCfg.left?.offset ?? [0, 0, 0],
		lineGap: stackDefaults.lineGap,
		layerDefaults: stackDefaults.layerDefaults,
		layers: rawLayers.map((layerDef) => resolveLayer(layerDef, stackDefaults)),
	};
}

function resolveProjectsColumn(titleCfg) {
	const projectsCfg = {
		...DEFAULT_PROJECTS_COLUMN,
		...titleCfg.projects,
		layerDefaults: {
			...DEFAULT_PROJECTS_COLUMN.layerDefaults,
			...(titleCfg.projects?.layerDefaults ?? {}),
		},
	};

	return {
		enabled: projectsCfg.enabled !== false,
		offset: projectsCfg.offset ?? DEFAULT_PROJECTS_COLUMN.offset,
		lineGap: projectsCfg.lineGap ?? DEFAULT_PROJECTS_COLUMN.lineGap,
		layerDefaults: projectsCfg.layerDefaults,
		overrides: projectsCfg.overrides ?? {},
	};
}

/** HUD: левая колонка (тексты) + правая (проекты). */
export function normalizeHubScreenHudConfig(cfg = portfolioHubPlatesConfig) {
	const titleCfg = cfg.hubScreenTitle ?? {};
	const cameraOffset = titleCfg.cameraOffset ?? titleCfg.position ?? [-2.4, 0.55, -7];

	return {
		enabled: titleCfg.enabled !== false,
		cameraOffset: new THREE.Vector3(cameraOffset[0], cameraOffset[1], cameraOffset[2]),
		opacity: titleCfg.opacity ?? 1,
		left: resolveLeftColumn(titleCfg),
		projects: resolveProjectsColumn(titleCfg),
	};
}

/** @deprecated Используй normalizeHubScreenHudConfig */
export function normalizeHubScreenTitleConfig(cfg = portfolioHubPlatesConfig) {
	const hud = normalizeHubScreenHudConfig(cfg);
	return {
		enabled: hud.enabled,
		cameraOffset: hud.cameraOffset,
		lineGap: hud.left.lineGap,
		opacity: hud.opacity,
		layers: hud.left.layers,
	};
}
