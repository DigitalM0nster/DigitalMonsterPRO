import { getAllPortfolioProjects } from "@/portfolio/core/projectRegistry.js";
import { getPortfolioProjectName } from "@/i18n/portfolioProjectsCopy.js";
import { requestPortfolioCaseNavigation } from "@/utils/portfolioHubNavigate.js";
import { normalizeSiteLocale } from "@/utils/siteLocale.js";
import { playUiClickSound } from "@/sounds/soundDesign.js";
import { CASE_STUDY_CANVAS_THEME } from "./caseStudyCanvasTheme.js";
import { CASE_STUDY_DISPLAY_FONT, measureTextWithSpacing } from "./caseStudyCanvasText.js";
import { drawCaseAllProjectsMarkerLine } from "./caseAllProjectsLineSnake.js";
import { drawCaseProjectNavSnakeLabel, getCaseProjectNavSnakeLayoutText } from "./caseProjectNavSnake.js";

const COPY = {
	ru: {
		all: "ВСЕ ПРОЕКТЫ",
		back: "вернуться к списку",
		previous: "ПРЕДЫДУЩИЙ ПРОЕКТ",
		next: "СЛЕДУЮЩИЙ ПРОЕКТ",
	},
	en: {
		all: "ALL PROJECTS",
		back: "return to the list",
		previous: "PREVIOUS PROJECT",
		next: "NEXT PROJECT",
	},
	zh: {
		all: "全部项目",
		back: "返回项目列表",
		previous: "上一个项目",
		next: "下一个项目",
	},
};

/** @type {HTMLCanvasElement | null} */
let measureCanvas = null;
/** @type {{ key: string, textW: number } | null} */
let contentTextWCache = null;

function clamp(min, value, max) {
	return Math.min(max, Math.max(min, value));
}

function drawSpacedText(ctx, text, x, y, letterSpacing = 0) {
	const value = String(text ?? "");
	const startX = Math.round(x);
	const startY = Math.round(y);
	if (!value || Math.abs(letterSpacing) < 0.001) {
		ctx.fillText(value, startX, startY);
		return ctx.measureText(value).width;
	}

	let cursorX = startX;
	for (const char of value) {
		ctx.fillText(char, Math.round(cursorX), startY);
		cursorX += ctx.measureText(char).width + letterSpacing;
	}
	return Math.max(0, cursorX - startX - letterSpacing);
}

function drawNode(ctx, x, y, size, direction) {
	const theme = CASE_STUDY_CANVAS_THEME;
	const r = size / 2;
	const coreR = Math.max(3, size * 0.075);

	ctx.save();
	ctx.translate(x, y);

	ctx.shadowColor = theme.cyanGlow;
	ctx.shadowBlur = size * 0.38;
	ctx.strokeStyle = "rgba(0, 194, 255, 0.34)";
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.arc(0, 0, r * 0.92, 0, Math.PI * 2);
	ctx.stroke();

	ctx.shadowBlur = size * 0.26;
	ctx.strokeStyle = "rgba(0, 194, 255, 0.18)";
	ctx.beginPath();
	ctx.arc(0, 0, r * 0.68, 0, Math.PI * 2);
	ctx.stroke();

	ctx.shadowBlur = size * 0.3;
	ctx.fillStyle = theme.cyan;
	ctx.beginPath();
	ctx.arc(0, 0, coreR, 0, Math.PI * 2);
	ctx.fill();

	ctx.shadowBlur = 0;
	ctx.strokeStyle = theme.cyan;
	ctx.lineWidth = 1;
	ctx.beginPath();
	if (direction === "previous") {
		ctx.moveTo(-r * 1.06, 0);
		ctx.lineTo(-r * 1.36, 0);
	} else {
		ctx.moveTo(r * 1.06, 0);
		ctx.lineTo(r * 1.36, 0);
	}
	ctx.stroke();

	ctx.restore();
}

export function resolveCaseProjectCanvasNavigationData(project, locale) {
	const projects = getAllPortfolioProjects();
	const index = projects.findIndex((item) => item.config.id === project?.config?.id);
	if (index < 0 || projects.length < 2) {
		return null;
	}

	const previousProject = projects[(index - 1 + projects.length) % projects.length];
	const nextProject = projects[(index + 1) % projects.length];

	return {
		copy: COPY[locale] ?? COPY.ru,
		previousProject,
		nextProject,
		previousName:
			getPortfolioProjectName(previousProject.config.id, locale) || previousProject.config.title,
		nextName: getPortfolioProjectName(nextProject.config.id, locale) || nextProject.config.title,
	};
}

