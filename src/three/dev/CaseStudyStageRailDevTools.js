import { formatConfigNumber, injectSceneDevToolsStyles } from "./sceneDevPanelUtils.js";
import { formatDevPanelHotkeyHints, registerDevPanelHotkey, unregisterDevPanelHotkey } from "./devPanelHotkeys.js";
import { attachDevPanelDrag } from "./devPanelDrag.js";
import {
	caseStudyStageRailConfig,
	resetCaseStudyStageRailConfig,
	shouldOpenStageRailDevFromUrl,
} from "@/portfolio/ui/CaseStudyCanvas/caseStudyStageRailConfig.js";
import {
	markCaseStudyChromeStageDirty,
	wakeCaseStudyAnimationFrame,
} from "@/portfolio/core/caseStudyAnimationFrame.js";

const HOTKEY = "9";

/** @type {Array<{ key: keyof typeof caseStudyStageRailConfig, min: number, max: number, step: number, section: string, label?: string }>} */
const FIELDS = [
	{ key: "progressAlpha", min: 0.05, max: 1, step: 0.01, section: "Track opacity" },
	{ key: "futureAlpha", min: 0.02, max: 1, step: 0.01, section: "Track opacity" },
	{ key: "linkAlpha", min: 0.02, max: 1, step: 0.01, section: "Track opacity" },
	{ key: "trackWidthMul", min: 0.5, max: 4, step: 0.05, section: "Geometry" },
	{ key: "trackWidthMin", min: 0.5, max: 3, step: 0.05, section: "Geometry" },
	{ key: "nodeScale", min: 0.25, max: 0.9, step: 0.01, section: "Geometry" },
	{ key: "quietVeilExtra", min: 0, max: 6, step: 0.1, section: "Quiet line" },
	{ key: "quietVeilAlphaMul", min: 0, max: 0.8, step: 0.01, section: "Quiet line" },
	{ key: "lineBloomBlur", min: 0, max: 12, step: 0.1, section: "Active line glow", label: "bloomBlur" },
	{ key: "lineBloomStrength", min: 0, max: 3.5, step: 0.05, section: "Active line glow", label: "bloomStrength" },
	{ key: "nodeIdleAlpha", min: 0.05, max: 1, step: 0.01, section: "Nodes" },
	{ key: "nodeMidAlpha", min: 0.05, max: 1, step: 0.01, section: "Nodes" },
	{ key: "nodePastAlpha", min: 0, max: 1, step: 0.01, section: "Nodes" },
	{ key: "nodeRingVeilAlpha", min: 0, max: 1, step: 0.01, section: "Nodes", label: "ringVeilAlpha" },
	{ key: "nodeRingVeilExtra", min: 0, max: 6, step: 0.1, section: "Nodes", label: "ringVeilExtra" },
	{ key: "nodeOuterHlAlpha0", min: 0, max: 1, step: 0.01, section: "Nodes", label: "outerHl0" },
	{ key: "nodeOuterHlAlpha1", min: 0, max: 1, step: 0.01, section: "Nodes", label: "outerHl1" },
	{ key: "nodeInnerHotAlpha", min: 0.2, max: 1, step: 0.01, section: "Nodes", label: "innerHot" },
	{ key: "nodeCaptureSpanMul", min: 0.6, max: 2.5, step: 0.05, section: "Capture", label: "spanMul" },
	{ key: "nodeCaptureFalloff", min: 0.5, max: 8, step: 0.1, section: "Capture", label: "falloff" },
];

function formatRailConfigForCopy() {
	const lines = Object.entries(caseStudyStageRailConfig).map(([key, value]) => {
		if (typeof value === "number") {
			return `\t${key}: ${formatConfigNumber(value)},`;
		}
		return `\t${key}: ${JSON.stringify(value)},`;
	});
	return `export const caseStudyStageRailConfigDefaults = {\n${lines.join("\n")}\n};\n`;
}

function buildSectionsHtml() {
	/** @type {Map<string, typeof FIELDS>} */
	const bySection = new Map();
	for (const field of FIELDS) {
		const list = bySection.get(field.section) ?? [];
		list.push(field);
		bySection.set(field.section, list);
	}
	let html = "";
	for (const [section, fields] of bySection) {
		html += `<section class="section"><p class="sectionTitle">${section}</p>`;
		for (const field of fields) {
			const label = field.label ?? field.key;
			html += `<div class="field" data-field="${field.key}"><label>${label}</label>`
				+ `<input type="range" min="${field.min}" max="${field.max}" step="${field.step}" />`
				+ `<input type="number" step="${field.step}" /></div>`;
		}
		html += "</section>";
	}
	return html;
}

/**
 * DEV panel — tune left case stage-rail track / tip glow live.
 * Hotkey: 9 · URL: ?railDev=1
 */
export class CaseStudyStageRailDevTools {
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
		this._panel.className = "sceneDevTools caseStageRailDevTools hidden";
		this._panel.innerHTML = `
			<div class="devPanelDragHandle">
				<p class="title">Case Stage Rail</p>
			</div>
			<p class="legend">Left stage rail · glow on active line · hotkey <b>${HOTKEY}</b> · ?railDev=1</p>
			<p class="status" data-status></p>
			${buildSectionsHtml()}
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
		this._detachPanelDrag = attachDevPanelDrag(this._panel, { id: "caseStudyStageRail" });

		this._bindFields();
		this._panel.querySelector('[data-action="copy"]')?.addEventListener("click", () => this._copyConfig());
		this._panel.querySelector('[data-action="reset"]')?.addEventListener("click", () => this._reset());
		this._panel.querySelector('[data-action="close"]')?.addEventListener("click", () => this.setEnabled(false));

		registerDevPanelHotkey(this._hotkey, {
			label: "Stage Rail",
			toggle: () => this.toggle(),
		});

		this._syncFieldsFromTune();
		this._setStatus(`Press ${HOTKEY} to toggle · ${formatDevPanelHotkeyHints()}`);
		if (this._hintsEl) {
			this._hintsEl.textContent = formatDevPanelHotkeyHints();
		}

		if (shouldOpenStageRailDevFromUrl()) {
			this.setEnabled(true);
		}
	}

	_bindFields() {
		for (const field of this._panel.querySelectorAll("[data-field]")) {
			const fieldKey = field.getAttribute("data-field");
			if (!fieldKey || !(fieldKey in caseStudyStageRailConfig)) {
				continue;
			}
			const range = field.querySelector('input[type="range"]');
			const number = field.querySelector('input[type="number"]');
			this._fields.set(fieldKey, { range, number });

			const onNumeric = (value) => {
				const next = Number(value);
				if (!Number.isFinite(next)) {
					return;
				}
				caseStudyStageRailConfig[fieldKey] = next;
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
		}
	}

	_syncFieldsFromTune() {
		for (const [fieldKey, refs] of this._fields) {
			const value = caseStudyStageRailConfig[fieldKey];
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
		markCaseStudyChromeStageDirty();
		wakeCaseStudyAnimationFrame();
		this._setStatus("live");
	}

	async _copyConfig() {
		const text = formatRailConfigForCopy();
		try {
			await navigator.clipboard.writeText(text);
			this._setStatus("copied → clipboard");
		} catch {
			console.info("[caseStageRailDev]\n" + text);
			this._setStatus("copy failed — see console");
		}
	}

	_reset() {
		resetCaseStudyStageRailConfig();
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
