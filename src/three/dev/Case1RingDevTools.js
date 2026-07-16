import { case1RingConfig, cloneCase1RingConfig } from "../scenes/portfolio/case1/case1RingConfig.js";
import { formatConfigNumber, injectSceneDevToolsStyles, shouldOpenCase1DevFromUrl } from "./sceneDevPanelUtils.js";
import { formatDevPanelHotkeyHints, registerDevPanelHotkey, unregisterDevPanelHotkey } from "./devPanelHotkeys.js";
import { attachDevPanelDrag } from "./devPanelDrag.js";

const FIELD_SECTIONS = [
	{
		title: "Сборка",
		fields: [
			{ key: "scale", label: "scale", min: 0.005, max: 1.5, step: 0.005 },
			{ key: "tiltX", label: "tiltX (рад)", min: -Math.PI, max: Math.PI, step: 0.01 },
			{ key: "tiltY", label: "tiltY (рад)", min: -Math.PI, max: Math.PI, step: 0.01 },
			{ key: "tiltZ", label: "tiltZ (рад)", min: -Math.PI, max: Math.PI, step: 0.01 },
			{ key: "pointerTilt", label: "pointerTilt", min: 0, max: 1, step: 0.01 },
		],
	},
	{
		title: "Кручение",
		fields: [
			{ key: "speedR1", label: "speed R1", min: -3, max: 3, step: 0.01 },
			{ key: "speedR2", label: "speed R2", min: -3, max: 3, step: 0.01 },
			{ key: "speedR3", label: "speed R3", min: -3, max: 3, step: 0.01 },
			{ key: "pointerSpinMul", label: "pointerSpinMul", min: 0, max: 6, step: 0.05 },
		],
	},
	{
		title: "R1 — яркий белый",
		fields: [
			{ key: "r1R", label: "R", min: 0, max: 8, step: 0.05 },
			{ key: "r1G", label: "G", min: 0, max: 8, step: 0.05 },
			{ key: "r1B", label: "B", min: 0, max: 8, step: 0.05 },
			{ key: "r1Opacity", label: "opacity", min: 0, max: 1, step: 0.01 },
			{ key: "r1CoreMix", label: "coreMix", min: 0, max: 1, step: 0.01 },
			{ key: "r1BloomBoost", label: "bloomBoost", min: 0.5, max: 3, step: 0.01 },
			{ key: "r1FadeNear", label: "fadeNear", min: 0, max: 4, step: 0.01 },
			{ key: "r1FadeFar", label: "fadeFar", min: 0, max: 2, step: 0.01 },
		],
	},
	{
		title: "R2 — мягкий белый",
		fields: [
			{ key: "r2R", label: "R", min: 0, max: 8, step: 0.05 },
			{ key: "r2G", label: "G", min: 0, max: 8, step: 0.05 },
			{ key: "r2B", label: "B", min: 0, max: 8, step: 0.05 },
			{ key: "r2Opacity", label: "opacity", min: 0, max: 1, step: 0.01 },
			{ key: "r2CoreMix", label: "coreMix", min: 0, max: 1, step: 0.01 },
			{ key: "r2BloomBoost", label: "bloomBoost", min: 0.5, max: 3, step: 0.01 },
			{ key: "r2FadeNear", label: "fadeNear", min: 0, max: 4, step: 0.01 },
			{ key: "r2FadeFar", label: "fadeFar", min: 0, max: 2, step: 0.01 },
		],
	},
	{
		title: "R3 — синий + затухание",
		fields: [
			{ key: "r3R", label: "R", min: 0, max: 6, step: 0.05 },
			{ key: "r3G", label: "G", min: 0, max: 6, step: 0.05 },
			{ key: "r3B", label: "B", min: 0, max: 6, step: 0.05 },
			{ key: "r3Opacity", label: "opacity", min: 0, max: 1, step: 0.01 },
			{ key: "r3CoreR", label: "core R", min: 0, max: 6, step: 0.05 },
			{ key: "r3CoreG", label: "core G", min: 0, max: 6, step: 0.05 },
			{ key: "r3CoreB", label: "core B", min: 0, max: 6, step: 0.05 },
			{ key: "r3CoreMix", label: "coreMix", min: 0, max: 1, step: 0.01 },
			{ key: "r3BloomBoost", label: "bloomBoost", min: 0.5, max: 3, step: 0.01 },
			{ key: "r3FadeNear", label: "fadeNear", min: 0, max: 4, step: 0.01 },
			{ key: "r3FadeFar", label: "fadeFar (концы)", min: 0, max: 2, step: 0.01 },
		],
	},
	{
		title: "Глубина (общая)",
		fields: [
			{ key: "depthNear", label: "depthNear", min: 0.5, max: 30, step: 0.1 },
			{ key: "depthFar", label: "depthFar", min: 1, max: 40, step: 0.1 },
			{ key: "depthPower", label: "depthPower", min: 0.2, max: 4, step: 0.05 },
		],
	},
];

