import { formatConfigNumber, injectSceneDevToolsStyles } from "./sceneDevPanelUtils.js";
import { formatDevPanelHotkeyHints, registerDevPanelHotkey, unregisterDevPanelHotkey } from "./devPanelHotkeys.js";
import { attachDevPanelDrag } from "./devPanelDrag.js";
import {
	caseStudyArcConfig,
	caseStudyArcInternals,
} from "@/portfolio/ui/CaseStudyCanvas/caseStudyArcConfig.js";
import { caseStudyArcActiveLineConfig } from "@/portfolio/ui/CaseStudyCanvas/caseStudyArcActiveLineConfig.js";
import {
	markCaseStudyArcDirty,
	wakeCaseStudyAnimationFrame,
} from "@/portfolio/core/caseStudyAnimationFrame.js";

const HOTKEY = "7";

const DEFAULT_LINE = { ...caseStudyArcActiveLineConfig };
const DEFAULT_CFG = {
	trackOpacity: caseStudyArcConfig.trackOpacity,
	activeOpacity: caseStudyArcConfig.activeOpacity,
	activeColor: caseStudyArcConfig.activeColor,
	nodeMidOpacity: caseStudyArcConfig.nodeMidOpacity,
	activeOuterBloomBlur: caseStudyArcConfig.activeOuterBloomBlur,
	activeOuterBloomStrength: caseStudyArcConfig.activeOuterBloomStrength,
	activeInnerBloomBlur: caseStudyArcConfig.activeInnerBloomBlur,
	activeInnerBloomStrength: caseStudyArcConfig.activeInnerBloomStrength,
	activeLineWidth: caseStudyArcConfig.activeLineWidth,
};
const DEFAULT_INTERNAL = {
	trackWidth: caseStudyArcInternals.trackWidth,
	nodeRadius: caseStudyArcInternals.nodeRadius,
	nodeMidRadius: caseStudyArcInternals.nodeMidRadius,
	nodeInnerRadius: caseStudyArcInternals.nodeInnerRadius,
};

/** @type {Record<string, { target: object, key: string }>} */
const FIELD_MAP = {
	halfSpanDeg: { target: caseStudyArcActiveLineConfig, key: "halfSpanDeg" },
	bloomBlur: { target: caseStudyArcActiveLineConfig, key: "bloomBlur" },
	bloomStrength: { target: caseStudyArcActiveLineConfig, key: "bloomStrength" },
	opacityBoost: { target: caseStudyArcActiveLineConfig, key: "opacityBoost" },
	trackOpacity: { target: caseStudyArcConfig, key: "trackOpacity" },
	activeOpacity: { target: caseStudyArcConfig, key: "activeOpacity" },
	activeColor: { target: caseStudyArcConfig, key: "activeColor" },
	nodeMidOpacity: { target: caseStudyArcConfig, key: "nodeMidOpacity" },
	activeOuterBloomBlur: { target: caseStudyArcConfig, key: "activeOuterBloomBlur" },
	activeOuterBloomStrength: { target: caseStudyArcConfig, key: "activeOuterBloomStrength" },
	activeInnerBloomBlur: { target: caseStudyArcConfig, key: "activeInnerBloomBlur" },
	activeInnerBloomStrength: { target: caseStudyArcConfig, key: "activeInnerBloomStrength" },
	activeLineWidth: { target: caseStudyArcConfig, key: "activeLineWidth" },
	trackWidth: { target: caseStudyArcInternals, key: "trackWidth" },
	nodeRadius: { target: caseStudyArcInternals, key: "nodeRadius" },
	nodeMidRadius: { target: caseStudyArcInternals, key: "nodeMidRadius" },
	nodeInnerRadius: { target: caseStudyArcInternals, key: "nodeInnerRadius" },
};

function shouldOpenArcDevFromUrl() {
	if (typeof window === "undefined") {
		return false;
	}
	return new URLSearchParams(window.location.search).get("arcDev") === "1";
}

