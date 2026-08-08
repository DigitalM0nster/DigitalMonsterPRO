import { digitalWhaleConfig } from "../scenes/home/digitalWhaleConfig.js";
import { attachDevPanelDrag } from "./devPanelDrag.js";
import {
	formatDevPanelHotkeyHints,
	registerDevPanelHotkey,
	unregisterDevPanelHotkey,
} from "./devPanelHotkeys.js";
import {
	formatConfigNumber,
	injectSceneDevToolsStyles,
	shouldOpenWhaleDevFromUrl,
} from "./sceneDevPanelUtils.js";

const HOTKEY = "6";
const COLOR_KEYS = new Set(["pointColor", "gridColor"]);
const REBUILD_KEYS = new Set(["gridCols", "gridRows"]);

const SECTIONS = [
	{
		title: "Placement",
		fields: [
			["posX", -30, 30, 0.1],
			["posY", -10, 15, 0.1],
			["posZ", -30, 40, 0.1],
			["tiltX", -1.2, 1.2, 0.001],
			["rotationY", -1.2, 1.2, 0.001],
			["mouseTiltX", -0.1, 0.1, 0.001],
			["mouseTiltY", -0.1, 0.1, 0.001],
			["scaleX", 0.05, 1.5, 0.01],
			["scaleZ", 0.05, 1.5, 0.01],
		],
	},
	{
		title: "Surface look (live uniforms)",
		fields: [
			["pointColor", "color"],
			["gridColor", "color"],
			["pointScale", 0.1, 12, 0.05],
			["pointAlpha", 0, 3, 0.01],
			["pointGlow", 0, 12, 0.05],
			["gridAlpha", 0, 4, 0.01],
			["waveAmp", 0, 4, 0.01],
			["rippleAmp", 0, 4, 0.01],
		],
	},
	{
		title: "Motion / ripple",
		fields: [
			["scrollSpeedX", -30, 30, 0.1],
			["scrollSpeedZ", -30, 30, 0.1],
			["rippleCenterX", -60, 60, 0.1],
			["rippleCenterZ", -60, 60, 0.1],
			["rippleFollowWhale", "boolean"],
		],
	},
	{
		title: "Density (manual rebuild)",
		fields: [
			["gridCols", 16, 800, 1],
			["gridRows", 12, 220, 1],
		],
	},
];

function renderField(field) {
	const [key, typeOrMin, max, step] = field;
	if (typeOrMin === "color") {
		return `<div class="field" data-field="${key}"><label>${key}</label><input type="color" /><input type="text" /></div>`;
	}
	if (typeOrMin === "boolean") {
		return `<label class="fieldToggle" data-field="${key}"><input type="checkbox" /><span>${key}</span></label>`;
	}
	const rebuild = REBUILD_KEYS.has(key) ? ' data-rebuild="1"' : "";
	return `<div class="field" data-field="${key}"${rebuild}><label>${key}</label><input type="range" min="${typeOrMin}" max="${max}" step="${step}" /><input type="number" min="${typeOrMin}" max="${max}" step="${step}" /></div>`;
}

function renderSections() {
	return SECTIONS.map(
		({ title, fields }) => `
			<section class="section">
				<p class="sectionTitle">${title}</p>
				${fields.map(renderField).join("\n")}
			</section>`,
	).join("\n");
}

function formatOceanConfigForCopy(ocean) {
	const lines = Object.entries(ocean).map(([key, value]) => {
		if (typeof value === "number") {
			return `\t${key}: ${formatConfigNumber(value)},`;
		}
		return `\t${key}: ${JSON.stringify(value)},`;
	});
	return `ocean: {\n${lines.join("\n")}\n},`;
}

function assignOceanConfig(source) {
	const ocean = digitalWhaleConfig.ocean;
	for (const [key, value] of Object.entries(source)) {
		ocean[key] = value;
	}
}

/**
 * DEV-only live editor for the home ocean.
 * Uniforms/transforms update immediately; density rebuild stays explicit.
 */
