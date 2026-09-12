import { injectSceneDevToolsStyles } from "../../../dev/sceneDevPanelUtils.js";
import { attachDevPanelDrag } from "../../../dev/devPanelDrag.js";
import { registerDevPanelHotkey, unregisterDevPanelHotkey, shouldIgnoreDevPanelHotkey } from "../../../dev/devPanelHotkeys.js";
import { hologramFields, hologramDefaults, hologramStorageKey } from "./filmHologramConfig.js";

export class FilmHologramDevTools {
  constructor(settings, open = false, onChange = () => {}) {
    this.settings = settings;
    injectSceneDevToolsStyles();
    this.panel = document.createElement("div");
    this.panel.className = "sceneDevTools hidden";
    this.panel.dataset.sceneDevPanel = "hologram";
    const groups = [
      ["Голографический цвет", hologramFields.slice(4, 6), true],
      ["Помехи", hologramFields.slice(0, 4), false],
      ["Изображение и рамка", hologramFields.slice(6), false],
    ];
    this.panel.innerHTML = `
      <div class="devPanelDragHandle"><p class="title">Голограмма · портфолио</p></div>
      <p class="legend">H — открыть / скрыть. Оттенок экрана и свечение помех регулируются отдельно. Изменения видны сразу.</p>
      <section class="section">
        ${groups.map(([title, fields, open]) => `<details ${open ? "open" : ""}><summary class="sectionTitle">${title}</summary><section class="section">
        ${fields.map(([key, label, min, max, step]) => `<div class="field" data-hologram-field="${key}"><label for="hologram-${key}">${label}</label><input id="hologram-${key}" type="range" min="${min}" max="${max}" step="${step}"><input aria-label="${label}, значение" type="number" min="${min}" max="${max}" step="${step}"></div>`).join("")}
        </section></details>`).join("")}
      </section>
      <div class="actions"><button data-action="copy">Копировать настройки</button><button data-action="reset">Сбросить настройки</button><button data-action="close">Закрыть</button></div>
      <p class="legend" data-status>Автосохранение в этом браузере. Скопируй настройки, чтобы закрепить их в проекте.</p>
      <textarea aria-label="Настройки голограммы для копирования" readonly hidden></textarea>`;
    document.body.appendChild(this.panel);
    this.detachDrag = attachDevPanelDrag(this.panel, { id: "filmHologram" });
    this.panel.addEventListener("input", event => {
      const key = event.target.closest("[data-hologram-field]")?.dataset.hologramField;
      const field = hologramFields.find(([name]) => name === key);
      if (!field || !event.target.value.trim()) return;
      const value = Number(event.target.value);
      if (!Number.isFinite(value)) return;
      settings[key] = Math.max(field[2], Math.min(field[3], value));
      onChange(key, settings[key]);
      // Keep the in-progress numeric text (e.g. "0.") so decimal values can be typed.
      this.sync(event.target); this.save();
    });
    this.panel.addEventListener("change", () => this.sync());
    this.panel.addEventListener("click", event => {
      const action = event.target.closest("button")?.dataset.action;
      if (action === "close") this.setEnabled(false);
      if (action === "reset") {
        Object.assign(settings, hologramDefaults);
        for (const [key] of hologramFields) onChange(key, settings[key]);
        this.sync(); this.save();
      }
      if (action === "copy") void this.copy();
    });
    const toggle = () => this.setEnabled(!this.enabled);
    if (import.meta.env.DEV) registerDevPanelHotkey("h", { label: "Голограмма", toggle });
    else {
      // This class exists in production only with the explicit hologramDev flag.
      this.onKeyDown = event => {
        if (event.code !== "KeyH" || shouldIgnoreDevPanelHotkey(event)) return;
        event.preventDefault(); event.stopPropagation(); toggle();
      };
      window.addEventListener("keydown", this.onKeyDown, true);
    }
    this.sync(); this.setEnabled(open);
  }
  sync(editing = null) {
    for (const [key] of hologramFields) for (const input of this.panel.querySelectorAll(`[data-hologram-field="${key}"] input`)) {
      if (input !== editing) input.value = this.settings[key];
    }
  }
  save() {
    try { localStorage.setItem(hologramStorageKey, JSON.stringify(this.settings)); }
    catch { this.panel.querySelector("[data-status]").textContent = "Сохранение недоступно. Скопируй настройки вручную."; }
  }
  setEnabled(enabled) { this.enabled = enabled; this.panel.classList.toggle("hidden", !enabled); }
  async copy() {
    const text = JSON.stringify(this.settings, null, 2);
    const output = this.panel.querySelector("textarea"); output.hidden = false; output.value = text;
    try { await navigator.clipboard.writeText(text); }
    catch { if (this.panel) { output.focus(); output.select(); } }
  }
  dispose() { if (import.meta.env.DEV) unregisterDevPanelHotkey("h"); if (this.onKeyDown) window.removeEventListener("keydown", this.onKeyDown, true); this.detachDrag?.(); this.panel.remove(); this.panel = null; }
}