function formatArcConfigForCopy() {
	const line = Object.entries(caseStudyArcActiveLineConfig)
		.map(([k, v]) => `\t${k}: ${typeof v === "number" ? formatConfigNumber(v) : JSON.stringify(v)},`)
		.join("\n");
	const cfg = [
		"trackOpacity",
		"activeOpacity",
		"activeColor",
		"nodeMidOpacity",
		"activeOuterBloomBlur",
		"activeOuterBloomStrength",
		"activeInnerBloomBlur",
		"activeInnerBloomStrength",
		"activeLineWidth",
	].map((k) => {
		const v = caseStudyArcConfig[k];
		return `\t${k}: ${typeof v === "number" ? formatConfigNumber(v) : JSON.stringify(v)},`;
	}).join("\n");
	const internal = [
		"trackWidth",
		"nodeRadius",
		"nodeMidRadius",
		"nodeInnerRadius",
	].map((k) => `\t${k}: ${formatConfigNumber(caseStudyArcInternals[k])},`).join("\n");

	return [
		"// caseStudyArcActiveLineConfig.js",
		`export const caseStudyArcActiveLineConfig = {\n${line}\n};\n`,
		"// caseStudyArcConfig.js (glow / opacity slice)",
		`{\n${cfg}\n}\n`,
		"// caseStudyArcInternals.js (geometry slice)",
		`{\n${internal}\n}\n`,
	].join("\n");
}

/**
 * DEV panel — tune case right-arc track / nodes / glow live.
 * Hotkey: 7 · URL: ?arcDev=1
 */
