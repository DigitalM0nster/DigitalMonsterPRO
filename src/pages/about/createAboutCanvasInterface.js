import { SceneCanvasInterface } from "@/three/objects/sceneHud/SceneCanvasInterface.js";
import { store } from "@/app/store.jsx";
import { getAboutPanelCopy, normalizeAboutPanelListItem } from "./aboutPanelCopy.js";
import { resolveAboutResponsiveLayout } from "./aboutResponsiveLayout.js";
import { yieldToPreparationFrame } from "@/three/app/preparationFrame.js";

function chapterRows(copy) {
	const canvas = document.createElement("canvas"), ctx = canvas.getContext("2d");
	const rows = []; let y = 4;
	const paragraph = (text, size, color) => {
		ctx.font = `400 ${size}px ${size >= 20 ? "ManifoldExtended" : "MazzardM"}, "Segoe UI", sans-serif`;
		let line = "";
		// Keep words intact; split only CJK and words longer than the whole column.
		for (const word of text.replace(/\n/g, " ").match(/\s+|[\u3400-\u9fff]|[^\s\u3400-\u9fff]+/gu) ?? []) {
			if (ctx.measureText(line + word).width > 256 && line.trim()) {
				rows.push({ text: line.trimEnd(), y, size, color }); y += size * 1.5; line = "";
			}
			for (const char of word) {
				if (!line && /\s/.test(char)) continue;
				if (ctx.measureText(line + char).width > 256 && line) { rows.push({ text: line, y, size, color }); y += size * 1.5; line = ""; }
				line += char;
			}
		}
		if (line) { rows.push({ text: line, y, size, color }); y += size * 1.5; }
		y += 12;
	};
	paragraph(copy.pathTitle, 13, "#00a9ff"); paragraph(copy.title, 21, "#eef5f8");
	for (const p of copy.descriptionParagraphs) paragraph(p, 16, "#d4dee5");
	for (const raw of copy.listItems) { const item = normalizeAboutPanelListItem(raw); paragraph(item.title, 16, "#00a9ff"); if (item.subtitle) paragraph(item.subtitle, 16, "#d4dee5"); }
	return { rows, height: Math.ceil(y) };
}

export async function createAboutCanvasInterface(renderer) {
	await document.fonts.load('500 16px ManifoldExtended');
	await document.fonts.load('400 16px MazzardM');
	const ui = new SceneCanvasInterface("about", renderer); ui.reading = false; ui.chapter = 0; ui.scrollY = 0;
	const close = () => { ui.reading = false; ui.scrollY = 0; };
	ui.text("read", { ru: "ЧИТАТЬ О СТУДИИ  ↗", en: "READ OUR STORY  ↗", zh: "了解工作室  ↗" },
		{ size: 14, width: 220, height: 44, action: () => {
			ui.chapter = Math.min(2, Math.floor((store.aboutExperience.storyProgress || 0) + 6 / 7)); ui.reading = true; ui.scrollY = 0;
		} });
	ui.text("cue", { ru: "ЛИСТАЙТЕ ВНИЗ  ↓", en: "SCROLL DOWN  ↓", zh: "向下滚动  ↓" }, { size: 12, width: 170, height: 28, align: "right" });
	ui.add("readRule"); ui.add("shade"); ui.add("panel"); ui.add("edge");
	ui.text("close", { ru: "ЗАКРЫТЬ  ×", en: "CLOSE  ×", zh: "关闭  ×" }, { size: 14, width: 132, height: 44, align: "right", action: close });
	for (let i = 0; i < 3; i++) ui.text(`tab${i}`, { default: `0${i + 1}` }, { size: 15, width: 44, height: 44, action: () => { ui.chapter = i; ui.scrollY = 0; } });
	for (const locale of ["ru", "en", "zh"]) for (let chapter = 0; chapter < 3; chapter++) {
		const { rows, height } = chapterRows(getAboutPanelCopy(`text${chapter + 1}`, locale));
		ui.add(`body-${locale}-${chapter}`, { width: 264, height, values: { default: "" }, paint(ctx) {
			ctx.textBaseline = "top";
			for (const row of rows) { ctx.font = `400 ${row.size}px ${row.size >= 20 ? "ManifoldExtended" : "MazzardM"}, "Segoe UI", sans-serif`; ctx.fillStyle = row.color; ctx.fillText(row.text, 4, row.y); }
		} });
		await yieldToPreparationFrame();
	}
	ui.add("scrollHit", { drag: (x, y, dy) => { ui.scrollY = Math.max(0, Math.min(ui.scrollMax ?? 0, ui.scrollY - dy)); } });
	ui.add("scrollTrack"); ui.add("scrollThumb");
	ui.scroll = delta => { if (!ui.reading) return false; ui.scrollY = Math.max(0, Math.min(ui.scrollMax ?? 0, ui.scrollY + delta)); return true; };
	ui.key = key => {
		if (!ui.reading) return false;
		if (key === "Escape") close();
		else if (["ArrowDown", "PageDown", " "].includes(key)) ui.scroll(key === "ArrowDown" ? 40 : 180);
		else if (["ArrowUp", "PageUp"].includes(key)) ui.scroll(key === "ArrowUp" ? -40 : -180);
		else return false;
		return true;
	};
	ui.layout = () => {
		const layout = resolveAboutResponsiveLayout(ui.width, ui.height); ui.enabled = !!layout;
		if (!layout) { close(); return; }
		const locale = store.siteLocale || "ru";
		ui.place("read", layout.x, layout.actionY, 220, 44, { key: locale });
		ui.place("readRule", layout.x, layout.actionY + 43, 176, 1, { color: 0x00a9ff });
		if (ui.width > 420) ui.place("cue", ui.width - 194, layout.actionY + 8, 170, 28, { key: locale });
		if (!ui.reading) return;
		const w = Math.min(340, ui.width - 24), x = (ui.width - w) / 2, top = ui.height < 480 ? 60 : 76, bottom = ui.height - layout.bottom - 8;
		const bodyY = top + 60, bodyHeight = Math.max(40, bottom - bodyY - 12);
		ui.place("shade", 0, 0, ui.width, ui.height, { color: 0x000308, opacity: .88 });
		ui.place("panel", x, top, w, bottom - top, { color: 0x030a10 });
		ui.place("edge", x, top, w, 1, { color: 0x00a9ff });
		ui.place("close", x + w - 146, top + 6, 132, 44, { key: locale });
		for (let i = 0; i < 3; i++) ui.place(`tab${i}`, x + 12 + i * 40, top + 6, 40, 44, { opacity: i === ui.chapter ? 1 : .45 });
		const bodyId = `body-${locale}-${ui.chapter}`, body = ui.elements.get(bodyId);
		ui.scrollMax = Math.max(0, body.height - bodyHeight); ui.scrollY = Math.min(ui.scrollY, ui.scrollMax);
		ui.place(bodyId, x + (w - 264) / 2, bodyY - ui.scrollY, 264, body.height);
		body.material.uniforms.clip.value.set(x, bodyY, x + w, bottom - 12);
		ui.place("scrollHit", x, bodyY, w, bodyHeight, { opacity: .002, color: 0x000000 });
		ui.place("scrollTrack", x + w - 6, bodyY, 1, bodyHeight, { color: 0x194557 });
		const thumb = Math.max(24, bodyHeight * bodyHeight / Math.max(bodyHeight, body.height));
		ui.place("scrollThumb", x + w - 7, bodyY + (bodyHeight - thumb) * (ui.scrollMax ? ui.scrollY / ui.scrollMax : 0), 2, thumb, { color: 0x00a9ff });
	};
	return ui;
}