const NUMERIC_FIELDS = FIELD_SECTIONS.flatMap((section) => section.fields);

const SPIN_AXIS_OPTIONS = [
	{ value: "x", label: "X" },
	{ value: "y", label: "Y" },
	{ value: "z", label: "Z" },
];

function injectCase1RingDevStyles() {
	if (document.querySelector('style[data-case1-ring-dev="v6"]')) {
		return;
	}
	document.querySelector("style[data-case1-ring-dev]")?.remove();

	const style = document.createElement("style");
	style.dataset.case1RingDev = "v6";
	style.textContent = `
		.sceneDevTools.case1RingDevTools {
			left: auto;
			right: 16px;
			bottom: 16px;
			top: auto;
			width: min(380px, calc(100vw - 24px));
			max-height: min(86vh, 920px);
			overflow: hidden;
			padding-bottom: 10px;
		}
		/* Глобальный div{display:flex} иначе ставит legend и поля в один ряд. */
		.sceneDevTools.case1RingDevTools .case1RingDevBody {
			display: flex !important;
			flex-direction: column;
			align-items: stretch;
			flex: 1 1 auto;
			min-height: 0;
			overflow-x: hidden;
			overflow-y: auto;
			overscroll-behavior: contain;
			-webkit-overflow-scrolling: touch;
			padding-right: 2px;
			scrollbar-gutter: stable;
		}
		.sceneDevTools.case1RingDevTools .case1RingDevBody > * {
			flex: 0 0 auto;
			width: 100%;
			min-width: 0;
		}
		.sceneDevTools.case1RingDevTools .legend {
			display: block !important;
			box-sizing: border-box;
			width: 100%;
			white-space: normal;
		}
		.sceneDevTools.case1RingDevTools .case1RingDevBody::-webkit-scrollbar {
			width: 8px;
		}
		.sceneDevTools.case1RingDevTools .case1RingDevBody::-webkit-scrollbar-thumb {
			background: rgba(120, 170, 220, 0.45);
			border-radius: 8px;
		}
		.sceneDevTools.case1RingDevTools .axisRow {
			display: flex !important;
			flex-direction: row;
			gap: 8px;
			align-items: center;
			margin: 0 0 8px;
			width: 100%;
		}
		.sceneDevTools.case1RingDevTools .axisRow label {
			min-width: 72px;
			font: 11px/1.2 system-ui, sans-serif;
			color: #9ec8ff;
		}
		.sceneDevTools.case1RingDevTools select {
			flex: 1;
			background: #0b1524;
			color: #d7ebff;
			border: 1px solid #2a4d78;
			border-radius: 4px;
			padding: 4px 6px;
			font: 12px/1.2 system-ui, sans-serif;
		}
	`;
	document.head.appendChild(style);
}

/**
 * Dev-панель орбиты НИПИГАЗ (ring_test).
 * Клавиша 8 или ?case1Dev=1
 */
