import { applyParticleAppearance, readParticleAppearance, saveParticleAppearance, particleLevelLabels } from "../../../src/three/scenes/home/mobileWhale/particleAppearance.js";

const controls = [
  ["brightness", "Яркость", 0, 4], ["size", "Размер", .25, 3],
  ["bloom", "Свечение", 0, 4], ["opacity", "Непрозрачность", 0, 1],
  ["density", "Количество", 0, 1, true], ["speed", "Скорость", 0, 3, true],
  ["travel", "Дальность", 0, 3, true], ["waviness", "Волнистость", 0, 3, true],
  ["direction", "Направление, °", -180, 180, true],
];

/** Authoring preview only. Inputs update the existing production uniforms. */
export function mountAppearanceControls(material, redraw) {
  let config = readParticleAppearance();
  const panel = document.createElement("details");
  panel.className = "particle-settings";
  const style = document.createElement("style");
  style.textContent = `.particle-settings{position:fixed;right:16px;top:16px;width:270px;max-height:calc(100dvh - 32px);overflow:auto;background:#06121df5;border:1px solid #19435b;border-radius:12px;color:#b9ddef;font:12px system-ui;z-index:10;box-sizing:border-box;padding:12px}
  .particle-settings summary{cursor:pointer;letter-spacing:.06em}.particle-settings .fields{display:flex;flex-direction:column;gap:12px;margin-top:16px}.particle-settings label{display:flex;flex-direction:column;gap:5px}.particle-settings label[hidden]{display:none}.particle-settings .caption{display:flex;justify-content:space-between}.particle-settings select{color:inherit;background:#0c2232;border:1px solid #225675;border-radius:5px;padding:7px}.particle-settings input{accent-color:#00b8ff;width:100%;box-sizing:border-box}.particle-settings input[type=color]{height:30px;background:none;border:0;padding:0}.particle-settings .actions{display:flex;gap:7px}.particle-settings button{font:inherit;padding:7px 9px}.particle-settings p{margin:0;line-height:1.45;opacity:.7}.particle-settings output{position:static;letter-spacing:normal}`;
  panel.innerHTML = `<summary>Настройки частиц</summary><div class="fields">
    <label>Что настроить<select aria-label="Группа частиц">
      <option value="global">Все 4 уровня</option><option value="wake">Отлетающие частицы</option>
      <optgroup label="Точная настройка отдельных уровней">${Object.entries(particleLevelLabels).sort(([a], [b]) => Number(a) - Number(b)).map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</optgroup>
    </select></label><p data-description></p>
    <label>Цвет<input type="color" aria-label="Цвет частиц" data-key="color"></label>
    ${controls.map(([key, label, min, max, wakeOnly]) => `<label ${wakeOnly ? 'data-wake-only' : ''}><span class="caption">${label}<output data-value="${key}"></output></span><input type="range" aria-label="${label} частиц" data-key="${key}" min="${min}" max="${max}" step="${key === 'direction' ? '1' : '.05'}"></label>`).join("")}
    <div class="actions"><button type="button" data-action="reset">Сбросить всё</button><button type="button" data-action="export">Скачать JSON</button></div>
    <p>Сохраняется в этом браузере. На главной применится после обновления. Для движения включите «Анимация».</p></div>`;
  const group = panel.querySelector("select");
  const selected = () => config[group.value] ?? config.levels[group.value];
  function sync() {
    const values = selected();
    for (const label of panel.querySelectorAll("[data-wake-only]")) label.hidden = group.value !== "wake";
    for (const input of panel.querySelectorAll("input[data-key]")) {
      if (!(input.dataset.key in values)) continue;
      input.value = values[input.dataset.key];
      const output = panel.querySelector(`[data-value="${input.dataset.key}"]`);
      if (output) output.value = input.dataset.key === "density"
        ? Math.round(Number(input.value) * 100) + "%" : Number(input.value).toFixed(2);
    }
    panel.querySelector("[data-description]").textContent = group.value === "global"
      ? "Общие множители: 1 — исходный вид. Первый уровень заполняет всё тело; остальные выделяют детали и контуры."
      : group.value === "wake" ? "Общий поток: 0° — вправо, 90° — вверх. По референсу — 15°. Остальные настройки независимы от тела."
        : "Дополнительная настройка одного уровня. На него также действуют общие множители.";
  }
  group.onchange = sync;
  panel.oninput = event => {
    const input = event.target, key = input.dataset.key;
    if (!key) return;
    selected()[key] = key === "color" ? input.value : Number(input.value);
    applyParticleAppearance(material, config);
    saveParticleAppearance(config);
    sync(); redraw();
  };
  panel.querySelector('[data-action="reset"]').onclick = () => {
    saveParticleAppearance(null); config = readParticleAppearance();
    applyParticleAppearance(material, config); sync(); redraw();
  };
  panel.querySelector('[data-action="export"]').onclick = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(config, null, 2) + "\n"], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url; link.download = "whale-particle-appearance.json"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  document.head.append(style); document.body.append(panel); sync();
  return () => { panel.remove(); style.remove(); };
}
