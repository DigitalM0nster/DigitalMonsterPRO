import { getAllPortfolioProjects } from "@/portfolio/core/projectRegistry.js";
import { getPortfolioProjectName } from "@/i18n/portfolioProjectsCopy.js";
import { requestPortfolioCaseNavigation } from "@/utils/portfolioHubNavigate.js";
import { playUiClickSound } from "@/sounds/soundDesign.js";
import { CASE_STUDY_CANVAS_THEME } from "./caseStudyCanvasTheme.js";
import { CASE_STUDY_DISPLAY_FONT } from "./caseStudyCanvasText.js";
import { drawCaseAllProjectsMarkerLine } from "./caseAllProjectsLineSnake.js";
import { resolvePortfolioRouteNumber } from "./caseStudyArcProjects.js";
import { resolveSiteTopHudBrandLeftPx } from "./caseStudyCanvasLayout.js";

/** Same order as the right arc — route numbers 01→07, not raw registry insert order. */
function getPortfolioProjectsInNavOrder() {
	return getAllPortfolioProjects()
		.map((project, registryIndex) => ({ project, registryIndex }))
		.sort((a, b) => {
			const aNum = Number.parseInt(resolvePortfolioRouteNumber(a.project.config.route, a.registryIndex), 10);
			const bNum = Number.parseInt(resolvePortfolioRouteNumber(b.project.config.route, b.registryIndex), 10);
			return aNum - bNum;
		})
		.map(({ project }) => project);
}

const COPY = {
	ru: {
		all: "ВСЕ ПРОЕКТЫ",
	},
	en: {
		all: "ALL PROJECTS",
	},
	zh: {
		all: "全部项目",
	},
};

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

export function resolveCaseProjectCanvasNavigationData(project, locale) {
	const projects = getPortfolioProjectsInNavOrder();
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

/**
 * Compact «all projects» above the fixed case header (badge / footer).
 * Left edge matches SiteTopHud brand («DIGITAL MONSTER») — same column as stage-rail spine.
 * Prev/next chrome removed — project list lives on the right arc.
 * @param {number} viewportW
 * @param {number} viewportH
 * @param {{ x?: number, y?: number, padding?: number } | null} [leftPanel]
 */
export function resolveCaseProjectCanvasNavigationLayout(viewportW, viewportH, leftPanel = null) {
	const allH = 28;
	const gapAboveHeader = 14;
	const headerTop = leftPanel?.y != null && Number.isFinite(leftPanel.y)
		? leftPanel.y
		: clamp(160, viewportH * 0.16, 200);
	const y = Math.max(72, headerTop - allH - gapAboveHeader);
	const centerY = y + allH / 2;
	const allX = resolveSiteTopHudBrandLeftPx(viewportW);
	const allW = clamp(160, viewportW * 0.14, 240);

	return {
		allProjects: { x: allX, y, w: allW, h: allH, centerY },
	};
}

export function drawCaseProjectCanvasNavigation(ctx, layout, data, hitRegions, pathname) {
	if (!layout || !data) {
		return;
	}

	const theme = CASE_STUDY_CANVAS_THEME;
	const { copy } = data;
	const all = layout.allProjects;
	if (!all?.w || !all?.h) {
		return;
	}

	const titleSize = clamp(10, all.w * 0.055, 12);
	const titleSpacing = titleSize * 0.14;

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
	ctx.textBaseline = "middle";

	pushRectHit("all", "/portfolio", all);
	ctx.font = `500 ${titleSize}px ${CASE_STUDY_DISPLAY_FONT}`;
	ctx.fillStyle = theme.text;
	const titleY = all.centerY ?? (all.y + all.h / 2);
	const markerLen = clamp(40, all.w * 0.22, 64);
	const markerGap = 12;
	drawCaseAllProjectsMarkerLine(ctx, all.x, titleY, markerLen);
	drawSpacedText(ctx, copy.all, all.x + markerLen + markerGap, titleY, titleSpacing);

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
