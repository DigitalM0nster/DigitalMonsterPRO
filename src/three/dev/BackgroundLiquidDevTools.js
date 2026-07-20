import { formatConfigNumber, injectSceneDevToolsStyles } from "./sceneDevPanelUtils.js";
import { formatDevPanelHotkeyHints, registerDevPanelHotkey, unregisterDevPanelHotkey } from "./devPanelHotkeys.js";
import { attachDevPanelDrag } from "./devPanelDrag.js";
import {
	backgroundLiquidTune,
	resetBackgroundLiquidTune,
	shouldOpenLiquidDevFromUrl,
} from "../render/background/backgroundLiquidTune.js";

const HOTKEY = "8";
const COLOR_KEYS = new Set(["distortionColor", "colour1", "colour2", "colour3"]);

function formatTuneForCopy(tune) {
	const lines = Object.entries(tune).map(([key, value]) => {
		if (typeof value === "number") {
			return `\t${key}: ${formatConfigNumber(value)},`;
		}
		if (typeof value === "boolean") {
			return `\t${key}: ${value},`;
		}
		return `\t${key}: ${JSON.stringify(value)},`;
	});
	return `export const backgroundLiquidTuneDefaults = {\n${lines.join("\n")}\n};\n`;
}

/**
 * DEV panel — tune Balatro-style liquid background live.
 * Hotkey: 8 · URL: ?liquidDev=1
 */
export class BackgroundLiquidDevTools {
	/**
	 * @param {{ getPipeline: () => import("../render/background/BackgroundPipeline.js").BackgroundPipeline | null }} options
	 */
	constructor(options = {}) {
		if (!import.meta.env.DEV) {
			return;
		}

		this._getPipeline = options.getPipeline ?? (() => null);
		this.enabled = false;
		this._hotkey = HOTKEY;
		this._detachPanelDrag = null;
		this._statusEl = null;
		this._fields = new Map();

		injectSceneDevToolsStyles();
		this._panel = document.createElement("div");
		this._panel.className = "sceneDevTools liquidDevTools hidden";
		this._panel.innerHTML = `
			<div class="devPanelDragHandle">
				<p class="title">Liquid background</p>
			</div>
			<p class="legend">Balatro-style (no pixel filter) · hotkey <b>${HOTKEY}</b> · ?liquidDev=1</p>
			<p class="status" data-status></p>
			<section class="section">
				<p class="sectionTitle">Motion</p>
				<div class="field" data-field="spinRotation"><label>spinRotation</label><input type="range" min="-6" max="6" step="0.05" /><input type="number" step="0.05" /></div>
				<div class="field" data-field="spinSpeed"><label>spinSpeed</label><input type="range" min="0" max="20" step="0.1" /><input type="number" step="0.1" /></div>
				<div class="field" data-field="spinAmount"><label>spinAmount</label><input type="range" min="0" max="1" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-field="spinEase"><label>spinEase</label><input type="range" min="0.2" max="3" step="0.05" /><input type="number" step="0.05" /></div>
				<div class="field" data-field="paintZoom"><label>paintZoom</label><input type="range" min="8" max="60" step="0.5" /><input type="number" step="0.5" /></div>
				<div class="field" data-field="liquidScale"><label>liquidScale</label><input type="range" min="0.3" max="2" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-field="timeSpeed"><label>timeSpeed</label><input type="range" min="0" max="0.5" step="0.005" /><input type="number" step="0.005" /></div>
			</section>
			<section class="section">
				<p class="sectionTitle">Look</p>
				<div class="field" data-field="contrast"><label>contrast</label><input type="range" min="0.5" max="8" step="0.05" /><input type="number" step="0.05" /></div>
				<div class="field" data-field="lighting"><label>lighting</label><input type="range" min="0" max="1.5" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-field="brightness"><label>brightness</label><input type="range" min="0.02" max="0.8" step="0.01" /><input type="number" step="0.01" /></div>
			</section>
			<section class="section">
				<p class="sectionTitle">Colours</p>
				<div class="field" data-field="colour1"><label>colour1 (was red)</label><input type="color" /><input type="text" /></div>
				<div class="field" data-field="colour2"><label>colour2</label><input type="color" /><input type="text" /></div>
				<div class="field" data-field="colour3"><label>colour3</label><input type="color" /><input type="text" /></div>
				<div class="field" data-field="distortionColor"><label>distortionColor</label><input type="color" /><input type="text" /></div>
			</section>
			<section class="section">
				<div class="actions">
					<button type="button" data-action="copy">Copy JS</button>
					<button type="button" data-action="reset">Reset</button>
					<button type="button" data-action="close">Close</button>
				</div>
			</section>
			<footer class="legend" data-hints></footer>
		`;
		document.body.appendChild(this._panel);

		this._statusEl = this._panel.querySelector("[data-status]");
		this._hintsEl = this._panel.querySelector("[data-hints]");
		this._detachPanelDrag = attachDevPanelDrag(this._panel, { id: "liquidBackground" });

		this._bindFields();
		this._panel.querySelector('[data-action="copy"]')?.addEventListener("click", () => this._copyConfig());
		this._panel.querySelector('[data-action="reset"]')?.addEventListener("click", () => this._reset());
		this._panel.querySelector('[data-action="close"]')?.addEventListener("click", () => this.setEnabled(false));

		registerDevPanelHotkey(this._hotkey, {
			label: "Liquid BG",
			toggle: () => this.toggle(),
		});

		this._syncFieldsFromTune();
		this._setStatus(`Press ${HOTKEY} to toggle · ${formatDevPanelHotkeyHints()}`);
		if (this._hintsEl) {
			this._hintsEl.textContent = formatDevPanelHotkeyHints();
		}

		if (shouldOpenLiquidDevFromUrl()) {
			this.setEnabled(true);
		}
	}

