import { formatConfigNumber, injectSceneDevToolsStyles } from "./sceneDevPanelUtils.js";
import { formatDevPanelHotkeyHints, registerDevPanelHotkey, unregisterDevPanelHotkey } from "./devPanelHotkeys.js";
import { attachDevPanelDrag } from "./devPanelDrag.js";
import {
	ABOUT_EPIC_TEXT_MODES,
	aboutEpicTextTune,
	resetAboutEpicTextTune,
} from "../scenes/about/aboutEpicText/aboutEpicTextConfig.js";

const HOTKEY = "2";
const COLOR_KEYS = new Set(["tint", "core", "outline"]);

function shouldOpenFromUrl() {
	try {
		return new URLSearchParams(window.location.search).has("epicTextDev");
	} catch {
		return false;
	}
}

function formatTuneForCopy(tune) {
	const lines = Object.entries(tune).map(([key, value]) => {
		if (typeof value === "number") {
			return `\t${key}: ${formatConfigNumber(value)},`;
		}
		return `\t${key}: ${JSON.stringify(value)},`;
	});
	return `export const aboutEpicTextTuneDefaults = {\n${lines.join("\n")}\n};\n`;
}

/**
 * DEV panel — switch About epic title shader modes (0…5) + live knobs.
 * Hotkey: 2 · URL: ?epicTextDev=1
 */
