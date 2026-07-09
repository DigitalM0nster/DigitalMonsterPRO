import { getAllPortfolioProjects } from "@/portfolio/core/projectRegistry.js";
import { getPortfolioProjectName } from "@/i18n/portfolioProjectsCopy.js";
import { requestPortfolioCaseNavigation } from "@/utils/portfolioHubNavigate.js";
import { CASE_STUDY_CANVAS_THEME } from "./caseStudyCanvasTheme.js";
import { CASE_STUDY_DISPLAY_FONT, measureTextWithSpacing } from "./caseStudyCanvasText.js";

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

function clamp(min, value, max) {
	return Math.min(max, Math.max(min, value));
}

function drawSpacedText(ctx, text, x, y, letterSpacing = 0) {
	const value = String(text ?? "");
	if (!value || Math.abs(letterSpacing) < 0.001) {
		ctx.fillText(value, x, y);
		return ctx.measureText(value).width;
	}

	let cursorX = x;
	for (const char of value) {
		ctx.fillText(char, cursorX, y);
		cursorX += ctx.measureText(char).width + letterSpacing;
	}
	return Math.max(0, cursorX - x - letterSpacing);
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
	const textW = compact ? 125 : clamp(150, viewportW * 0.11, 210);
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
	const directionSize = clamp(8, layout.previous.textW * 0.065, 12);
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
	ctx.shadowColor = theme.cyanGlow;
	ctx.shadowBlur = 6;
	ctx.fillStyle = theme.cyan;
	ctx.beginPath();
	ctx.arc(markerX, markerY, 1.5, 0, Math.PI * 2);
	ctx.fill();
	ctx.strokeStyle = theme.cyan;
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(markerX + 4, markerY);
	ctx.lineTo(markerX + clamp(58, all.w * 0.24, 85), markerY);
	ctx.stroke();
	ctx.shadowBlur = 0;

	const drawProjectButton = (button, directionText, projectText, direction, targetPath) => {
		pushRectHit(direction, targetPath, button);
		drawNode(ctx, button.nodeX, button.centerY, button.nodeSize, direction);

		ctx.textBaseline = "bottom";
		ctx.font = `500 ${directionSize}px ${CASE_STUDY_DISPLAY_FONT}`;
		ctx.fillStyle = theme.textMuted;
		const directionSpacing = directionSize * 0.1;
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
		if (direction === "previous") {
			const nameW = measureTextWithSpacing(ctx, name, projectSpacing);
			nameX = button.textX + button.textW - nameW;
		}
		drawSpacedText(ctx, name, nameX, button.centerY + 5, projectSpacing);
	};

	drawProjectButton(layout.previous, copy.previous, previousName, "previous", previousProject.config.route);
	drawProjectButton(layout.next, copy.next, nextName, "next", nextProject.config.route);

	ctx.restore();
}

export function activateCaseProjectCanvasNavigation(hit, pathname) {
	if (hit?.type !== "projectNavigation" || !hit.targetPath || hit.targetPath === pathname) {
		return false;
	}
	requestPortfolioCaseNavigation(hit.targetPath, pathname);
	return true;
}