function getMeasureContext() {
	if (typeof document === "undefined") {
		return null;
	}
	if (!measureCanvas) {
		measureCanvas = document.createElement("canvas");
	}
	return measureCanvas.getContext("2d");
}

function resolveDefaultNavTextWidth(viewportW) {
	const compact = viewportW < 1180;
	return compact ? 125 : clamp(150, viewportW * 0.11, 210);
}

/**
 * Font sizes used by prev/next labels (same formulas as draw).
 * @param {number} textW
 */
export function resolveCaseProjectNavigationLabelSizes(textW) {
	const directionSize = clamp(10, textW * 0.078, 13);
	const projectSize = clamp(11, textW * 0.076, 16);
	return {
		directionSize,
		projectSize,
		directionSpacing: Math.round(directionSize * 0.08 * 10) / 10,
		projectSpacing: projectSize * 0.1,
	};
}

/**
 * Text column width for current locale only (prev/next labels + project names).
 * @param {import('@/portfolio/core/types.js').PortfolioProjectModule | null | undefined} project
 * @param {number} viewportW
 * @param {number} [viewportH]
 * @param {unknown} [locale]
 * @returns {number}
 */
export function measureCaseProjectNavigationContentTextWidth(
	project,
	viewportW,
	viewportH = 1080,
	locale = null,
) {
	const fallback = resolveDefaultNavTextWidth(viewportW);
	if (!project) {
		return fallback;
	}

	const resolvedLocale = normalizeSiteLocale(locale);
	const cacheKey = `${project.config.id}|${resolvedLocale}|${Math.round(viewportW)}|${Math.round(viewportH)}`;
	if (contentTextWCache?.key === cacheKey) {
		return contentTextWCache.textW;
	}

	const ctx = getMeasureContext();
	if (!ctx) {
		return fallback;
	}

	const data = resolveCaseProjectCanvasNavigationData(project, resolvedLocale);
	if (!data) {
		return fallback;
	}

	let textW = fallback;
	for (let pass = 0; pass < 2; pass += 1) {
		const { directionSize, projectSize, directionSpacing, projectSpacing } =
			resolveCaseProjectNavigationLabelSizes(textW);

		ctx.font = `500 ${directionSize}px ${CASE_STUDY_DISPLAY_FONT}`;
		const prevDirW = measureTextWithSpacing(ctx, data.copy.previous, directionSpacing);
		const nextDirW = measureTextWithSpacing(ctx, data.copy.next, directionSpacing);

		ctx.font = `500 ${projectSize}px ${CASE_STUDY_DISPLAY_FONT}`;
		const prevNameW = measureTextWithSpacing(
			ctx,
			String(data.previousName ?? "").toUpperCase(),
			projectSpacing,
		);
		const nextNameW = measureTextWithSpacing(
			ctx,
			String(data.nextName ?? "").toUpperCase(),
			projectSpacing,
		);

		const maxCol = Math.max(prevDirW, nextDirW, prevNameW, nextNameW);
		textW = clamp(72, Math.ceil(maxCol + 2), Math.min(320, Math.round(viewportW * 0.22)));
	}

	contentTextWCache = { key: cacheKey, textW };
	return textW;
}

/**
 * Pixel bounds for the four prev/next text rows (locale + measured glyph width).
 * Direction labels and project names are separate so shade can follow each line.
 *
 * @param {import('@/portfolio/core/types.js').PortfolioProjectModule | null | undefined} project
 * @param {number} viewportW
 * @param {number} viewportH
 * @param {{ x?: number, padding?: number } | null} [leftPanel]
 * @param {unknown} [locale]
 * @returns {{
 *   previousDirection: { left: number, right: number, top: number, bottom: number },
 *   nextDirection: { left: number, right: number, top: number, bottom: number },
 *   previousName: { left: number, right: number, top: number, bottom: number },
 *   nextName: { left: number, right: number, top: number, bottom: number },
 * } | null}
 */
