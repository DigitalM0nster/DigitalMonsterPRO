import { store } from "@/app/store.jsx";
import { prepareCaseStudyCanvasContext, resolveCaseStudyPanelHudPixelRatio } from "@/pages/portfolio/ui/CaseStudyCanvas/caseStudyCanvasSurface.js";
import { CASE_STUDY_BODY_FONT, CASE_STUDY_DISPLAY_FONT, wrapTextLines } from "@/pages/portfolio/ui/CaseStudyCanvas/caseStudyCanvasText.js";
import { resolveAboutResponsiveLayout } from "./aboutResponsiveLayout.js";
import { resolveOutputPixelRatio } from "@/three/renderer/renderResolution.js";

const SHORT_COPY = {
	ru: {
		text1: ["DIGITAL MONSTER", "Интерактивная digital-студия."],
		text2: ["ОТ ИДЕИ К ПРОДУКТУ", "Идея. Дизайн. Разработка."],
		text3: ["ИНТЕРАКТИВНЫЙ ВЕБ", "Сайты, приложения, презентации."],
	},
	en: {
		text1: ["DIGITAL MONSTER", "Interactive digital studio."],
		text2: ["FROM IDEA TO PRODUCT", "Concept, design and development."],
		text3: ["INTERACTIVE WEB", "Websites, apps and presentations."],
	},
	zh: {
		text1: ["DIGITAL MONSTER", "互动数字工作室。"],
		text2: ["从创意到产品", "概念、设计与开发。"],
		text3: ["互动网页", "网站、应用与数字演示。"],
	},
};

/** Paint once per viewport/locale. The full copy remains in the native reading sheet. */
export function paintAboutCompactHud({ canvas, viewportW, viewportH, frame }) {
	const layout = resolveAboutResponsiveLayout(viewportW, viewportH);
	const ratio = resolveOutputPixelRatio(store.graphicsTier, resolveCaseStudyPanelHudPixelRatio(store.graphicsTier),
		window.devicePixelRatio, viewportW, viewportH);
	const ctx = prepareCaseStudyCanvasContext(canvas, viewportW, viewportH, ratio);
	if (!ctx || !layout) return null;
	ctx.clearRect(0, 0, viewportW, viewportH);
	ctx.textBaseline = "top";
	const { x, textWidth, titleSize, bodySize } = layout;
	const brief = viewportH < 480 ? (SHORT_COPY[frame.locale] ?? SHORT_COPY.ru)[frame.activeStateId] : null;
	ctx.font = `400 ${titleSize}px ${CASE_STUDY_DISPLAY_FONT}`;
	const title = wrapTextLines(ctx, brief?.[0] ?? frame.title.replace(/\n/g, " "), textWidth);
	ctx.font = `500 ${bodySize}px ${CASE_STUDY_BODY_FONT}`;
	const description = wrapTextLines(ctx, brief?.[1] ?? frame.descriptionParagraphs[0], textWidth);
	const lineCount = Math.min(layout.portrait ? 3 : 4, description.length);
	const contentHeight = 24 + title.length * titleSize * 1.14 + 12 + lineCount * bodySize * 1.35;
	const top = layout.textCenterY == null ? layout.textTop : Math.max(layout.top, layout.textCenterY - contentHeight * 0.5);
	const gradient = ctx.createLinearGradient(x, 0, x + textWidth + 30, 0);
	gradient.addColorStop(0, "rgba(0,3,9,.7)"); gradient.addColorStop(1, "rgba(0,3,9,0)");
	ctx.fillStyle = gradient;
	ctx.fillRect(x - 10, top - 8, textWidth + 30, contentHeight + 16);
	ctx.fillStyle = "#00a9ff";
	ctx.font = `500 11px ${CASE_STUDY_DISPLAY_FONT}`;
	ctx.fillText(frame.sectionBadge, x, top);
	ctx.font = `400 ${titleSize}px ${CASE_STUDY_DISPLAY_FONT}`;
	let y = top + 24;
	ctx.fillStyle = "#f3f8ff";
	for (const line of title) { ctx.fillText(line, x, y); y += titleSize * 1.14; }
	y += 12;
	ctx.font = `500 ${bodySize}px ${CASE_STUDY_BODY_FONT}`;
	ctx.fillStyle = "#becbd9";
	const maxLines = Math.max(0, Math.min(layout.portrait ? 3 : 4, Math.floor((layout.actionY - y - 12) / (bodySize * 1.35))));
	description.slice(0, maxLines).forEach((line, i) => {
		const clipped = i === maxLines - 1 && description.length > maxLines;
		ctx.fillText(clipped ? `${line.replace(/[ .,;:—]+$/, "")}…` : line, x, y);
		y += bodySize * 1.35;
	});
	return { hitRegions: [], mosaicBounds: { x: x - 10, y: top - 8, width: textWidth + 30,
		// The action is a separate prepared element. Crop the story textures to
		// their painted text/shade, so native-DPR letters do not store empty 3D space.
		height: Math.max(1, contentHeight + 16, y - top + 16), viewportW, viewportH } };
}
