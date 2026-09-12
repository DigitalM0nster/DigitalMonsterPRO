import { getGraphicsTier } from "@/functions/getGraphicsTier.js";
import { mediumHomeVisualConfig as config, mediumHomeVisualDefaults, applyMediumHomeVisualConfig } from "../scenes/home/mediumHomeVisualConfig.js";
import { injectSceneDevToolsStyles } from "./sceneDevPanelUtils.js";
import { attachDevPanelDrag } from "./devPanelDrag.js";
import { registerDevPanelHotkey, unregisterDevPanelHotkey } from "./devPanelHotkeys.js";

const STORAGE_KEY = "digitalMonster.mediumHomeVisual.v1";
const GROUPS = [
	{ label: "Строка услуг и «Листайте вниз»", open: true,
		help: "Сравни растр и MSDF на строке услуг RU/EN. Яркость общая; плотность и чёткость — для растра и «Листайте вниз». В MSDF толщину меняет отдельный ползунок. Китайский пока использует растр.", fields: [
			["stackTextRenderer", "Строка услуг", "select", [["msdf", "MSDF · контуры"], ["raster", "Растр · прежний"]]],
			["stackMsdfWeight", "Толщина MSDF", -0.3, 0.3, 0.01],
			["textBrightness", "Яркость текста", 0.3, 1, 0.01],
			["textDensity", "Плотность штрихов", 0.6, 1.8, 0.05],
			["textSharpness", "Чёткость букв", 0, 1, 0.05],
		] },
	{ label: "Digital Monster", open: true,
		help: "Сначала настрой контур и сглаживание, затем свечение. Сглаживание смягчает ступеньки контура. Движение = 0 отключает световую волну.", fields: [
			["titleFill", "Яркость букв", 0.3, 1, 0.01],
			["titleGlowColor", "Цвет свечения", "color"],
			["titleGlow", "Сила свечения", 0, 12, 0.1],
			["titleGlowWidth", "Ширина контура", 0.5, 2, 0.05],
			["titleEdgeSoftness", "Сглаживание края", 0.005, 0.15, 0.005],
			["titleMotion", "Движение света", 0, 0.35, 0.01],
			["titleMotionSpeed", "Скорость движения", 0, 2, 0.01],
		] },
	{ label: "Мышка", fields: [
		["mouseColor", "Цвет мышки", "color"],
		["mouseGlow", "Свечение мышки", 0, 2, 0.05],
		["mouseGlowWidth", "Радиус свечения", 0.5, 5, 0.1],
	] },
	{ label: "Кит", fields: [
		["whaleColor", "Цвет кита", "color"],
		["whaleEmission", "Свечение кита", 0, 40, 0.5],
		["whaleRadiance", "Предел яркости", 1, 12, 0.1],
	] },
];
const FIELDS = GROUPS.flatMap(group => group.fields);

function parseValue(field, raw) {
	if (field[2] === "select") return field[3].some(([value]) => value === raw) ? raw : null;
	if (field[2] === "color") return /^#[0-9a-f]{6}$/i.test(raw) ? raw : null;
	const number = Number(raw);
	return String(raw).trim() && Number.isFinite(number) ? Math.max(field[2], Math.min(field[3], number)) : null;
}