export class AboutEpicTextDevTools {
	constructor() {
		if (!import.meta.env.DEV) {
			return;
		}

		this.enabled = false;
		this._hotkey = HOTKEY;
		this._detachPanelDrag = null;
		this._statusEl = null;
		this._modeButtons = [];
		this._fields = new Map();

		injectSceneDevToolsStyles();
		this._panel = document.createElement("div");
		this._panel.className = "sceneDevTools aboutEpicTextDevTools hidden";
		this._panel.innerHTML = `
			<div class="devPanelDragHandle">
				<p class="title">About Epic Text</p>
			</div>
			<p class="legend">6 shader modes · hotkey <b>${HOTKEY}</b> · ?epicTextDev=1</p>
			<p class="status" data-status></p>
			<section class="section">
				<p class="sectionTitle">Mode</p>
				<div class="actions" data-modes style="flex-wrap:wrap;gap:6px;"></div>
			</section>
			<section class="section">
				<p class="sectionTitle">Appear (story 0…4)</p>
				<div class="field" data-field="appearStoryStart"><label>appearStart</label><input type="range" min="2" max="4" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-field="appearStoryEnd"><label>appearEnd</label><input type="range" min="2" max="4" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-field="localeSwapMs"><label>localeSwapMs</label><input type="range" min="400" max="2000" step="10" /><input type="number" step="10" /></div>
			</section>
			<section class="section">
				<p class="sectionTitle">Contour (stroke around letters)</p>
				<div class="field" data-field="outlineWidth"><label>strokeWidth</label><input type="range" min="0.001" max="0.05" step="0.001" /><input type="number" step="0.001" /></div>
				<div class="field" data-field="outlineBoost"><label>strokeGlow</label><input type="range" min="0.2" max="3" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-field="outlineExpand"><label>strokeGap (outside)</label><input type="range" min="0" max="0.04" step="0.001" /><input type="number" step="0.001" /></div>
				<div class="field" data-field="flowSpeed"><label>flowSpeed</label><input type="range" min="0" max="3" step="0.05" /><input type="number" step="0.05" /></div>
				<div class="field" data-field="dashCount"><label>dashCount</label><input type="range" min="2" max="64" step="1" /><input type="number" step="1" /></div>
				<div class="field" data-field="dashLength"><label>dashLength</label><input type="range" min="0.05" max="0.8" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-field="dashSoft"><label>dashSoft</label><input type="range" min="0.01" max="0.2" step="0.01" /><input type="number" step="0.01" /></div>
			</section>
			<section class="section">
				<p class="sectionTitle">Brand colour</p>
				<div class="field" data-field="tint"><label>tint (neon)</label><input type="color" /><input type="text" /></div>
				<div class="field" data-field="core"><label>core</label><input type="color" /><input type="text" /></div>
				<div class="field" data-field="outline"><label>outline</label><input type="color" /><input type="text" /></div>
			</section>
			<section class="section">
				<p class="sectionTitle">Fill / look</p>
				<div class="field" data-field="fillOpacity"><label>fillOpacity (0=hollow)</label><input type="range" min="0" max="1" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-field="fillDark"><label>fillDark</label><input type="range" min="0.05" max="1.2" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-field="intensity"><label>intensity</label><input type="range" min="0.2" max="2.5" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-field="glow"><label>glow</label><input type="range" min="0" max="3" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-field="scanSpeed"><label>scanSpeed</label><input type="range" min="0" max="3" step="0.05" /><input type="number" step="0.05" /></div>
				<div class="field" data-field="glitch"><label>glitch</label><input type="range" min="0" max="2" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-field="pointerStrength"><label>pointer</label><input type="range" min="0" max="2" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-field="parallax"><label>parallax</label><input type="range" min="0" max="0.15" step="0.001" /><input type="number" step="0.001" /></div>
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
		this._detachPanelDrag = attachDevPanelDrag(this._panel, { id: "aboutEpicText" });

		const modesRoot = this._panel.querySelector("[data-modes]");
		for (const mode of ABOUT_EPIC_TEXT_MODES) {
			const btn = document.createElement("button");
			btn.type = "button";
			btn.textContent = mode.label;
			btn.dataset.modeId = String(mode.id);
			btn.addEventListener("click", () => {
				aboutEpicTextTune.mode = mode.id;
				this._syncModeButtons();
				this._setStatus(`mode ${mode.id} · ${mode.key}`);
			});
			modesRoot?.appendChild(btn);
			this._modeButtons.push(btn);
		}

		this._bindFields();
		this._panel.querySelector('[data-action="copy"]')?.addEventListener("click", () => this._copyConfig());
		this._panel.querySelector('[data-action="reset"]')?.addEventListener("click", () => this._reset());
		this._panel.querySelector('[data-action="close"]')?.addEventListener("click", () => this.setEnabled(false));

		registerDevPanelHotkey(this._hotkey, {
			label: "Epic Text",
			toggle: () => this.toggle(),
		});

		this._syncFieldsFromTune();
		this._syncModeButtons();
		this._setStatus(`Press ${HOTKEY} to toggle · ${formatDevPanelHotkeyHints()}`);
		if (this._hintsEl) {
			this._hintsEl.textContent = formatDevPanelHotkeyHints();
		}

		if (shouldOpenFromUrl()) {
			this.setEnabled(true);
		}
	}

	_bindFields() {
		for (const field of this._panel.querySelectorAll("[data-field]")) {
			const key = field.getAttribute("data-field");
			if (!key) continue;
			const range = field.querySelector('input[type="range"]');
			const number = field.querySelector('input[type="number"]');
			const color = field.querySelector('input[type="color"]');
			const text = field.querySelector('input[type="text"]');
			this._fields.set(key, { range, number, color, text });

			const onNumeric = (value) => {
				const next = Number(value);
				if (!Number.isFinite(next)) return;
				aboutEpicTextTune[key] = next;
				if (range) range.value = String(next);
				if (number) number.value = String(next);
				this._setStatus("live");
			};

			range?.addEventListener("input", () => onNumeric(range.value));
			number?.addEventListener("change", () => onNumeric(number.value));

			const onColor = (value) => {
				let hex = String(value || "").trim();
				if (!hex.startsWith("#")) hex = `#${hex}`;
				if (!/^#[0-9a-fA-F]{6}$/i.test(hex)) return;
				aboutEpicTextTune[key] = hex;
				if (color) color.value = hex;
				if (text) text.value = hex;
				this._setStatus("live");
			};

			color?.addEventListener("input", () => onColor(color.value));
			text?.addEventListener("change", () => onColor(text.value));
		}
	}

	_syncFieldsFromTune() {
		for (const [key, refs] of this._fields) {
			const value = aboutEpicTextTune[key];
			if (COLOR_KEYS.has(key)) {
				const hex = String(value ?? "#00b3ff");
				if (refs.color) refs.color.value = hex;
				if (refs.text) refs.text.value = hex;
				continue;
			}
			if (typeof value !== "number") continue;
			if (refs.range) refs.range.value = String(value);
			if (refs.number) refs.number.value = String(value);
		}
	}

	_syncModeButtons() {
		const active = Math.round(aboutEpicTextTune.mode);
		for (const btn of this._modeButtons) {
			const id = Number(btn.dataset.modeId);
			btn.classList.toggle("active", id === active);
			btn.style.outline = id === active ? "1px solid #7ec8ff" : "";
			btn.style.opacity = id === active ? "1" : "0.75";
		}
	}

	async _copyConfig() {
		const text = formatTuneForCopy(aboutEpicTextTune);
		try {
			await navigator.clipboard.writeText(text);
			this._setStatus("copied tune → clipboard");
		} catch {
			console.info("[epicTextDev]\n" + text);
			this._setStatus("copy failed — see console");
		}
	}

	_reset() {
		resetAboutEpicTextTune();
		this._syncFieldsFromTune();
		this._syncModeButtons();
		this._setStatus("reset to defaults");
	}

	_setStatus(text) {
		if (this._statusEl) this._statusEl.textContent = text;
	}

	toggle() {
		this.setEnabled(!this.enabled);
	}

	setEnabled(next) {
		if (!import.meta.env.DEV || this.enabled === next) return;
		this.enabled = next;
		this._panel.classList.toggle("hidden", !next);
		if (next) {
			this._syncFieldsFromTune();
			this._syncModeButtons();
			this._setStatus(`open · ${HOTKEY} closes · ${formatDevPanelHotkeyHints()}`);
			if (this._hintsEl) this._hintsEl.textContent = formatDevPanelHotkeyHints();
		}
	}

	dispose() {
		if (!import.meta.env.DEV) return;
		unregisterDevPanelHotkey(this._hotkey);
		this._detachPanelDrag?.();
		this._detachPanelDrag = null;
		this._panel?.remove();
		this._panel = null;
	}
}