export function measureCaseProjectNavigationSwitchLabelBounds(
	project,
	viewportW,
	viewportH,
	leftPanel = null,
	locale = null,
) {
	if (!project) {
		return null;
	}

	const resolvedLocale = normalizeSiteLocale(locale);
	const nav = resolveCaseProjectCanvasNavigationLayout(viewportW, viewportH, leftPanel);
	const data = resolveCaseProjectCanvasNavigationData(project, resolvedLocale);
	const ctx = getMeasureContext();
	if (!data || !ctx) {
		return null;
	}

	const { directionSize, projectSize, directionSpacing, projectSpacing } =
		resolveCaseProjectNavigationLabelSizes(nav.previous.textW);

	ctx.font = `600 ${directionSize}px ${CASE_STUDY_DISPLAY_FONT}`;
	const prevDirW = measureTextWithSpacing(ctx, data.copy.previous, directionSpacing);
	const nextDirW = measureTextWithSpacing(ctx, data.copy.next, directionSpacing);

	ctx.font = `600 ${projectSize}px ${CASE_STUDY_DISPLAY_FONT}`;
	const prevNameW = measureTextWithSpacing(
		ctx,
		String(data.previousName ?? "").toUpperCase(),
		projectSpacing,
	);
	const nextNameW = measureTextWithSpacing(
		ctx,
		String(data.nextName ?? "").toUpperCase(),
		projectSpacing,
	);

	const prev = nav.previous;
	const next = nav.next;
	const dirBaselineY = prev.centerY - 4;
	const nameTopY = prev.centerY + 5;

	const prevDirRight = prev.textX + prev.textW;
	const prevDirLeft = prevDirRight - prevDirW;
	const nextDirLeft = next.textX;
	const nextDirRight = nextDirLeft + nextDirW;

	const prevNameRight = prev.textX + prev.textW;
	const prevNameLeft = prevNameRight - prevNameW;
	const nextNameLeft = next.textX;
	const nextNameRight = nextNameLeft + nextNameW;

	return {
		previousDirection: {
			left: prevDirLeft,
			right: prevDirRight,
			top: dirBaselineY - directionSize,
			bottom: dirBaselineY,
		},
		nextDirection: {
			left: nextDirLeft,
			right: nextDirRight,
			top: dirBaselineY - directionSize,
			bottom: dirBaselineY,
		},
		previousName: {
			left: prevNameLeft,
			right: prevNameRight,
			top: nameTopY,
			bottom: nameTopY + projectSize,
		},
		nextName: {
			left: nextNameLeft,
			right: nextNameRight,
			top: nameTopY,
			bottom: nameTopY + projectSize,
		},
	};
}

/**
 * Pixel bounds of visible prev/next content for current locale.
 * Layout/node positions stay fixed; only the measured text extents change.
 * @param {import('@/portfolio/core/types.js').PortfolioProjectModule | null | undefined} project
 * @param {number} viewportW
 * @param {number} viewportH
 * @param {{ x?: number, padding?: number } | null} [leftPanel]
 * @param {unknown} [locale]
 * @returns {{ left: number, right: number, textW: number, y: number, h: number } | null}
 */
export function measureCaseProjectNavigationSwitchesContentBounds(
	project,
	viewportW,
	viewportH,
	leftPanel = null,
	locale = null,
) {
	const labels = measureCaseProjectNavigationSwitchLabelBounds(
		project,
		viewportW,
		viewportH,
		leftPanel,
		locale,
	);
	const nav = resolveCaseProjectCanvasNavigationLayout(viewportW, viewportH, leftPanel);
	if (!labels) {
		return {
			left: nav.previous.x,
			right: nav.next.x + nav.next.w,
			textW: nav.previous.textW,
			y: nav.previous.y,
			h: nav.previous.h,
		};
	}

	const left = Math.min(
		labels.previousDirection.left,
		labels.previousName.left,
		nav.previous.nodeX - nav.previous.nodeSize / 2,
	);
	const right = Math.max(
		labels.nextDirection.right,
		labels.nextName.right,
		nav.next.nodeX + nav.next.nodeSize / 2,
	);

	return {
		left,
		right,
		textW: nav.previous.textW,
		y: nav.previous.y,
		h: nav.previous.h,
	};
}

