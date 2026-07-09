import { hexGridOverlayDefaults } from "../render/overlay/hexGridOverlayConfig.js";
import { getSceneCarousel } from "../render/transition/carouselPage.js";
import { formatConfigNumber, injectSceneDevToolsStyles } from "./sceneDevPanelUtils.js";
import { formatDevPanelHotkeyHints, registerDevPanelHotkey, unregisterDevPanelHotkey } from "./devPanelHotkeys.js";
import { attachDevPanelDrag } from "./devPanelDrag.js";

const FIELD_SECTIONS = [
	{
		title: "Основное",
		fields: [
			{ key: "progress", label: "progress (dev override)", min: -0.5, max: 1.5, step: 0.01 },
		],
	},
	{
		title: "Ряды",
		fields: [
			{ key: "rowSoftness", label: "rowSoftness", min: 0.002, max: 0.2, step: 0.002 },
			{ key: "cellRevealSpan", label: "cellRevealSpan (длина ячейки)", min: 0.5, max: 8, step: 0.1 },
			{ key: "rowRandomStrength", label: "rowRandom", min: 0, max: 0.25, step: 0.005 },
		],
	},
	{
		title: "Inner hex reveal",
		fields: [
			{ key: "innerMaxRadius", label: "innerMaxRadius", min: 0.02, max: 1, step: 0.005 },
			{ key: "innerMinRadius", label: "innerMinRadius", min: 0, max: 0.2, step: 0.005 },
			{ key: "innerSoftness", label: "innerSoftness", min: 0.001, max: 0.08, step: 0.001 },
			{ key: "innerRevealPower", label: "innerRevealPower", min: 0.3, max: 4, step: 0.1 },
			{ key: "innerTextureScale", label: "innerTex shrink (UV×)", min: 1, max: 3, step: 0.05 },
			{ key: "innerDistortStrength", label: "innerTex distort", min: 0, max: 1, step: 0.01 },
		],
	},
	{
		title: "Outer hex (лупа)",
		fields: [
			{ key: "outerTextureScale", label: "outerTex loupe (UV×)", min: 0.1, max: 1, step: 0.01 },
			{ key: "outerDistortStrength", label: "outerTex distort", min: 0, max: 1, step: 0.01 },
		],
	},
	{
		title: "Hex border",
		fields: [
			{ key: "lineRandomStrength", label: "lineRandom (фронт)", min: 0, max: 1, step: 0.01 },
			{ key: "lineWidth", label: "lineWidth", min: 0.002, max: 0.08, step: 0.001 },
			{ key: "lineInset", label: "lineInset", min: 0, max: 0.2, step: 0.001 },
			{ key: "lineOpacity", label: "lineOpacity", min: 0, max: 1, step: 0.01 },
			{ key: "lineGlowBoost", label: "lineGlow (bloom)", min: 0.5, max: 5, step: 0.1 },
		],
	},
	{
		title: "Сетка",
		fields: [
			{ key: "hexScale", label: "hexScale (плотность)", min: 1, max: 18, step: 0.1 },
			{ key: "fisheyeStrength", label: "fisheyeStrength", min: 0, max: 0.4, step: 0.005 },
		],
	},
];

const NUMERIC_FIELDS = FIELD_SECTIONS.flatMap((section) => section.fields);

export function shouldOpenHexGridDevFromUrl() {
	const params = new URLSearchParams(window.location.search);
	return params.has("hexDev") || params.has("gridDev");
}

function injectHexGridDevStyles() {
	if (document.querySelector("style[data-hex-grid-dev]")) {
		return;
	}

	const style = document.createElement("style");
	style.dataset.hexGridDev = "1";
	style.textContent = `
		.sceneDevTools.hexGridDevTools {
			left: 16px;
			right: auto;
			bottom: 16px;
			width: min(360px, calc(100vw - 32px));
		}
	`;
	document.head.appendChild(style);
}

/** Dev-панель hex grid overlay. Клавиша 0 или ?hexDev=1 */
export class HexGridOverlayDevTools {
	constructor(getOverlayPass) {
		this.getOverlayPass = getOverlayPass ?? (() => null);
		this.enabled = false;
		this.panel = null;
		this.statusEl = null;
		this.colorInput = null;
		this.numericInputs = new Map();
		this.baselineDefaults = structuredClone(hexGridOverlayDefaults);
		this.config = structuredClone(this.baselineDefaults);
		this._hotkey = "0";
		this._detachPanelDrag = null;

		if (!import.meta.env.DEV) {
			return;
		}

		injectSceneDevToolsStyles();
		injectHexGridDevStyles();
		this._createPanel();
		registerDevPanelHotkey(this._hotkey, {
			label: "Hex Grid",
			toggle: () => this.setEnabled(!this.enabled),
		});

		if (shouldOpenHexGridDevFromUrl()) {
			this.setEnabled(true);
		}
	}

