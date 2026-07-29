import { formatConfigNumber, injectSceneDevToolsStyles } from "./sceneDevPanelUtils.js";
import { formatDevPanelHotkeyHints, registerDevPanelHotkey, unregisterDevPanelHotkey } from "./devPanelHotkeys.js";
import { attachDevPanelDrag } from "./devPanelDrag.js";
import {
	belkaNeonTune,
	belkaNeonTuneDefaults,
	belkaSceneTune,
	belkaSceneTuneDefaults,
	resetBelkaNeonTune,
	resetBelkaSceneTune,
} from "../scenes/portfolio/case6/belkaSceneConfig.js";
import {
	belkaEmeraldTune,
	belkaEmeraldTuneDefaults,
	resetBelkaEmeraldTune,
} from "../scenes/portfolio/case6/belkaEmeraldMaterial.js";
import {
	BELKA_SHELL_STYLES,
	normalizeBelkaShellStyleId,
} from "../scenes/portfolio/case6/belkaShellMaterial.js";

const HOTKEY = "4";

const EMERALD_COLOR_KEYS = new Set([
	"coreColor",
	"midColor",
	"rimColor",
	"sparkleColor",
	"fireColor",
]);

const NEON_COLOR_KEYS = new Set(["color", "coreColor"]);

function shouldOpenFromUrl() {
	try {
		return new URLSearchParams(window.location.search).has("belkaDev");
	} catch {
		return false;
	}
}

function formatObjectTune(exportName, tune) {
	const lines = Object.entries(tune).map(([key, value]) => {
		if (typeof value === "number") {
			return `\t${key}: ${formatConfigNumber(value)},`;
		}
		return `\t${key}: ${JSON.stringify(value)},`;
	});
	return `export const ${exportName} = {\n${lines.join("\n")}\n};\n`;
}

function shellStyleButtonsHtml() {
	return BELKA_SHELL_STYLES.map(
		(s) => `<button type="button" data-shell-style="${s.id}" title="${s.blurb}">${s.label}</button>`,
	).join("");
}

/**
 * DEV panel — Belka neon beads + emerald material + nut shell styles.
 * Hotkey: 4 · URL: ?belkaDev=1
 */
export class BelkaOrbitsDevTools {
	/**
	 * @param {{ getScene?: () => import("../scenes/portfolio/case6/BelkaScene.js").BelkaScene | null }} options
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
		this._shellStyleEl = null;
		this._shellBlurbEl = null;
		/** @type {Map<string, { tune: 'scene' | 'emerald' | 'neon', range?: HTMLInputElement, number?: HTMLInputElement, color?: HTMLInputElement, text?: HTMLInputElement }>} */
		this._fields = new Map();