	_bindFields() {
		for (const field of this._panel.querySelectorAll("[data-field]")) {
			const key = field.getAttribute("data-field");
			if (!key) {
				continue;
			}
			const range = field.querySelector('input[type="range"]');
			const number = field.querySelector('input[type="number"]');
			const color = field.querySelector('input[type="color"]');
			const text = field.querySelector('input[type="text"]');
			this._fields.set(key, { range, number, color, text });

			const onNumeric = (value) => {
				const next = Number(value);
				if (!Number.isFinite(next)) {
					return;
				}
				backgroundLiquidTune[key] = next;
				if (range) {
					range.value = String(next);
				}
				if (number) {
					number.value = String(next);
				}
				this._apply();
			};

			range?.addEventListener("input", () => onNumeric(range.value));
			number?.addEventListener("change", () => onNumeric(number.value));

			const onColor = (value) => {
				let hex = String(value || "").trim();
				if (!hex.startsWith("#")) {
					hex = `#${hex}`;
				}
				if (!/^#[0-9a-fA-F]{6}$/i.test(hex)) {
					return;
				}
				backgroundLiquidTune[key] = hex;
				if (color) {
					color.value = hex;
				}
				if (text) {
					text.value = hex;
				}
				this._apply();
			};

			color?.addEventListener("input", () => onColor(color.value));
			text?.addEventListener("change", () => onColor(text.value));
		}
	}

	_syncFieldsFromTune() {
		for (const [key, refs] of this._fields) {
			const value = backgroundLiquidTune[key];
			if (COLOR_KEYS.has(key)) {
				const hex = String(value ?? "#000000");
				if (refs.color) {
					refs.color.value = hex;
				}
				if (refs.text) {
					refs.text.value = hex;
				}
				continue;
			}
			if (typeof value !== "number") {
				continue;
			}
			if (refs.range) {
				refs.range.value = String(value);
			}
			if (refs.number) {
				refs.number.value = String(value);
			}
		}
	}

	_apply() {
		this._getPipeline()?.applyLiquidTuneFromDev?.();
		this._setStatus("live");
	}

	async _copyConfig() {
		const text = formatTuneForCopy(backgroundLiquidTune);
		try {
			await navigator.clipboard.writeText(text);
			this._setStatus("copied tune → clipboard");
		} catch {
			console.info("[liquidDev]\n" + text);
			this._setStatus("copy failed — see console");
		}
	}

	_reset() {
		resetBackgroundLiquidTune();
		this._syncFieldsFromTune();
		this._apply();
		this._setStatus("reset to defaults");
	}

	_setStatus(text) {
		if (this._statusEl) {
			this._statusEl.textContent = text;
		}
	}

	toggle() {
		this.setEnabled(!this.enabled);
	}

	setEnabled(next) {
		if (!import.meta.env.DEV || this.enabled === next) {
			return;
		}
		this.enabled = next;
		this._panel.classList.toggle("hidden", !next);
		if (next) {
			this._syncFieldsFromTune();
			this._apply();
			this._setStatus(`open · ${HOTKEY} closes · ${formatDevPanelHotkeyHints()}`);
			if (this._hintsEl) {
				this._hintsEl.textContent = formatDevPanelHotkeyHints();
			}
		}
	}

	dispose() {
		if (!import.meta.env.DEV) {
			return;
		}
		unregisterDevPanelHotkey(this._hotkey);
		this._detachPanelDrag?.();
		this._detachPanelDrag = null;
		this._panel?.remove();
		this._panel = null;
	}
}