export class Case1RingDevTools {
	/**
	 * @param {{ applyRingConfig?: (config: typeof case1RingConfig) => void, getRingConfig?: () => typeof case1RingConfig } | null} scene
	 */
	constructor(scene) {
		this.scene = scene;
		this.enabled = false;
		this.panel = null;
		this.statusEl = null;
		this.axisSelect = null;
		this.numericInputs = new Map();
		this.baselineDefaults = cloneCase1RingConfig();
		this.config = cloneCase1RingConfig();
		this._hotkey = "8";
		this._detachPanelDrag = null;

		if (!import.meta.env.DEV) {
			return;
		}

		injectSceneDevToolsStyles();
		injectCase1RingDevStyles();
		this._createPanel();
		registerDevPanelHotkey(this._hotkey, {
			label: "Case1 Ring",
			toggle: () => this.setEnabled(!this.enabled),
		});

		if (shouldOpenCase1DevFromUrl()) {
			this.setEnabled(true);
		}
	}

	bindScene(scene) {
		this.scene = scene;
		if (scene?.getRingConfig) {
			this.config = cloneCase1RingConfig(scene.getRingConfig());
			this._syncInputsFromConfig();
		}
		this._apply();
	}

	_createPanel() {
		const panel = document.createElement("div");
		panel.className = "sceneDevTools case1RingDevTools hidden";
		panel.innerHTML = `
			<p class="title" data-dev-panel-handle>Case1 ring (dev)</p>
			<p class="status" data-role="status">8 — открыть/закрыть · ?case1Dev=1</p>
			<div class="case1RingDevBody">
				<p class="legend">ring_test · R1 bright white · R2 soft white · R3 blue fade</p>
				<div class="section">
					<p class="sectionTitle">Ось кручения</p>
					<div class="axisRow">
						<label>spinAxis</label>
						<select data-role="spinAxis">
							${SPIN_AXIS_OPTIONS.map((option) => `<option value="${option.value}">${option.label}</option>`).join("")}
						</select>
					</div>
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
				</div>
				<div class="section">
					<div class="actions">
						<button type="button" data-action="copyConfig">Скопировать</button>
						<button type="button" data-action="resetConfig">Сброс</button>
					</div>
				</div>
			</div>
		`;

		panel.querySelector('[data-action="copyConfig"]').addEventListener("click", () => this._copyConfig());
		panel.querySelector('[data-action="resetConfig"]').addEventListener("click", () => this._resetConfig());

		this.axisSelect = panel.querySelector('[data-role="spinAxis"]');
		this.axisSelect.addEventListener("change", () => {
			this.config.spinAxis = this.axisSelect.value;
			this._apply();
		});

		for (const field of NUMERIC_FIELDS) {
			this._bindNumericField(panel, field);
		}

		this.statusEl = panel.querySelector('[data-role="status"]');
		document.body.appendChild(panel);
		this.panel = panel;
		this._detachPanelDrag = attachDevPanelDrag(panel, { id: "case1Ring" });
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

		for (const [key, { range, number }] of this.numericInputs) {
			const value = this.config[key];
			range.value = String(value);
			number.value = String(value);
		}

		if (this.axisSelect) {
			this.axisSelect.value = this.config.spinAxis ?? "y";
		}
	}

	_apply() {
		Object.assign(case1RingConfig, cloneCase1RingConfig(this.config));
		this.scene?.applyRingConfig?.(this.config);
	}

	_copyConfig() {
		const payload = `export const case1RingConfig = ${JSON.stringify(this.config, null, "\t").replace(/"([^"]+)":/g, "$1:")};\n`;
		navigator.clipboard?.writeText(payload).then(
			() => this._setStatus("Скопировано → case1RingConfig.js"),
			() => this._setStatus("Не удалось скопировать"),
		);
	}

	_resetConfig() {
		this.config = cloneCase1RingConfig(this.baselineDefaults);
		this._syncInputsFromConfig();
		this._apply();
		this._setStatus("Сброс к case1RingConfig.js");
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
			this._setStatus(`8 — закрыть · ${formatDevPanelHotkeyHints()}`);
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
		this.scene = null;
	}
}
