import { formatConfigNumber, injectSceneDevToolsStyles } from "./sceneDevPanelUtils.js";
import { formatDevPanelHotkeyHints, registerDevPanelHotkey, unregisterDevPanelHotkey } from "./devPanelHotkeys.js";
import { attachDevPanelDrag } from "./devPanelDrag.js";
import {
	CONTACTS_HOLOGRAM_LIVE_KEYS,
	CONTACTS_HOLOGRAM_SHAPE_KEYS,
	contactsCameraTune,
	contactsCameraTuneDefaults,
	contactsHologramTune,
	contactsHologramTuneDefaults,
	resetContactsCameraTune,
	resetContactsHologramTune,
} from "../scenes/contacts/contactsSceneConfig.js";

const HOTKEY = "3";
const COLOR_KEYS = new Set(["colorA", "colorB"]);
const LIVE_KEY_SET = new Set(CONTACTS_HOLOGRAM_LIVE_KEYS);
const SHAPE_KEY_SET = new Set(CONTACTS_HOLOGRAM_SHAPE_KEYS);

function shouldOpenFromUrl() {
	try {
		return new URLSearchParams(window.location.search).has("contactsDev");
	} catch {
		return false;
	}
}

function formatObjectTune(exportName, tune) {
	const lines = Object.entries(tune).map(([key, value]) => {
		if (Array.isArray(value)) {
			return `\t${key}: [${value.map((n) => formatConfigNumber(n)).join(", ")}],`;
		}
		if (typeof value === "number") {
			return `\t${key}: ${formatConfigNumber(value)},`;
		}
		return `\t${key}: ${JSON.stringify(value)},`;
	});
	return `export const ${exportName} = {\n${lines.join("\n")}\n};\n`;
}

/**
 * DEV panel — Contacts right hologram (pose / look live; shape rebuild on button).
 * Hotkey: 3 · URL: ?contactsDev=1
 *
 * Performance: sliders only write uniforms + transforms. Particle buffer rebuild
 * runs only when pressing “Rebuild shape” (or Reset).
 */