/** Local Medium-only tuning; no render loop, compilation or resource rebuild. */
export class MediumHomeDevTools {
	constructor({ getScene }) {
		if (!import.meta.env.DEV || getGraphicsTier() !== "medium") return;
		this.getScene = getScene;
		try {
			const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
			for (const field of FIELDS) {
				if (saved?.[field[0]] == null) continue;
				const value = parseValue(field, saved[field[0]]);
				if (value !== null) config[field[0]] = value;
			}
		} catch { /* Storage is optional in dev. */ }
		injectSceneDevToolsStyles();
		this.panel = document.createElement("div");
		this.panel.className = "sceneDevTools mediumHomeDevTools hidden";
		this.panel.innerHTML = `
			<div class="devPanelDragHandle"><p class="title">Главная · только MEDIUM</p></div>
			<p class="legend">M — открыть / скрыть. Изменения видны сразу.<br>High и Low используют свои настройки. DPR сцены: 1.</p>
			${GROUPS.map(group => `<details ${group.open ? "open" : ""}>
				<summary class="sectionTitle">${group.label}</summary><section class="section">
				${group.help ? `<p class="legend">${group.help}</p>` : ""}
				${group.fields.map(([key, label, min, max, step]) => `
				<div class="field" data-medium-field="${key}"><label for="medium-${key}">${label}</label>
				${min === "color" ? `<input id="medium-${key}" type="color"><input aria-label="${label} HEX" type="text">`
					: min === "select" ? `<select id="medium-${key}">${max.map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select>`
					: `<input id="medium-${key}" type="range" min="${min}" max="${max}" step="${step}"><input aria-label="${label}, значение" type="number" min="${min}" max="${max}" step="${step}">`}</div>`).join("")}</section></details>`).join("")}
			<div class="actions"><button data-action="save">Сохранить локально</button><button data-action="copy">Копировать настройки</button><button data-action="reset">Сбросить</button><button data-action="close">Закрыть</button></div>
			<p class="legend" data-status>Сохранение действует только в этом браузере и только в dev. Чтобы закрепить настройки в проекте, скопируй их и пришли в чат.</p>
			<textarea aria-label="Настройки Medium для копирования" readonly hidden></textarea>`;
		document.body.appendChild(this.panel);
		this.detachDrag = attachDevPanelDrag(this.panel, { id: "mediumHome" });
		this.panel.addEventListener("input", event => {
			const key = event.target.closest("[data-medium-field]")?.dataset.mediumField;
			const field = FIELDS.find(field => field[0] === key);
			if (!field) return;
			const value = parseValue(field, event.target.value);
			if (value === null) return;
			config[key] = value;
			this.sync(); this.apply();
		});
		this.panel.addEventListener("click", event => {
			const action = event.target.closest("button")?.dataset.action;
			if (action === "close") this.setEnabled(false);
			if (action === "save") {
				try { localStorage.setItem(STORAGE_KEY, JSON.stringify(config)); this.status("Сохранено для Medium в этом браузере."); }
				catch { this.status("Браузер запретил сохранение. Используй копирование настроек."); }
			}
			if (action === "reset") {
				Object.assign(config, mediumHomeVisualDefaults);
				try { localStorage.removeItem(STORAGE_KEY); } catch { /* Optional storage. */ }
				this.sync(); this.apply(); this.status("Возвращены настройки Medium из проекта.");
			}
			if (action === "copy") void this.copy();
		});
		registerDevPanelHotkey("m", { label: "Medium Home", toggle: () => this.setEnabled(!this.enabled) });
		this.sync();
		if (new URLSearchParams(location.search).get("mediumDev") === "1") this.setEnabled(true);
	}
	apply() { if (this.panel) applyMediumHomeVisualConfig(this.getScene()); }
	sync() {
		for (const [key] of FIELDS) for (const input of this.panel.querySelectorAll(`[data-medium-field="${key}"] input, [data-medium-field="${key}"] select`)) input.value = config[key];
	}
	status(text) { this.panel.querySelector("[data-status]").textContent = text; }
	setEnabled(value) {
		this.enabled = value; this.panel.classList.toggle("hidden", !value);
		if (value) this.apply();
	}
	async copy() {
		const text = JSON.stringify({ tier: "medium", ...config }, null, 2);
		const output = this.panel.querySelector("textarea"); output.hidden = false; output.value = text;
		try { await navigator.clipboard.writeText(text); if (this.panel) this.status("Настройки скопированы. Пришли их в чат, чтобы закрепить в проекте."); }
		catch { if (this.panel) { output.focus(); output.select(); this.status("Скопируй выделенные настройки вручную."); } }
	}
	dispose() {
		if (!this.panel) return;
		unregisterDevPanelHotkey("m"); this.detachDrag?.(); this.panel.remove(); this.panel = null;
	}
}
