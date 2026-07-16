import {
	cloneHeroScrollHintConfig,
	heroScrollHintConfig,
} from "../scenes/home/heroText/heroScrollHintConfig.js";
import { formatConfigNumber, injectSceneDevToolsStyles } from "./sceneDevPanelUtils.js";
import { formatDevPanelHotkeyHints, registerDevPanelHotkey, unregisterDevPanelHotkey } from "./devPanelHotkeys.js";
import { attachDevPanelDrag } from "./devPanelDrag.js";

const NUMERIC_FIELDS = [
	{ key: "labelGlowStrength", label: "labelGlowStrength", min: 0, max: 4, step: 0.05 },
	{ key: "labelGlowBlur", label: "labelGlowBlur", min: 0, max: 24, step: 0.5 },
	{ key: "bloomBoost", label: "bloomBoost", min: 1, max: 8, step: 0.05 },
	{ key: "trackAlpha", label: "trackAlpha", min: 0, max: 1, step: 0.01 },
];

const COLOR_FIELDS = [
	{ key: "mainColor", label: "mainColor (хвост/трек)" },
	{ key: "brightColor", label: "brightColor (мышь/tip)" },
	{ key: "labelColor", label: "labelColor (текст)" },
	{ key: "labelGlowColor", label: "labelGlowColor" },
];

function shouldOpenScrollHintDevFromUrl() {
	const params = new URLSearchParams(window.location.search);
	return params.has("scrollHintDev") || params.has("heroDev");
}

/**
 * Dev-панель цвета home scroll-hint.
 * Клавиша 6 или ?scrollHintDev=1
 */
export class HeroScrollHintDevTools {
	constructor() {
		this.enabled = false;
		this.panel = null;
		this.statusEl = null;
		this.numericInputs = new Map();
		this.colorInputs = new Map();
		this.baselineDefaults = cloneHeroScrollHintConfig();
		this.config = cloneHeroScrollHintConfig();
		this._hotkey = "6";
		this._detachPanelDrag = null;

		if (!import.meta.env.DEV) {
			return;
		}

		injectSceneDevToolsStyles();
		this._createPanel();
		registerDevPanelHotkey(this._hotkey, {
			label: "Scroll Hint",
			toggle: () => this.setEnabled(!this.enabled),
		});

		if (shouldOpenScrollHintDevFromUrl()) {
			this.setEnabled(true);
		}
	}

	_createPanel() {
		const panel = document.createElement("div");
		panel.className = "sceneDevTools scrollHintDevTools hidden";
		panel.innerHTML = `
			<p class="title" data-dev-panel-handle>Scroll hint colors (dev)</p>
			<p class="status" data-role="status">6 — открыть/закрыть · ?scrollHintDev=1</p>
			<p class="legend">labelColor / labelGlow* — только текст · bright — мышь · bloomBoost — HDR змейки.</p>
			<div class="section">
				<p class="sectionTitle">Цвета</p>
				${COLOR_FIELDS.map(
					(field) => `
				<div class="field fieldColor" data-field="${field.key}">
					<label>${field.label}</label>
					<input type="color" />
					<input type="text" data-role="hex" spellcheck="false" maxlength="7" />
				</div>
				`,
				).join("")}
				<p class="sectionTitle">Свечение текста / bloom</p>
				${NUMERIC_FIELDS.map(
					(field) => `
				<div class="field" data-field="${field.key}">
					<label>${field.label}</label>
					<input type="range" min="${field.min}" max="${field.max}" step="${field.step}" />
					<input type="number" min="${field.min}" max="${field.max}" step="${field.step}" />
				</div>
				`,
				).join("")}
			</div>
			<div class="section">
				<div class="actions">
					<button type="button" data-action="copyConfig">Скопировать</button>
					<button type="button" data-action="resetConfig">Сброс</button>
				</div>
			</div>
		`;

		panel.querySelector('[data-action="copyConfig"]').addEventListener("click", () => this._copyConfig());
		panel.querySelector('[data-action="resetConfig"]').addEventListener("click", () => this._resetConfig());

		for (const field of COLOR_FIELDS) {
			this._bindColorField(panel, field);
		}
		for (const field of NUMERIC_FIELDS) {
			this._bindNumericField(panel, field);
		}

		this.statusEl = panel.querySelector('[data-role="status"]');
		document.body.appendChild(panel);
		this.panel = panel;
		this._detachPanelDrag = attachDevPanelDrag(panel, { id: "scrollHint" });
		this._syncInputsFromConfig();
		this._apply();
	}