export class OceanDevTools {
	/**
	 * @param {{ getScene?: () => import("../scenes/home/DigitalWhaleScene.js").DigitalWhaleScene | null }} options
	 */
	constructor(options = {}) {
		if (!import.meta.env.DEV) {
			return;
		}

		this.getScene = options.getScene ?? (() => null);
		this.enabled = false;
		this._hotkey = HOTKEY;
		this._defaults = structuredClone(digitalWhaleConfig.ocean);
		this._fields = new Map();
		this._gridDirty = false;
		this._detachPanelDrag = null;

		injectSceneDevToolsStyles();
		this._panel = document.createElement("div");
		this._panel.className = "sceneDevTools oceanDevTools hidden";
		this._panel.innerHTML = `
			<div class="devPanelDragHandle"><p class="title">Digital Ocean</p></div>
			<p class="legend">
				Home ocean · hotkey <b>${HOTKEY}</b> · ?oceanDev=1<br/>
				Look, motion and placement apply live. Grid density changes only after <b>Rebuild grid</b>.
			</p>
			<p class="status" data-status></p>
			<section class="section" data-readouts>
				<p class="sectionTitle">Runtime</p>
				<p class="readout"><span class="k">mode</span><span class="v" data-mode>—</span></p>
				<p class="readout"><span class="k">grid</span><span class="v" data-grid>—</span></p>
				<p class="readout"><span class="k">mesh / tiles</span><span class="v" data-mesh>—</span></p>
			</section>
			${renderSections()}
			<section class="section">
				<div class="actions">
					<button type="button" data-action="rebuild">Rebuild grid</button>
					<button type="button" data-action="copy">Copy config</button>
					<button type="button" data-action="reset">Reset</button>
					<button type="button" data-action="close">Close</button>
				</div>
			</section>
			<footer class="legend" data-hints></footer>
		`;
		document.body.appendChild(this._panel);

		this._statusEl = this._panel.querySelector("[data-status]");
		this._hintsEl = this._panel.querySelector("[data-hints]");
		this._modeEl = this._panel.querySelector("[data-mode]");
		this._gridEl = this._panel.querySelector("[data-grid]");
		this._meshEl = this._panel.querySelector("[data-mesh]");
		this._rebuildButton = this._panel.querySelector('[data-action="rebuild"]');
		this._detachPanelDrag = attachDevPanelDrag(this._panel, { id: "digitalOcean" });

		this._bindFields();
		this._rebuildButton?.addEventListener("click", () => this._rebuildGrid());
		this._panel.querySelector('[data-action="copy"]')?.addEventListener("click", () => this._copyConfig());
		this._panel.querySelector('[data-action="reset"]')?.addEventListener("click", () => this._reset());
		this._panel.querySelector('[data-action="close"]')?.addEventListener("click", () => this.setEnabled(false));

		registerDevPanelHotkey(this._hotkey, {
			label: "Ocean",
			toggle: () => this.toggle(),
		});

		this._syncFieldsFromConfig();
		this._syncReadouts();
		this._setStatus(`Press ${HOTKEY} to toggle · ${formatDevPanelHotkeyHints()}`);
		this._syncHints();

		if (shouldOpenWhaleDevFromUrl()) {
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
			const checkbox = field.querySelector('input[type="checkbox"]');
			this._fields.set(key, { range, number, color, text, checkbox });

			const onNumeric = (raw) => {
				let next = Number(raw);
				if (!Number.isFinite(next)) return;
				if (REBUILD_KEYS.has(key)) next = Math.round(next);
				digitalWhaleConfig.ocean[key] = next;
				if (range) range.value = String(next);
				if (number) number.value = String(next);
				this._onFieldEdited(key);
			};

			range?.addEventListener("input", () => onNumeric(range.value));
			number?.addEventListener("input", () => onNumeric(number.value));
			number?.addEventListener("change", () => onNumeric(number.value));

			const onColor = (raw) => {
				let hex = String(raw || "").trim();
				if (!hex.startsWith("#")) hex = `#${hex}`;
				if (!/^#[0-9a-fA-F]{6}$/i.test(hex)) return;
				digitalWhaleConfig.ocean[key] = hex;
				if (color) color.value = hex;
				if (text) text.value = hex;
				this._onFieldEdited(key);
			};

			color?.addEventListener("input", () => onColor(color.value));
			text?.addEventListener("input", () => onColor(text.value));
			text?.addEventListener("change", () => onColor(text.value));

			checkbox?.addEventListener("change", () => {
				digitalWhaleConfig.ocean[key] = checkbox.checked;
				this._onFieldEdited(key);
			});
		}
	}

	_onFieldEdited(key) {
		if (REBUILD_KEYS.has(key)) {
			this._gridDirty = true;
			this._rebuildButton?.classList.add("active");
			this._setStatus("grid density dirty — press Rebuild grid");
			return;
		}

		this.getScene()?.applyOceanConfigFromDev?.();
		this._syncReadouts();
		this._setStatus("ocean live");
	}

	_rebuildGrid() {
		const scene = this.getScene();
		if (!scene?.applyOceanConfigFromDev) {
			this._setStatus("home scene not ready");
			return;
		}

		const t0 = performance.now();
		scene.applyOceanConfigFromDev({ rebuildGrid: true });
		this._gridDirty = false;
		this._rebuildButton?.classList.remove("active");
		this._syncReadouts();
		this._setStatus(`grid rebuilt · ${Math.round(performance.now() - t0)}ms`);
	}

	_syncFieldsFromConfig() {
		const ocean = digitalWhaleConfig.ocean;
		for (const [key, refs] of this._fields) {
			const value = ocean[key];
			if (COLOR_KEYS.has(key)) {
				const hex = String(value ?? "#000000");
				if (refs.color) refs.color.value = hex;
				if (refs.text) refs.text.value = hex;
				continue;
			}
			if (refs.checkbox) {
				refs.checkbox.checked = Boolean(value);
				continue;
			}
			if (typeof value !== "number" || !Number.isFinite(value)) continue;
			if (refs.range) refs.range.value = String(value);
			if (refs.number) refs.number.value = String(value);
		}
	}

	_syncReadouts() {
		const scene = this.getScene();
		const grid = scene?.getOceanGridSize?.() ?? [0, 0];
		const mesh = scene?.getOceanMeshSegments?.() ?? [0, 0];
		if (this._modeEl) this._modeEl.textContent = scene?.getOceanRenderMode?.() ?? "not ready";
		if (this._gridEl) this._gridEl.textContent = `${grid[0]} × ${grid[1]}${this._gridDirty ? " (pending)" : ""}`;
		if (this._meshEl) this._meshEl.textContent = `${mesh[0]} × ${mesh[1]} / ${scene?.getOceanTileCount?.() ?? 0}`;
	}

	async _copyConfig() {
		const text = formatOceanConfigForCopy(digitalWhaleConfig.ocean);
		try {
			await navigator.clipboard.writeText(text);
			this._setStatus("copied ocean config → clipboard");
		} catch {
			console.info("[oceanDev]\n" + text);
			this._setStatus("copy failed — see console");
		}
	}

	_reset() {
		assignOceanConfig(structuredClone(this._defaults));
		this._syncFieldsFromConfig();
		this.getScene()?.applyOceanConfigFromDev?.({ rebuildGrid: true });
		this._gridDirty = false;
		this._rebuildButton?.classList.remove("active");
		this._syncReadouts();
		this._setStatus("reset to active tier defaults");
	}

	_syncHints() {
		if (this._hintsEl) this._hintsEl.textContent = formatDevPanelHotkeyHints();
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
			this._syncFieldsFromConfig();
			this._syncReadouts();
			this._syncHints();
			this._setStatus(
				this._gridDirty
					? `open · grid dirty — Rebuild · ${formatDevPanelHotkeyHints()}`
					: `open · ${HOTKEY} closes · ${formatDevPanelHotkeyHints()}`,
			);
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