	_createPanel() {
		const panel = document.createElement("div");
		panel.className = "sceneDevTools hexGridDevTools hidden";
		panel.innerHTML = `
			<p class="title">Hex grid (dev)</p>
			<p class="status" data-role="status">0 — открыть/закрыть · ?hexDev=1</p>
			<p class="legend">progress — dev override перехода (иначе от scroll карусели).</p>
			<div class="section">
				${FIELD_SECTIONS.map(
					(section) => `
					<p class="sectionTitle">${section.title}</p>
					${section.fields
						.map(
							(field) => `
					<div class="field" data-field="${field.key}">
						<label>${field.label}</label>
						<input type="range" min="${field.min}" max="${field.max}" step="${field.step}" />
						<input type="number" min="${field.min}" max="${field.max}" step="${field.step}" />
					</div>
				`,
						)
						.join("")}
				`,
				).join("")}
				<div class="field fieldColor" data-field="lineColor">
					<label>lineColor (border)</label>
					<input type="color" />
				</div>
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

		for (const field of NUMERIC_FIELDS) {
			this._bindNumericField(panel, field);
		}

		this.colorInput = panel.querySelector('[data-field="lineColor"] input[type="color"]');
		this.colorInput.addEventListener("input", () => {
			const hex = this.colorInput.value;
			const r = parseInt(hex.slice(1, 3), 16) / 255;
			const g = parseInt(hex.slice(3, 5), 16) / 255;
			const b = parseInt(hex.slice(5, 7), 16) / 255;
			this.config.lineColor = [r, g, b];
			this._apply();
		});

		this.statusEl = panel.querySelector('[data-role="status"]');
		document.body.appendChild(panel);
		this.panel = panel;
		this._detachPanelDrag = attachDevPanelDrag(panel, { id: "hexGrid" });
		this._syncInputsFromConfig();
		this._apply();
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
			const stored = field.step >= 1 ? Math.round(next) : formatConfigNumber(next);
			this.config[field.key] = stored;
			range.value = String(stored);
			number.value = String(stored);

			// progress — dev override карусели (иначе progress идёт от scroll)
			if (field.key === "progress") {
				hexGridOverlayDefaults._devOverrideProgress = true;
				hexGridOverlayDefaults.progress = stored;
				getSceneCarousel().setProgressState(stored, stored);
			}

			this._apply();
		};

		range.addEventListener("input", () => applyValue(range.value));
		number.addEventListener("change", () => applyValue(number.value));
		this.numericInputs.set(field.key, { range, number, field });
	}

	_rgbToHex([r, g, b]) {
		const toByte = (v) =>
			Math.round(Math.max(0, Math.min(1, v)) * 255)
				.toString(16)
				.padStart(2, "0");
		return `#${toByte(r)}${toByte(g)}${toByte(b)}`;
	}

	_syncInputsFromConfig() {
		if (!this.panel) {
			return;
		}

		for (const [key, { range, number }] of this.numericInputs) {
			const value = this.config[key];
			range.value = String(value);
			number.value = String(value);
		}

		if (this.colorInput) {
			this.colorInput.value = this._rgbToHex(this.config.lineColor);
		}
	}

	_apply() {
		Object.assign(hexGridOverlayDefaults, structuredClone(this.config));
		this.getOverlayPass()?.setOptions(this.config);
	}

	_copyConfig() {
		const payload = `export const hexGridOverlayDefaults = ${JSON.stringify(this.config, null, "\t").replace(/"([^"]+)":/g, "$1:")};\n`;
		navigator.clipboard?.writeText(payload).then(
			() => this._setStatus("Скопировано в буфер → hexGridOverlayConfig.js"),
			() => this._setStatus("Не удалось скопировать"),
		);
	}

	_resetConfig() {
		this.config = structuredClone(this.baselineDefaults);
		hexGridOverlayDefaults._devOverrideProgress = false;
		this._syncInputsFromConfig();
		this._apply();
		this._setStatus("Сброс к hexGridOverlayConfig.js");
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
			this._setStatus(`0 — закрыть · ${formatDevPanelHotkeyHints()}`);
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