		injectSceneDevToolsStyles();
		this._panel = document.createElement("div");
		this._panel.className = "sceneDevTools belkaOrbitsDevTools hidden";
		this._panel.innerHTML = `
			<div class="devPanelDragHandle">
				<p class="title">Belka Scene</p>
			</div>
			<p class="legend">Neon beads + emerald + nut shell · hotkey <b>${HOTKEY}</b> · ?belkaDev=1</p>
			<p class="status" data-status></p>
			<section class="section">
				<p class="sectionTitle">Nut shell style</p>
				<p class="legend" data-shell-blurb style="margin:0 0 6px;opacity:0.8"></p>
				<div class="actions" data-shell-styles style="flex-wrap:wrap;gap:4px">
					${shellStyleButtonsHtml()}
				</div>
			</section>
			<section class="section">
				<p class="sectionTitle">Layout</p>
				<div class="field" data-tune="scene" data-field="rootX"><label>rootX</label><input type="range" min="-2" max="4" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-tune="scene" data-field="rootY"><label>rootY</label><input type="range" min="-2" max="2" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-tune="scene" data-field="rootScale"><label>rootScale</label><input type="range" min="0.5" max="2.5" step="0.01" /><input type="number" step="0.01" /></div>
			</section>
			<section class="section">
				<p class="sectionTitle">Nut / gem size</p>
				<div class="field" data-tune="scene" data-field="nutScale"><label>nut</label><input type="range" min="0.4" max="2" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-tune="scene" data-field="emeraldScale"><label>emerald</label><input type="range" min="0.3" max="1.8" step="0.01" /><input type="number" step="0.01" /></div>
			</section>
			<section class="section">
				<p class="sectionTitle">Neon material</p>
				<div class="field" data-tune="neon" data-field="color"><label>color</label><input type="color" /><input type="text" /></div>
				<div class="field" data-tune="neon" data-field="coreColor"><label>core</label><input type="color" /><input type="text" /></div>
				<div class="field" data-tune="neon" data-field="intensity"><label>intensity</label><input type="range" min="0.3" max="5" step="0.05" /><input type="number" step="0.05" /></div>
			</section>
			<section class="section">
				<p class="sectionTitle">Emerald colors</p>
				<div class="field" data-tune="emerald" data-field="coreColor"><label>core</label><input type="color" /><input type="text" /></div>
				<div class="field" data-tune="emerald" data-field="midColor"><label>mid</label><input type="color" /><input type="text" /></div>
				<div class="field" data-tune="emerald" data-field="rimColor"><label>rim</label><input type="color" /><input type="text" /></div>
				<div class="field" data-tune="emerald" data-field="sparkleColor"><label>sparkle</label><input type="color" /><input type="text" /></div>
				<div class="field" data-tune="emerald" data-field="fireColor"><label>fire</label><input type="color" /><input type="text" /></div>
			</section>
			<section class="section">
				<p class="sectionTitle">Emerald look</p>
				<div class="field" data-tune="emerald" data-field="opacity"><label>opacity</label><input type="range" min="0.3" max="1" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-tune="emerald" data-field="fresnelPower"><label>fresnelPow</label><input type="range" min="0.8" max="5" step="0.05" /><input type="number" step="0.05" /></div>
				<div class="field" data-tune="emerald" data-field="fresnelStrength"><label>fresnelStr</label><input type="range" min="0" max="4" step="0.05" /><input type="number" step="0.05" /></div>
				<div class="field" data-tune="emerald" data-field="internalDepth"><label>depth</label><input type="range" min="0" max="1" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-tune="emerald" data-field="specularPower"><label>specPow</label><input type="range" min="16" max="512" step="1" /><input type="number" step="1" /></div>
				<div class="field" data-tune="emerald" data-field="specularStrength"><label>specStr</label><input type="range" min="0" max="4" step="0.05" /><input type="number" step="0.05" /></div>
				<div class="field" data-tune="emerald" data-field="sparkleStrength"><label>sparkle</label><input type="range" min="0" max="3" step="0.05" /><input type="number" step="0.05" /></div>
				<div class="field" data-tune="emerald" data-field="iridescence"><label>iridescence</label><input type="range" min="0" max="1.5" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-tune="emerald" data-field="dispersion"><label>dispersion</label><input type="range" min="0" max="1.5" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-tune="emerald" data-field="causticStrength"><label>caustic</label><input type="range" min="0" max="1.5" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-tune="emerald" data-field="glowBoost"><label>glowBoost</label><input type="range" min="0.4" max="2.5" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-tune="emerald" data-field="innerGlow"><label>innerGlow</label><input type="range" min="0" max="2" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-tune="emerald" data-field="edgeEnergy"><label>edgeEnergy</label><input type="range" min="0" max="2" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-tune="emerald" data-field="parallax"><label>parallax</label><input type="range" min="0" max="1" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-tune="emerald" data-field="reflectStrength"><label>reflect</label><input type="range" min="0" max="2.5" step="0.01" /><input type="number" step="0.01" /></div>
			</section>
			<section class="section">
				<p class="sectionTitle">Beads — shell</p>
				<div class="field" data-tune="scene" data-field="orbitRadiusA"><label>inner R</label><input type="range" min="0.8" max="4" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-tune="scene" data-field="orbitRadiusB"><label>mid R</label><input type="range" min="0.8" max="4.5" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-tune="scene" data-field="orbitRadiusC"><label>outer R</label><input type="range" min="0.8" max="5" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-tune="scene" data-field="orbitTiltSpread"><label>chaos</label><input type="range" min="0.1" max="1.2" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-tune="scene" data-field="beadScale"><label>bead scale</label><input type="range" min="0.3" max="2.2" step="0.01" /><input type="number" step="0.01" /></div>
			</section>
			<section class="section">
				<p class="sectionTitle">Beads — motion</p>
				<div class="field" data-tune="scene" data-field="orbitTilt"><label>tilt X</label><input type="range" min="-0.2" max="1.2" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-tune="scene" data-field="orbitRoll"><label>roll Z</label><input type="range" min="-0.6" max="0.6" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-tune="scene" data-field="orbitYaw"><label>yaw Y</label><input type="range" min="-3.14" max="3.14" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-tune="scene" data-field="orbitSpin"><label>spin speed</label><input type="range" min="0" max="0.8" step="0.005" /><input type="number" step="0.005" /></div>
			</section>
			<section class="section">
				<p class="sectionTitle">Beads — position</p>
				<div class="field" data-tune="scene" data-field="orbitX"><label>X</label><input type="range" min="-2" max="2" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-tune="scene" data-field="orbitY"><label>Y</label><input type="range" min="-2" max="1.5" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-tune="scene" data-field="orbitZ"><label>Z</label><input type="range" min="-2" max="2" step="0.01" /><input type="number" step="0.01" /></div>
			</section>
			<section class="section">
				<div class="actions">
					<button type="button" data-action="copy">Copy JS</button>
					<button type="button" data-action="reset">Reset</button>
					<button type="button" data-action="close">Close</button>
				</div>
			</section>
			<p class="hints" data-hints></p>
		`;