export class CaseStudyArcDevTools {
	constructor() {
		if (!import.meta.env.DEV) {
			return;
		}

		this.enabled = false;
		this._hotkey = HOTKEY;
		this._detachPanelDrag = null;
		this._statusEl = null;
		this._fields = new Map();

		injectSceneDevToolsStyles();
		this._panel = document.createElement("div");
		this._panel.className = "sceneDevTools caseArcDevTools hidden";
		this._panel.innerHTML = `
			<div class="devPanelDragHandle">
				<p class="title">Case Arc glow</p>
			</div>
			<p class="legend">Right-arc track / nodes / bloom · hotkey <b>${HOTKEY}</b> · ?arcDev=1</p>
			<p class="status" data-status></p>
			<section class="section">
				<p class="sectionTitle">Traveling glow (active line)</p>
				<div class="field" data-field="halfSpanDeg"><label>halfSpanDeg</label><input type="range" min="2" max="28" step="0.5" /><input type="number" step="0.5" /></div>
				<div class="field" data-field="bloomBlur"><label>bloomBlur</label><input type="range" min="0" max="18" step="0.1" /><input type="number" step="0.1" /></div>
				<div class="field" data-field="bloomStrength"><label>bloomStrength</label><input type="range" min="0" max="4" step="0.05" /><input type="number" step="0.05" /></div>
				<div class="field" data-field="opacityBoost"><label>opacityBoost</label><input type="range" min="0" max="0.4" step="0.005" /><input type="number" step="0.005" /></div>
			</section>
			<section class="section">
				<p class="sectionTitle">Active node bloom</p>
				<div class="field" data-field="activeOuterBloomBlur"><label>outerBloomBlur</label><input type="range" min="0" max="16" step="0.1" /><input type="number" step="0.1" /></div>
				<div class="field" data-field="activeOuterBloomStrength"><label>outerBloomStrength</label><input type="range" min="0" max="5" step="0.05" /><input type="number" step="0.05" /></div>
				<div class="field" data-field="activeInnerBloomBlur"><label>innerBloomBlur</label><input type="range" min="0" max="16" step="0.1" /><input type="number" step="0.1" /></div>
				<div class="field" data-field="activeInnerBloomStrength"><label>innerBloomStrength</label><input type="range" min="0" max="5" step="0.05" /><input type="number" step="0.05" /></div>
				<div class="field" data-field="activeColor"><label>activeColor</label><input type="color" /><input type="text" /></div>
			</section>
			<section class="section">
				<p class="sectionTitle">Track / rings</p>
				<div class="field" data-field="trackWidth"><label>trackWidth</label><input type="range" min="0.25" max="3" step="0.05" /><input type="number" step="0.05" /></div>
				<div class="field" data-field="trackOpacity"><label>trackOpacity</label><input type="range" min="0.02" max="1" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-field="activeOpacity"><label>activeOpacity</label><input type="range" min="0.05" max="1" step="0.01" /><input type="number" step="0.01" /></div>
				<div class="field" data-field="activeLineWidth"><label>activeLineWidth</label><input type="range" min="0.25" max="3" step="0.05" /><input type="number" step="0.05" /></div>
				<div class="field" data-field="nodeRadius"><label>nodeRadius</label><input type="range" min="6" max="36" step="0.5" /><input type="number" step="0.5" /></div>
				<div class="field" data-field="nodeMidRadius"><label>nodeMidRadius</label><input type="range" min="1" max="20" step="0.5" /><input type="number" step="0.5" /></div>
				<div class="field" data-field="nodeInnerRadius"><label>nodeInnerRadius</label><input type="range" min="0.5" max="10" step="0.25" /><input type="number" step="0.25" /></div>
				<div class="field" data-field="nodeMidOpacity"><label>nodeMidOpacity</label><input type="range" min="0" max="1" step="0.01" /><input type="number" step="0.01" /></div>
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
		this._detachPanelDrag = attachDevPanelDrag(this._panel, { id: "caseStudyArc" });

		this._bindFields();
		this._panel.querySelector('[data-action="copy"]')?.addEventListener("click", () => this._copyConfig());
		this._panel.querySelector('[data-action="reset"]')?.addEventListener("click", () => this._reset());
		this._panel.querySelector('[data-action="close"]')?.addEventListener("click", () => this.setEnabled(false));

		registerDevPanelHotkey(this._hotkey, {
			label: "Case Arc",
			toggle: () => this.toggle(),
		});

		this._syncFieldsFromTune();
		this._setStatus(`Press ${HOTKEY} to toggle · ${formatDevPanelHotkeyHints()}`);
		if (this._hintsEl) {
			this._hintsEl.textContent = formatDevPanelHotkeyHints();
		}

		if (shouldOpenArcDevFromUrl()) {
			this.setEnabled(true);
		}
	}

	_bindFields() {
		for (const field of this._panel.querySelectorAll("[data-field]")) {
			const fieldKey = field.getAttribute("data-field");
			if (!fieldKey || !FIELD_MAP[fieldKey]) {
				continue;
			}
			const range = field.querySelector('input[type="range"]');
			const number = field.querySelector('input[type="number"]');
			const color = field.querySelector('input[type="color"]');
			const text = field.querySelector('input[type="text"]');
			this._fields.set(fieldKey, { range, number, color, text });

			const onNumeric = (value) => {
				const next = Number(value);
				if (!Number.isFinite(next)) {
					return;
				}
				const { target, key } = FIELD_MAP[fieldKey];
				target[key] = next;
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
				caseStudyArcConfig.activeColor = hex;
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
		for (const [fieldKey, refs] of this._fields) {
			const mapping = FIELD_MAP[fieldKey];
			if (!mapping) {
				continue;
			}
			const value = mapping.target[mapping.key];
			if (fieldKey === "activeColor") {
				const hex = String(value ?? "#00c2ff");
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
		markCaseStudyArcDirty();
		wakeCaseStudyAnimationFrame();
		this._setStatus("live");
	}

	async _copyConfig() {
		const text = formatArcConfigForCopy();
		try {
			await navigator.clipboard.writeText(text);
			this._setStatus("copied → clipboard");
		} catch {
			console.info("[caseArcDev]\n" + text);
			this._setStatus("copy failed — see console");
		}
	}

	_reset() {
		Object.assign(caseStudyArcActiveLineConfig, DEFAULT_LINE);
		Object.assign(caseStudyArcConfig, DEFAULT_CFG);
		Object.assign(caseStudyArcInternals, DEFAULT_INTERNAL);
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