/**
 * Pixel bounds of «ALL PROJECTS» block for current locale (title + subtitle + marker line).
 * Hit/layout column stays fixed; shade should follow measured glyphs.
 * @param {import('@/portfolio/core/types.js').PortfolioProjectModule | null | undefined} project
 * @param {number} viewportW
 * @param {number} viewportH
 * @param {{ x?: number, padding?: number } | null} [leftPanel]
 * @param {unknown} [locale]
 * @returns {{ left: number, right: number, y: number, h: number } | null}
 */
export function measureCaseProjectNavigationAllProjectsContentBounds(
	project,
	viewportW,
	viewportH,
	leftPanel = null,
	locale = null,
) {
	const nav = resolveCaseProjectCanvasNavigationLayout(viewportW, viewportH, leftPanel);
	const all = nav.allProjects;
	const resolvedLocale = normalizeSiteLocale(locale);
	const copy = COPY[resolvedLocale] ?? COPY.ru;
	const ctx = getMeasureContext();
	if (!ctx) {
		return {
			left: all.x,
			right: all.x + all.w,
			y: all.y,
			h: all.h,
		};
	}

	const titleSize = clamp(10, all.w * 0.043, 14);
	const subtitleSize = clamp(9, all.w * 0.036, 12);
	const titleSpacing = titleSize * 0.12;

	ctx.font = `500 ${titleSize}px ${CASE_STUDY_DISPLAY_FONT}`;
	const titleW = measureTextWithSpacing(ctx, copy.all, titleSpacing);

	ctx.font = `300 ${subtitleSize}px Jura, "Segoe UI", sans-serif`;
	const subtitleW = ctx.measureText(copy.back).width;
	const markerStart = all.x + subtitleW + 16;
	const markerLen = clamp(58, all.w * 0.24, 85);
	const markerEnd = markerStart + markerLen;

	return {
		left: all.x,
		right: Math.max(all.x + titleW, markerEnd),
		y: all.y,
		h: all.h,
	};
}

/**
 * Fixed right-anchored prev/next geometry. Node positions depend only on viewport —
 * not on locale or project name length.
 * @param {number} viewportW
 * @param {number} viewportH
 * @param {{ x?: number, padding?: number } | null} [leftPanel]
 */
export function resolveCaseProjectCanvasNavigationLayout(viewportW, viewportH, leftPanel = null) {
	const compact = viewportW < 1180;
	const bottomInset = clamp(38, viewportH * 0.052, 64);
	const itemH = clamp(48, viewportW * 0.0365, 70);
	const visualBottom = viewportH - bottomInset + 8;
	const y = visualBottom - itemH;
	const centerY = y + itemH / 2;
	const allX = leftPanel ? leftPanel.x + (leftPanel.padding ?? 0) : clamp(146, viewportW * 0.115, 226);
	const allW = clamp(220, viewportW * 0.18, 350);
	const allH = itemH;
	const right = compact ? 28 : clamp(38, viewportW * 0.041, 80);
	const switchGap = compact ? 12 : clamp(17, viewportW * 0.0145, 28);
	const nodeSize = itemH;
	const textW = resolveDefaultNavTextWidth(viewportW);
	const buttonGap = clamp(12, viewportW * 0.01, 19);
	const buttonW = textW + buttonGap + nodeSize;
	const switchesW = buttonW * 2 + switchGap;
	const switchesX = viewportW - right - switchesW;

	return {
		allProjects: { x: allX, y, w: allW, h: allH, centerY },
		previous: {
			x: switchesX,
			y,
			w: buttonW,
			h: itemH,
			textX: switchesX,
			nodeX: switchesX + textW + buttonGap + nodeSize / 2,
			centerY,
			textW,
			nodeSize,
		},
		next: {
			x: switchesX + buttonW + switchGap,
			y,
			w: buttonW,
			h: itemH,
			nodeX: switchesX + buttonW + switchGap + nodeSize / 2,
			textX: switchesX + buttonW + switchGap + nodeSize + buttonGap,
			centerY,
			textW,
			nodeSize,
		},
	};
}