		document.body.appendChild(this._panel);
		this._statusEl = this._panel.querySelector("[data-status]");
		this._hintsEl = this._panel.querySelector("[data-hints]");
		this._shellStyleEl = this._panel.querySelector("[data-shell-styles]");
		this._shellBlurbEl = this._panel.querySelector("[data-shell-blurb]");
		this._detachPanelDrag = attachDevPanelDrag(this._panel, {
			storageKey: "digitalmonster-dev-panel-pos:belka",
		});

		this._bindFields();
		this._bindShellStyles();

		this._panel.querySelector('[data-action="copy"]')?.addEventListener("click", () => this._copyConfig());
		this._panel.querySelector('[data-action="reset"]')?.addEventListener("click", () => this._reset());
		this._panel.querySelector('[data-action="close"]')?.addEventListener("click", () => this.setEnabled(false));

		registerDevPanelHotkey(HOTKEY, {
			label: "Belka Scene",
			toggle: () => this.toggle(),
		});

		if (shouldOpenFromUrl()) {
			this.setEnabled(true);
		}
	}

	_parseTuneNumber(value) {
		if (typeof value === "number") return value;
		const n = Number(String(value ?? "").trim().replace(",", "."));
		return Number.isFinite(n) ? n : NaN;
	}

	_bindShellStyles() {
		this._shellStyleEl?.querySelectorAll("[data-shell-style]").forEach((btn) => {
			btn.addEventListener("click", () => {
				const id = normalizeBelkaShellStyleId(btn.getAttribute("data-shell-style"));
				belkaSceneTune.shellStyle = id;
				this._syncShellStyleUi();
				this._applyLive("shell");
			});
		});
	}

	_syncShellStyleUi() {
		const id = normalizeBelkaShellStyleId(belkaSceneTune.shellStyle);
		const meta = BELKA_SHELL_STYLES.find((s) => s.id === id);
		this._shellStyleEl?.querySelectorAll("[data-shell-style]").forEach((btn) => {
			const active = btn.getAttribute("data-shell-style") === id;
			btn.classList.toggle("is-active", active);
			btn.style.outline = active ? "1px solid #01dcf9" : "";
			btn.style.opacity = active ? "1" : "0.75";
		});
		if (this._shellBlurbEl) {
			this._shellBlurbEl.textContent = meta ? `${meta.label} — ${meta.blurb}` : id;
		}
	}

	_applyLive(fromKind = "scene") {
		const scene = this.getScene?.() ?? null;
		if (!scene?.applyTune) {
			this._setStatus("no Belka scene (open /portfolio/06 first)");
			return;
		}
		scene.applyTune(belkaSceneTune);
		if (fromKind === "shell") {
			const id = normalizeBelkaShellStyleId(belkaSceneTune.shellStyle);
			this._setStatus(`shell → ${id}`);
			return;
		}
		this._setStatus(fromKind === "neon" ? "neon live" : "live");
	}

	_tuneTarget(kind) {
		if (kind === "emerald") return belkaEmeraldTune;
		if (kind === "neon") return belkaNeonTune;
		return belkaSceneTune;
	}

	_tuneDefaults(kind) {
		if (kind === "emerald") return belkaEmeraldTuneDefaults;
		if (kind === "neon") return belkaNeonTuneDefaults;
		return belkaSceneTuneDefaults;
	}

	_bindFields() {
		for (const field of this._panel.querySelectorAll("[data-field]")) {
			const key = field.getAttribute("data-field");
			const rawTune = field.getAttribute("data-tune");
			const tuneKind = rawTune === "emerald" || rawTune === "neon" ? rawTune : "scene";
			if (!key) continue;
			const range = field.querySelector('input[type="range"]');
			const number = field.querySelector('input[type="number"]');
			const color = field.querySelector('input[type="color"]');
			const text = field.querySelector('input[type="text"]');
			this._fields.set(`${tuneKind}:${key}`, { tune: tuneKind, range, number, color, text });

			const target = this._tuneTarget(tuneKind);

			const onNumeric = (value) => {
				const next = this._parseTuneNumber(value);
				if (!Number.isFinite(next)) return;
				target[key] = next;
				if (range) range.value = String(next);
				if (number) number.value = String(next);
				this._applyLive(tuneKind);
			};

			range?.addEventListener("input", () => onNumeric(range.value));
			number?.addEventListener("input", () => onNumeric(number.value));
			number?.addEventListener("change", () => onNumeric(number.value));

			const onColor = (value) => {
				let hex = String(value || "").trim();
				if (!hex.startsWith("#")) hex = `#${hex}`;
				if (!/^#[0-9a-fA-F]{6}$/i.test(hex)) return;
				target[key] = hex;
				if (color) color.value = hex;
				if (text) text.value = hex;
				this._applyLive(tuneKind);
			};

			color?.addEventListener("input", () => onColor(color.value));
			text?.addEventListener("input", () => onColor(text.value));
			text?.addEventListener("change", () => onColor(text.value));
		}
	}

	_syncFieldsFromTune() {
		for (const [id, refs] of this._fields) {
			const [tuneKind, key] = id.split(":");
			const source = this._tuneTarget(tuneKind);
			const defaults = this._tuneDefaults(tuneKind);
			const value = source[key] ?? defaults[key];

			if (
				(tuneKind === "emerald" && EMERALD_COLOR_KEYS.has(key))
				|| (tuneKind === "neon" && NEON_COLOR_KEYS.has(key))
				|| refs.color
			) {
				const hex = String(value ?? "#ffffff");
				if (refs.color) refs.color.value = hex;
				if (refs.text) refs.text.value = hex;
				continue;
			}
			if (typeof value !== "number") continue;
			if (refs.range) refs.range.value = String(value);
			if (refs.number) refs.number.value = String(value);
		}
		this._syncShellStyleUi();
	}

	async _copyConfig() {
		const text = [
			formatObjectTune("belkaSceneTuneDefaults", belkaSceneTune),
			formatObjectTune("belkaNeonTuneDefaults", belkaNeonTune),
			formatObjectTune("belkaEmeraldTuneDefaults", belkaEmeraldTune),
		].join("\n");
		try {
			await navigator.clipboard.writeText(text);
			this._setStatus("copied scene + neon + emerald tunes → clipboard");
		} catch {
			console.info("[belkaDev]\n" + text);
			this._setStatus("copy failed — see console");
		}
	}

	_reset() {
		resetBelkaSceneTune();
		resetBelkaNeonTune();
		resetBelkaEmeraldTune();
		this._syncFieldsFromTune();
		this._applyLive();
		this._setStatus("reset scene + neon + emerald defaults");
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