export class ContactsDevTools {
	/**
	 * @param {{ getScene?: () => import("../scenes/contacts/ContactsScene.js").ContactsScene | null }} options
	 */
	constructor(options = {}) {
		if (!import.meta.env.DEV) {
			return;
		}

		this.getScene = options.getScene ?? (() => null);
		this.enabled = false;
		this._hotkey = HOTKEY;
		this._detachPanelDrag = null;
		this._statusEl = null;
		this._hintsEl = null;
		/** @type {Map<string, { tune: 'hologram' | 'camera', key: string, axis?: number, range?: HTMLInputElement, number?: HTMLInputElement, color?: HTMLInputElement, text?: HTMLInputElement }>} */
		this._fields = new Map();
		this._shapeDirty = false;

		injectSceneDevToolsStyles();
		this._panel = document.createElement("div");
		this._panel.className = "sceneDevTools contactsDevTools hidden";
		this._panel.innerHTML = `
			<div class="devPanelDragHandle">
				<p class="title">Contacts Hologram</p>
			</div>
			<p class="legend">
				Right particle flower · hotkey <b>${HOTKEY}</b> · ?contactsDev=1<br/>
				Pose / color / glow apply live (uniforms). Shape + counts need <b>Rebuild shape</b>.
			</p>
			<p class="status" data-status></p>
			<section class="section">
				<p class="sectionTitle">Pose / placement</p>
				<div class="field" data-tune="hologram" data-field="offsetX"><label>offsetX</label><input type="range" min="0" max="8" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-tune="hologram" data-field="offsetY"><label>offsetY</label><input type="range" min="-2" max="2" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-tune="hologram" data-field="offsetZ"><label>offsetZ</label><input type="range" min="-3" max="3" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-tune="hologram" data-field="scale"><label>scale</label><input type="range" min="0.3" max="2.5" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-tune="hologram" data-field="tiltX"><label>tiltX</label><input type="range" min="-1.2" max="1.2" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-tune="hologram" data-field="tiltZ"><label>tiltZ</label><input type="range" min="-1.5" max="1.5" step="0.01" /><input type="number" step="0.01" /></div>
			</section>
			<section class="section">
				<p class="sectionTitle">Motion</p>
				<div class="field" data-tune="hologram" data-field="rockAmpX"><label>rockAmpX</label><input type="range" min="0" max="0.12" step="0.001" /><input type="number" step="0.001" /></div>
				<div class="field" data-tune="hologram" data-field="rockAmpZ"><label>rockAmpZ</label><input type="range" min="0" max="0.12" step="0.001" /><input type="number" step="0.001" /></div>
				<div class="field" data-tune="hologram" data-field="rockSpeedX"><label>rockSpdX</label><input type="range" min="0" max="1" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-tune="hologram" data-field="rockSpeedZ"><label>rockSpdZ</label><input type="range" min="0" max="1" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-tune="hologram" data-field="spinZ"><label>spinZ</label><input type="range" min="-0.2" max="0.2" step="0.001" /><input type="number" step="0.001" /></div>
			</section>
			<section class="section">
				<p class="sectionTitle">Look (live)</p>
				<div class="field" data-tune="hologram" data-field="colorA"><label>colorA</label><input type="color" /><input type="text" /></div>
				<div class="field" data-tune="hologram" data-field="colorB"><label>colorB</label><input type="color" /><input type="text" /></div>
				<div class="field" data-tune="hologram" data-field="pointOpacity"><label>opacity</label><input type="range" min="0.2" max="6" step="0.05" /><input type="number" step="0.05" /></div>
				<div class="field" data-tune="hologram" data-field="glowBoost"><label>glowBoost</label><input type="range" min="0.2" max="8" step="0.05" /><input type="number" step="0.05" /></div>
				<div class="field" data-tune="hologram" data-field="pointSize"><label>pointSize</label><input type="range" min="0.02" max="0.4" step="0.001" /><input type="number" step="0.001" /></div>
				<div class="field" data-tune="hologram" data-field="distort"><label>distort</label><input type="range" min="0" max="0.2" step="0.001" /><input type="number" step="0.001" /></div>
				<div class="field" data-tune="hologram" data-field="breath"><label>breath</label><input type="range" min="0" max="0.12" step="0.001" /><input type="number" step="0.001" /></div>
				<div class="field" data-tune="hologram" data-field="waveSpeed"><label>waveSpeed</label><input type="range" min="0" max="3" step="0.01" /><input type="number" step="0.01" /></div>
			</section>
			<section class="section">
				<p class="sectionTitle">Shape (needs Rebuild)</p>
				<div class="field" data-tune="hologram" data-field="petalCount" data-shape="1"><label>petals</label><input type="range" min="3" max="16" step="1" /><input type="number" step="1" /></div>
				<div class="field" data-tune="hologram" data-field="radius" data-shape="1"><label>radius</label><input type="range" min="0.6" max="5" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-tune="hologram" data-field="twist" data-shape="1"><label>twist</label><input type="range" min="0" max="2.5" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-tune="hologram" data-field="armWidth" data-shape="1"><label>armWidth</label><input type="range" min="0.05" max="0.8" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-tune="hologram" data-field="coreHole" data-shape="1"><label>coreHole</label><input type="range" min="0.02" max="0.7" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-tune="hologram" data-field="dish" data-shape="1"><label>dish</label><input type="range" min="0" max="0.6" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-tune="hologram" data-field="densityPower" data-shape="1"><label>density</label><input type="range" min="0.2" max="2" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-tune="hologram" data-field="tipSharpness" data-shape="1"><label>tipSharp</label><input type="range" min="0.6" max="2.5" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-tune="hologram" data-field="dustCount" data-shape="1"><label>dustCount</label><input type="range" min="800" max="24000" step="100" /><input type="number" step="100" /></div>
				<div class="field" data-tune="hologram" data-field="sparkCount" data-shape="1"><label>sparkCount</label><input type="range" min="0" max="4000" step="50" /><input type="number" step="50" /></div>
				<div class="actions">
					<button type="button" data-action="rebuild">Rebuild shape</button>
				</div>
			</section>
			<section class="section">
				<p class="sectionTitle">Camera</p>
				<div class="field" data-tune="camera" data-field="position" data-axis="0"><label>camX</label><input type="range" min="-2" max="8" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-tune="camera" data-field="position" data-axis="1"><label>camY</label><input type="range" min="-2" max="3" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-tune="camera" data-field="position" data-axis="2"><label>camZ</label><input type="range" min="2" max="12" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-tune="camera" data-field="lookAt" data-axis="0"><label>lookX</label><input type="range" min="-2" max="8" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-tune="camera" data-field="lookAt" data-axis="1"><label>lookY</label><input type="range" min="-2" max="2" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-tune="camera" data-field="lookAt" data-axis="2"><label>lookZ</label><input type="range" min="-4" max="4" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-tune="camera" data-field="fov"><label>fov</label><input type="range" min="20" max="70" step="0.5" /><input type="number" step="0.5" /></div>
				<div class="field" data-tune="camera" data-field="scrollY"><label>scrollY</label><input type="range" min="0" max="2" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-tune="camera" data-field="scrollZ"><label>scrollZ</label><input type="range" min="0" max="3" step="0.01" /><input type="number" step="0.01" /></div>
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
		this._detachPanelDrag = attachDevPanelDrag(this._panel, { id: "contactsHologram" });

		this._bindFields();
		this._panel.querySelector('[data-action="rebuild"]')?.addEventListener("click", () => this._rebuildShape());
		this._panel.querySelector('[data-action="copy"]')?.addEventListener("click", () => this._copyConfig());
		this._panel.querySelector('[data-action="reset"]')?.addEventListener("click", () => this._reset());
		this._panel.querySelector('[data-action="close"]')?.addEventListener("click", () => this.setEnabled(false));

		registerDevPanelHotkey(this._hotkey, {
			label: "Contacts",
			toggle: () => this.toggle(),
		});

		this._syncFieldsFromTune();
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
			const tuneKind = field.getAttribute("data-tune") === "camera" ? "camera" : "hologram";
			const axisRaw = field.getAttribute("data-axis");
			const axis = axisRaw == null || axisRaw === "" ? undefined : Number(axisRaw);
			if (!key) continue;

			const range = field.querySelector('input[type="range"]');
			const number = field.querySelector('input[type="number"]');
			const color = field.querySelector('input[type="color"]');
			const text = field.querySelector('input[type="text"]');
			const id = axis == null ? `${tuneKind}:${key}` : `${tuneKind}:${key}:${axis}`;
			this._fields.set(id, { tune: tuneKind, key, axis, range, number, color, text });

			const onNumeric = (value) => {
				const next = Number(value);
				if (!Number.isFinite(next)) return;
				this._writeNumeric(tuneKind, key, axis, next);
				if (range) range.value = String(next);
				if (number) number.value = String(next);
				this._onFieldEdited(tuneKind, key);
			};

			range?.addEventListener("input", () => onNumeric(range.value));
			number?.addEventListener("input", () => onNumeric(number.value));
			number?.addEventListener("change", () => onNumeric(number.value));

			const onColor = (value) => {
				let hex = String(value || "").trim();
				if (!hex.startsWith("#")) hex = `#${hex}`;
				if (!/^#[0-9a-fA-F]{6}$/i.test(hex)) return;
				contactsHologramTune[key] = hex;
				if (color) color.value = hex;
				if (text) text.value = hex;
				this._onFieldEdited("hologram", key);
			};

			color?.addEventListener("input", () => onColor(color.value));
			text?.addEventListener("input", () => onColor(text.value));
			text?.addEventListener("change", () => onColor(text.value));
		}
	}

	_writeNumeric(tuneKind, key, axis, next) {
		if (tuneKind === "camera") {
			if (key === "position" || key === "lookAt") {
				const arr = contactsCameraTune[key];
				if (Array.isArray(arr) && Number.isFinite(axis)) {
					arr[axis] = next;
				}
				return;
			}
			contactsCameraTune[key] = next;
			return;
		}
		contactsHologramTune[key] = next;
	}

	_readNumeric(tuneKind, key, axis) {
		if (tuneKind === "camera") {
			if (key === "position" || key === "lookAt") {
				const arr = contactsCameraTune[key];
				return Array.isArray(arr) && Number.isFinite(axis) ? arr[axis] : 0;
			}
			return contactsCameraTune[key];
		}
		return contactsHologramTune[key];
	}

	_onFieldEdited(tuneKind, key) {
		if (tuneKind === "camera") {
			this._setStatus("camera live");
			return;
		}
		if (SHAPE_KEY_SET.has(key)) {
			this._shapeDirty = true;
			this._setStatus("shape dirty — press Rebuild shape");
			// Keep uPetalCount in sync for motion phase without buffer rebuild.
			if (key === "petalCount") {
				this.getScene()?.applyTune?.(contactsHologramTune, { rebuildShape: false });
			}
			return;
		}
		if (LIVE_KEY_SET.has(key) || COLOR_KEYS.has(key)) {
			this.getScene()?.applyTune?.(contactsHologramTune, { rebuildShape: false });
			this._setStatus("look / pose live");
		}
	}

	_rebuildShape() {
		const scene = this.getScene();
		if (!scene?.applyTune) {
			this._setStatus("contacts scene not ready");
			return;
		}
		const t0 = performance.now();
		scene.applyTune(contactsHologramTune, { rebuildShape: true });
		this._shapeDirty = false;
		this._setStatus(`shape rebuilt · ${Math.round(performance.now() - t0)}ms`);
	}

	_syncFieldsFromTune() {
		for (const [, refs] of this._fields) {
			const { tune, key, axis, range, number, color, text } = refs;
			if (COLOR_KEYS.has(key)) {
				const hex = String(contactsHologramTune[key] ?? "#5ad4ff");
				if (color) color.value = hex;
				if (text) text.value = hex;
				continue;
			}
			const value = this._readNumeric(tune, key, axis);
			if (typeof value !== "number" || !Number.isFinite(value)) continue;
			if (range) range.value = String(value);
			if (number) number.value = String(value);
		}
	}

	async _copyConfig() {
		const text = [
			formatObjectTune("contactsCameraTuneDefaults", contactsCameraTune),
			formatObjectTune("contactsHologramTuneDefaults", contactsHologramTune),
		].join("\n");
		try {
			await navigator.clipboard.writeText(text);
			this._setStatus("copied camera + hologram tunes → clipboard");
		} catch {
			console.info("[contactsDev]\n" + text);
			this._setStatus("copy failed — see console");
		}
	}

	_reset() {
		resetContactsCameraTune();
		resetContactsHologramTune();
		this._syncFieldsFromTune();
		this.getScene()?.applyTune?.(contactsHologramTune, { rebuildShape: true });
		this._shapeDirty = false;
		this._setStatus("reset + shape rebuilt");
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
		if (!import.meta.env.DEV || this.enabled === next) return;
		this.enabled = next;
		this._panel.classList.toggle("hidden", !next);
		if (next) {
			this._syncFieldsFromTune();
			this._setStatus(
				this._shapeDirty
					? `open · shape dirty — Rebuild · ${formatDevPanelHotkeyHints()}`
					: `open · ${HOTKEY} closes · ${formatDevPanelHotkeyHints()}`,
			);
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
