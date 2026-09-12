import { LOW_WHALE_BLOOM_STRENGTH, LOW_WHALE_BLOOM_RADIUS } from "../scenes/home/utils/LowWhaleBloom.js";
import { injectSceneDevToolsStyles } from "./sceneDevPanelUtils.js";
import { attachDevPanelDrag } from "./devPanelDrag.js";
import { registerDevPanelHotkey, unregisterDevPanelHotkey } from "./devPanelHotkeys.js";

const STORAGE_KEY = "digitalMonster.lowHomeVisual.v1";
function parseValue(raw, min = 0, max = 6) {
	const value = Number(raw);
	return raw != null && String(raw).trim() && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : null;
}

/** Dev-only Low tuning: update the existing uniform, never rebuild bloom. */
export class LowHomeDevTools {
	constructor({ getScene }) {
		this.getScene = getScene;
		this.strength = LOW_WHALE_BLOOM_STRENGTH;
		this.radius = LOW_WHALE_BLOOM_RADIUS;
		try {
			const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
			this.strength = parseValue(saved?.whaleBloom) ?? this.strength;
			this.radius = parseValue(saved?.whaleBloomRadius, 0.5, 2) ?? this.radius;
		} catch { /* Optional dev storage. */ }
		injectSceneDevToolsStyles();
		this.panel = document.createElement("div");
		this.panel.className = "sceneDevTools lowHomeDevTools hidden";
		this.panel.innerHTML = `
			<div class="devPanelDragHandle"><p class="title">Главная · только LOW</p></div>
			<p class="legend">M — открыть / скрыть. Свечение меняется сразу, High и Medium не затрагиваются.</p>
			<section class="section"><p class="sectionTitle">Свечение кита</p>
			<p class="legend">0 — без блума, ${LOW_WHALE_BLOOM_STRENGTH} — настройка проекта. Размер точек и туман сохраняются.</p>
			<div class="field" data-field="strength"><label for="low-whaleBloom">Сила свечения</label>
			<input id="low-whaleBloom" type="range" min="0" max="6" step="0.05">
			<input aria-label="Сила свечения, значение" type="number" min="0" max="6" step="0.05"></div>
			<div class="field" data-field="radius"><label for="low-whaleBloomRadius">Радиус ореола</label>
			<input id="low-whaleBloomRadius" type="range" min="0.5" max="2" step="0.05">
			<input aria-label="Радиус ореола, значение" type="number" min="0.5" max="2" step="0.05"></div>
			<p class="legend">Меньше радиус — собраннее свет вокруг каждой точки. Больше — мягче и шире ореол. По умолчанию: ${LOW_WHALE_BLOOM_RADIUS}.</p></section>
			<div class="actions"><button data-action="save">Сохранить локально</button><button data-action="copy">Копировать настройки</button><button data-action="reset">Сбросить</button><button data-action="close">Закрыть</button></div>
			<p class="legend" data-status>Сохранение действует в этом браузере и только в dev. Скопируй настройки в чат, чтобы закрепить их в проекте.</p>
			<textarea aria-label="Настройки Low для копирования" readonly hidden></textarea>`;
		document.body.appendChild(this.panel);
		this.detachDrag = attachDevPanelDrag(this.panel, { id: "lowHome" });
		this.panel.addEventListener("input", event => {
			if (!event.target.matches("input")) return;
			const field = event.target.closest("[data-field]")?.dataset.field;
			if (field !== "strength" && field !== "radius") return;
			const value = field === "radius" ? parseValue(event.target.value, 0.5, 2) : parseValue(event.target.value);
			if (value === null) return;
			this[field] = value;
			this.sync(); this.apply();
		});
		this.panel.addEventListener("click", event => {
			const action = event.target.closest("button")?.dataset.action;
			if (action === "close") this.setEnabled(false);
			if (action === "copy") void this.copy();
			if (action === "save") {
				try { localStorage.setItem(STORAGE_KEY, this.serialize()); this.status("Сохранено для Low в этом браузере."); }
				catch { this.status("Сохранение недоступно. Используй копирование настроек."); }
			}
			if (action === "reset") {
				this.strength = LOW_WHALE_BLOOM_STRENGTH;
				this.radius = LOW_WHALE_BLOOM_RADIUS;
				try { localStorage.removeItem(STORAGE_KEY); } catch { /* Optional storage. */ }
				this.sync(); this.apply(); this.status("Возвращена настройка Low из проекта.");
			}
		});
		registerDevPanelHotkey("m", { label: "Low Home", toggle: () => this.setEnabled(!this.enabled) });
		this.sync();
		if (new URLSearchParams(location.search).get("lowDev") === "1") this.setEnabled(true);
	}
	apply() {
		const bloom = this.getScene()?.lowWhaleBloom;
		if (!bloom) return;
		bloom.add.uniforms.uStrength.value = this.strength;
		bloom.radius = this.radius;
	}
	sync() {
		for (const field of ["strength", "radius"]) {
			for (const input of this.panel.querySelectorAll(`[data-field="${field}"] input`)) input.value = this[field];
		}
	}
	serialize() { return JSON.stringify({ tier: "low", whaleBloom: this.strength, whaleBloomRadius: this.radius }, null, 2); }
	status(text) { this.panel.querySelector("[data-status]").textContent = text; }
	setEnabled(value) { this.enabled = value; this.panel.classList.toggle("hidden", !value); }
	async copy() {
		const text = this.serialize(), output = this.panel.querySelector("textarea");
		output.hidden = false; output.value = text;
		try { await navigator.clipboard.writeText(text); if (this.panel) this.status("Настройки скопированы. Пришли их в чат."); }
		catch { if (this.panel) { output.focus(); output.select(); this.status("Скопируй выделенные настройки вручную."); } }
	}
	dispose() {
		unregisterDevPanelHotkey("m"); this.detachDrag?.(); this.panel.remove(); this.panel = null;
	}
}