export function drawCaseProjectCanvasNavigation(ctx, layout, data, hitRegions, pathname) {
	if (!layout || !data) {
		return;
	}

	const theme = CASE_STUDY_CANVAS_THEME;
	const { copy, previousProject, nextProject, previousName, nextName } = data;
	const titleSize = clamp(10, layout.allProjects.w * 0.043, 14);
	const subtitleSize = clamp(9, layout.allProjects.w * 0.036, 12);
	// Direction labels are small UI type — keep them above ~10px and fully opaque for sharpness.
	const directionSize = clamp(10, layout.previous.textW * 0.078, 13);
	const projectSize = clamp(11, layout.previous.textW * 0.076, 16);
	const titleSpacing = titleSize * 0.12;
	const projectSpacing = projectSize * 0.1;

	const pushRectHit = (id, targetPath, rect) => {
		if (!targetPath || targetPath === pathname) {
			return;
		}
		hitRegions.push({
			type: "projectNavigation",
			id,
			targetPath,
			x: rect.x,
			y: rect.y,
			w: rect.w,
			h: rect.h,
			r: 0,
		});
	};

	ctx.save();
	ctx.textAlign = "left";
	ctx.textBaseline = "top";

	const all = layout.allProjects;
	pushRectHit("all", "/portfolio", all);
	ctx.font = `500 ${titleSize}px ${CASE_STUDY_DISPLAY_FONT}`;
	ctx.fillStyle = theme.text;
	drawSpacedText(ctx, copy.all, all.x, all.y + 5, titleSpacing);

	const subtitleY = all.y + all.h * 0.56;
	ctx.font = `300 ${subtitleSize}px Jura, "Segoe UI", sans-serif`;
	ctx.fillStyle = theme.textDim;
	ctx.fillText(copy.back, all.x, subtitleY);

	const subtitleW = ctx.measureText(copy.back).width;
	const markerX = all.x + subtitleW + 16;
	const markerY = subtitleY + subtitleSize * 0.58;
	const markerLen = clamp(58, all.w * 0.24, 85);
	drawCaseAllProjectsMarkerLine(ctx, markerX, markerY, markerLen);

	const drawProjectButton = (button, directionText, projectText, direction, targetPath) => {
		pushRectHit(direction, targetPath, button);
		drawNode(ctx, button.nodeX, button.centerY, button.nodeSize, direction);

		ctx.textBaseline = "bottom";
		ctx.font = `600 ${directionSize}px ${CASE_STUDY_DISPLAY_FONT}`;
		ctx.fillStyle = theme.textNavDirection;
		const directionSpacing = Math.round(directionSize * 0.08 * 10) / 10;
		let directionX = button.textX;
		let nameX = button.textX;
		if (direction === "previous") {
			const directionW = measureTextWithSpacing(ctx, directionText, directionSpacing);
			directionX = button.textX + button.textW - directionW;
		}
		drawSpacedText(ctx, directionText, directionX, button.centerY - 4, directionSpacing);

		ctx.textBaseline = "top";
		ctx.font = `500 ${projectSize}px ${CASE_STUDY_DISPLAY_FONT}`;
		ctx.fillStyle = theme.text;
		const name = String(projectText ?? "").toUpperCase();
		const nameLetterSpacingEm = 0.1;
		// Align to the text still on screen (old name while disappearing), not the target.
		const layoutName = getCaseProjectNavSnakeLayoutText(direction) || name;
		if (direction === "previous") {
			const nameW = measureTextWithSpacing(ctx, layoutName, projectSpacing);
			nameX = button.textX + button.textW - nameW;
		}
		drawCaseProjectNavSnakeLabel(ctx, direction, name, nameX, button.centerY + 5, {
			fontSize: projectSize,
			fontWeight: 600,
			letterSpacing: nameLetterSpacingEm,
			fontFamily: CASE_STUDY_DISPLAY_FONT,
			color: theme.text,
		});
	};

	drawProjectButton(layout.previous, copy.previous, previousName, "previous", previousProject.config.route);
	drawProjectButton(layout.next, copy.next, nextName, "next", nextProject.config.route);

	ctx.restore();
}

export function activateCaseProjectCanvasNavigation(hit, pathname) {
	if (hit?.type !== "projectNavigation" || !hit.targetPath || hit.targetPath === pathname) {
		return false;
	}
	// Hit buttons stopPropagation — cursor window click never fires.
	playUiClickSound();
	requestPortfolioCaseNavigation(hit.targetPath, pathname);
	return true;
}
