import { SceneCanvasInterface } from "@/three/objects/sceneHud/SceneCanvasInterface.js";
import { filmProjects, filmCopy } from "./data/filmProjects.js";
import { filmInfoCopy } from "./data/filmProjectInfo.js";
import { resolveFilmPresentation } from "./filmPresentationLayout.js";
import { store } from "@/app/store.jsx";

const clamp = value => Math.max(0, Math.min(1, value));
const variants = fn => Object.fromEntries(filmProjects.map((p, i) => [i, fn(p, i)]));
function wrap(value, limit = 24) {
	const rows = [""];
	for (const word of value.split(" ")) { if ((rows.at(-1) + word).length > limit && rows.at(-1)) rows.push(""); rows[rows.length - 1] += (rows.at(-1) ? " " : "") + word; }
	return rows.join("\n");
}

export function createFilmCanvasInterface(renderer, scene) {
	const ui = new SceneCanvasInterface("portfolioHub", renderer); ui.projectsOpen = false; ui.volumeOpen = false; ui.sheetScroll = 0;
	ui.text("heading", Object.fromEntries(Object.entries(filmCopy).map(([locale, copy]) => [locale, copy.eyebrow])), { size: 12, width: 260, height: 28, color: "#9cafba" });
	ui.text("count", variants((p, i) => `${String(i + 1).padStart(2, "0")} / ${String(filmProjects.length).padStart(2, "0")}`), { size: 13, width: 70, height: 28, align: "right" });
	ui.text("name", variants(p => wrap(p.name.toUpperCase(), 18)), { size: 21, width: 240, height: 58, align: "center" });
	const details = {};
	for (const locale of ["ru", "en", "zh"]) for (const [i, p] of filmProjects.entries()) details[`${locale}${i}`] = wrap(locale === "ru" ? p.detail : p[locale]);
	ui.text("detail", details, { size: 14, width: 280, height: 54, align: "center", color: "#aebfca" });
	const infoLabels = Object.fromEntries(Object.entries(filmInfoCopy).flatMap(([locale, copy]) =>
		[[locale, copy.about.toUpperCase()], [`${locale}Back`, copy.back.toUpperCase()]]));
	const backLabels = new Set(Object.values(filmInfoCopy).map(copy => copy.back.toUpperCase()));
	const info = ui.add("info", { values: infoLabels, width: 224, height: 44, action: () => scene.act("info"), paint(ctx, label, w) {
		ctx.font = '500 13px ManifoldExtended, "Microsoft YaHei", sans-serif';
		ctx.textBaseline = "middle"; ctx.fillStyle = "#ffffff";
		const textWidth = ctx.measureText(label).width, start = (w - textWidth - 40) / 2;
		ctx.fillText(label, start, 22);
		const x = start + textWidth + 26, direction = backLabels.has(label) ? -1 : 1;
		ctx.strokeStyle = "#00a9ff"; ctx.lineWidth = 1.1;
		ctx.beginPath(); ctx.arc(x, 22, 12, -.14, Math.PI * 1.55); ctx.stroke();
		ctx.save(); ctx.translate(x, 22); ctx.scale(direction, direction);
		ctx.strokeStyle = "#e4f6ff"; ctx.lineWidth = 1.2;
		ctx.beginPath(); ctx.moveTo(-3.5, 3.5); ctx.lineTo(3.5, -3.5);
		ctx.moveTo(-2, -3.5); ctx.lineTo(3.5, -3.5); ctx.lineTo(3.5, 2); ctx.stroke(); ctx.restore();
	} });
	info.button.dataset.filmInfoTrigger = "";
	ui.text("prev", { default: "‹" }, { size: 27, width: 44, height: 44, align: "center", action: () => scene.act("prev") });
	ui.text("next", { default: "›" }, { size: 27, width: 44, height: 44, align: "center", action: () => scene.act("next") });
	ui.text("projects", { ru: "ВСЕ ПРОЕКТЫ  ↗", en: "ALL PROJECTS  ↗", zh: "所有项目  ↗" }, { size: 13, width: 164, height: 44, align: "right",
		action: () => { scene.act("info-close"); ui.projectsOpen = true; ui.sheetScroll = 0; ui.volumeOpen = false; } });
	ui.text("play", { play: "▶", pause: "Ⅱ" }, { size: 20, width: 44, height: 44, align: "center", action: () => scene.act("play") });
	ui.add("volume", { width: 44, height: 44, values: { default: "" }, ariaLabel: "Громкость видео", action: () => { ui.volumeOpen = !ui.volumeOpen; }, paint(ctx) {
		ctx.strokeStyle = "#e2e9ed"; ctx.lineWidth = 1.5; ctx.lineJoin = "round";
		ctx.beginPath(); ctx.moveTo(12, 18); ctx.lineTo(17, 18); ctx.lineTo(23, 13); ctx.lineTo(23, 31); ctx.lineTo(17, 26); ctx.lineTo(12, 26); ctx.closePath(); ctx.stroke();
		for (const radius of [7, 11]) { ctx.beginPath(); ctx.arc(23, 22, radius, -.7, .7); ctx.stroke(); }
	} });
	ui.text("inspect", { default: "⛶" }, { size: 23, width: 44, height: 44, align: "center", action: () => scene.act("inspect") });
	ui.add("seekTrack"); ui.add("seekValue");
	ui.add("seek", { release(x) {
		if (!scene.media.seekable) return;
		const r = ui.elements.get("seek").material.uniforms.rect.value;
		scene.act({ type: "seek", progress: clamp((x - r.x) / r.z) });
	}, drag(x) {
		if (!scene.media.seekable) return;
		const r = ui.elements.get("seek").material.uniforms.rect.value, value = clamp((x - r.x) / r.z);
		if (performance.now() - (ui.lastSeek ?? 0) > 100) { scene.act({ type: "seek", progress: value }); ui.lastSeek = performance.now(); }
	} });
	ui.add("volumeBg"); ui.add("volumeTrack"); ui.add("volumeValue");
	ui.add("volumeRange", { drag(x) { const r = ui.elements.get("volumeRange").material.uniforms.rect.value; scene.act({ type: "volume", value: clamp((x - r.x) / r.z) }); } });
	ui.text("mute", { ru: "ЗВУК ВИДЕО", en: "VIDEO SOUND", zh: "视频声音" }, { size: 12, width: 160, height: 32, action: () => scene.act("mute") });
	ui.add("shade", { action: () => { ui.projectsOpen = false; } }); ui.add("sheet"); ui.add("sheetEdge");
	ui.text("sheetTitle", { ru: "ИЗБРАННЫЕ ПРОЕКТЫ", en: "SELECTED PROJECTS", zh: "精选项目" }, { size: 15, width: 250, height: 44 });
	ui.text("close", { default: "×" }, { size: 25, width: 44, height: 44, align: "center", action: () => { ui.projectsOpen = false; } });
	for (const [i, project] of filmProjects.entries()) {
		ui.text(`project${i}`, { default: `${String(i + 1).padStart(2, "0")}   ${project.name}` }, { size: 15, width: 290, height: 44,
			action: () => { scene.act(i); ui.projectsOpen = false; },
			drag(x, y, dy) { if (ui.projectsOpen) ui.sheetScroll = Math.max(0, Math.min(ui.sheetMax ?? 0, ui.sheetScroll - dy)); } });
		ui.add(`projectRule${i}`);
	}
	ui.scroll = delta => { if (!ui.projectsOpen) return false; ui.sheetScroll = Math.max(0, Math.min(ui.sheetMax ?? 0, ui.sheetScroll + delta)); return true; };
	ui.key = key => { if (key === "Escape" && (ui.projectsOpen || ui.volumeOpen)) { ui.projectsOpen = ui.volumeOpen = false; return true; } return false; };
	ui.layout = () => {
		const layout = resolveFilmPresentation(ui.width, ui.height); ui.enabled = !!layout;
		if (!layout) { ui.projectsOpen = ui.volumeOpen = false; return; }
		const locale = store.siteLocale || "ru", index = scene.motion.index, media = scene.media;
		const { heading, panel, directory } = layout, x = panel.left, y = panel.top, w = panel.width;
		ui.place("heading", heading.left, heading.top, 260, 28, { key: locale });
		ui.place("count", heading.left + heading.width - 70, heading.top, 70, 28, { key: index });
		const nameWidth = Math.min(240, w - 78);
		ui.place("name", x + (w - nameWidth) / 2, y - (layout.wide ? 14 : 4), nameWidth, 58, { key: index });
		ui.place("detail", x + (w - Math.min(280, w)) / 2, y + (layout.wide ? 14 : 40), Math.min(280, w), 54, { key: `${locale}${index}` });
		const infoWidth = Math.min(224, w), infoX = x + (w - infoWidth) / 2;
		const infoY = Math.min(ui.height - 58, y + (layout.wide ? 24 : 90));
		ui.place("info", infoX, infoY, infoWidth, 44, { key: `${locale}${scene.infoOpen ? "Back" : ""}` });
		info.button.setAttribute("aria-expanded", String(scene.infoOpen));
		info.button.setAttribute("aria-controls", "film-project-info");
		ui.place("prev", layout.wide ? x + w - 96 : x, y + 2, 44, 44); ui.place("next", x + w - 44, y + 2, 44, 44);
		const seekY = y + (layout.wide ? -1 : 141), controlsY = y + (layout.wide ? 4 : 153);
		ui.place("seekTrack", x, seekY, w, 1, { color: 0x204453 });
		ui.place("seekValue", x, seekY - 1, Math.max(1, w * (media.progress || 0)), 2, { color: 0x00a9ff });
		ui.place("seek", x, seekY - 12, w, 24, { opacity: .002, color: 0x000000 });
		ui.place("play", x, controlsY, 44, 44, { key: media.playing ? "pause" : "play", opacity: filmProjects[index].video ? 1 : .3 });
		ui.place("volume", x + 44, controlsY, 44, 44, { opacity: media.volumeLevel > 0 ? 1 : .5 });
		ui.place("inspect", x + 88, controlsY, 44, 44);
		if (!layout.wide) ui.place("projects", x + w - 164, controlsY, 164, 44, { key: locale });
		if (ui.volumeOpen) {
			ui.place("volumeBg", x + 8, controlsY - 80, 220, 80, { color: 0x040c13 });
			ui.place("mute", x + 20, controlsY - 76, 160, 32, { key: locale });
			ui.place("volumeTrack", x + 24, controlsY - 24, 184, 1, { color: 0x305365 });
			ui.place("volumeValue", x + 24, controlsY - 25, Math.max(1, 184 * media.volumeLevel), 3, { color: 0x00a9ff });
			ui.place("volumeRange", x + 24, controlsY - 44, 184, 44, { opacity: .002, color: 0x000000 });
		}
		if (!directory && !ui.projectsOpen) return;
		const box = ui.projectsOpen ? { left: (ui.width - Math.min(360, ui.width - 24)) / 2, top: 70, width: Math.min(360, ui.width - 24), height: ui.height - 140 } : directory;
		if (ui.projectsOpen) {
			ui.place("shade", 0, 0, ui.width, ui.height, { color: 0x000308, opacity: .9 });
			ui.place("sheet", box.left, box.top, box.width, box.height, { color: 0x040c13 });
			ui.place("close", box.left + box.width - 48, box.top + 2, 44, 44);
		}
		ui.place("sheetEdge", box.left, box.top, box.width, 1, { color: 0x00a9ff });
		ui.place("sheetTitle", box.left + 12, box.top + 4, 250, 44, { key: locale });
		const listTop = box.top + 50, listHeight = box.height - 58;
		const rowHeight = ui.projectsOpen ? 44 : Math.min(44, listHeight / filmProjects.length);
		ui.sheetMax = Math.max(0, filmProjects.length * rowHeight - listHeight);
		for (let i = 0; i < filmProjects.length; i++) {
			const py = listTop + i * rowHeight - (ui.projectsOpen ? ui.sheetScroll : 0);
			ui.place(`project${i}`, box.left + 12, py + (rowHeight - 44) / 2, 290, 44, { opacity: i === index ? 1 : .7,
				hitRect: { x: box.left + 12, y: py, z: box.width - 24, w: rowHeight } });
			const item = ui.elements.get(`project${i}`); item.material.uniforms.clip.value.set(box.left, listTop, box.left + box.width, listTop + listHeight);
			if (ui.projectsOpen && (py < listTop || py + rowHeight > listTop + listHeight)) item.mesh.visible = false;
			ui.place(`projectRule${i}`, box.left + 12, py + rowHeight - 2, box.width - 24, 1, { color: 0x163c50, opacity: item.mesh.visible ? 1 : 0 });
		}
	};
	return ui;
}