	_bindColorField(panel, field) {
		const row = panel.querySelector(`[data-field="${field.key}"]`);
		const color = row.querySelector('input[type="color"]');
		const hex = row.querySelector('input[data-role="hex"]');

		const applyHex = (raw) => {
			let next = String(raw ?? "").trim();
			if (!next.startsWith("#")) {
				next = `#${next}`;
			}
			if (!/^#[0-9a-fA-F]{6}$/.test(next)) {
				return;
			}
			this.config[field.key] = next.toLowerCase();
			color.value = this.config[field.key];
			hex.value = this.config[field.key];
			this._apply();
		};

		color.addEventListener("input", () => applyHex(color.value));
		hex.addEventListener("change", () => applyHex(hex.value));
		this.colorInputs.set(field.key, { color, hex });
	}

	_bindNumericField(panel, field) {
		const row = panel.querySelector(`[data-field="${field.key}"]`);
		const range = row.querySelector('input[type="range"]');
		const number = row.querySelector('input[type="number"]');

		const applyValue = (raw) => {
			const next = Math.max(field.min, Math.min(field.max, Number(raw)));
			if (!Number.isFinite(next)) {
				return;
			}
			const stored = formatConfigNumber(next);
			this.config[field.key] = stored;
			range.value = String(stored);
			number.value = String(stored);
			this._apply();
		};

		range.addEventListener("input", () => applyValue(range.value));
		number.addEventListener("change", () => applyValue(number.value));
		this.numericInputs.set(field.key, { range, number, field });
	}

	_syncInputsFromConfig() {
		if (!this.panel) {
			return;
		}

		for (const [key, { color, hex }] of this.colorInputs) {
			const value = this.config[key];
			color.value = value;
			hex.value = value;
		}

		for (const [key, { range, number }] of this.numericInputs) {
			const value = this.config[key];
			range.value = String(value);
			number.value = String(value);
		}
	}

	_apply() {
		Object.assign(heroScrollHintConfig, cloneHeroScrollHintConfig(this.config));
	}

	_copyConfig() {
		const payload = `export const heroScrollHintConfig = ${JSON.stringify(this.config, null, "\t").replace(/"([^"]+)":/g, "$1:")};\n`;
		navigator.clipboard?.writeText(payload).then(
			() => this._setStatus("Скопировано → heroScrollHintConfig.js"),
			() => this._setStatus("Не удалось скопировать"),
		);
	}

	_resetConfig() {
		this.config = cloneHeroScrollHintConfig(this.baselineDefaults);
		this._syncInputsFromConfig();
		this._apply();
		this._setStatus("Сброс к heroScrollHintConfig.js");
	}

	_setStatus(message) {
		if (this.statusEl) {
			this.statusEl.textContent = message;
		}
	}

	setEnabled(next) {
		if (!import.meta.env.DEV || this.enabled === next) {
			return;
		}

		this.enabled = next;

		if (next) {
			this.panel?.classList.remove("hidden");
			this._syncInputsFromConfig();
			this._setStatus(`6 — закрыть · ${formatDevPanelHotkeyHints()}`);
		} else {
			this.panel?.classList.add("hidden");
		}
	}

	dispose() {
		unregisterDevPanelHotkey(this._hotkey);
		this._detachPanelDrag?.();
		this._detachPanelDrag = null;
		this.setEnabled(false);
		this.panel?.remove();
		this.panel = null;
	}
}
