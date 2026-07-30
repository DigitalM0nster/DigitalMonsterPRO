import { attachDevPanelDrag } from "./devPanelDrag.js";
import { formatDevPanelHotkeyHints, registerDevPanelHotkey, unregisterDevPanelHotkey } from "./devPanelHotkeys.js";
import { injectSceneDevToolsStyles, shouldOpenHubDevFromUrl } from "./sceneDevPanelUtils.js";
import { portfolioHubLights, portfolioHubPlatesConfig } from "../scenes/portfolio/hub/portfolioHubConfig.js";

const HOTKEY = "5";
const LIGHT_DEFAULTS = JSON.parse(JSON.stringify(portfolioHubLights));
const MATERIAL_DEFAULTS = JSON.parse(JSON.stringify(portfolioHubPlatesConfig.material));
const PLATE_SPACING_DEFAULTS = {
	rowGap: portfolioHubPlatesConfig.rowGap,
	depthGap: portfolioHubPlatesConfig.depthGap,
};

function getLightOptions() {
	return [
		...portfolioHubLights.directionals.map((light) => ({ kind: "directional", light })),
		...portfolioHubLights.rectAreas.map((light) => ({ kind: "rectArea", light })),
	];
}

function getLightOptionKey(kind, light) {
	return `${kind}:${light.id}`;
}

function formatLightsForCopy() {
	return `export const portfolioHubLights = ${JSON.stringify(portfolioHubLights, null, "\t")};\n`;
}

function formatMaterialForCopy() {
	return `material: ${JSON.stringify(portfolioHubPlatesConfig.material, null, "\t")},\n`;
}

function formatPlateSpacingForCopy() {
	return `rowGap: ${portfolioHubPlatesConfig.rowGap},\ndepthGap: ${portfolioHubPlatesConfig.depthGap},\n`;
}

function formatVector(values = []) {
	return values.map((value) => Number(value).toFixed(3)).join(", ");
}

export class PortfolioCameraDevTools {
	constructor(options = {}) {
		if (!import.meta.env.DEV) {
			return;
		}

		this.getScene = options.getScene ?? (() => null);
		this.getCamera = options.getCamera ?? (() => null);
		this.enabled = false;
		this._lastReadoutAt = 0;
		this._detachPanelDrag = null;
		this._selectedLightKey = getLightOptions()[0] ? getLightOptionKey(getLightOptions()[0].kind, getLightOptions()[0].light) : "";
		this._lightFields = new Map();
		this._materialFields = new Map();
		this._plateSpacingFields = new Map();

		injectSceneDevToolsStyles();
		this._panel = document.createElement("div");
		this._panel.className = "sceneDevTools portfolioCameraDevTools hidden";
		this._panel.dataset.canvasPointerBlocker = "true";
		this._panel.innerHTML = `
			<div class="devPanelDragHandle"><p class="title">Portfolio Camera + Lights</p></div>
			<p class="legend">
				Hotkey <b>${HOTKEY}</b> · WASD move · Space up · Alt down · Q/E roll · Shift faster.<br/>
				Enable control, then click the WebGL canvas to capture the mouse. Escape releases it. C copies the pose.
			</p>
			<p class="status" data-status>control disabled</p>
			<section class="section">
				<p class="readout"><span class="k">position</span><span class="v" data-position>—</span></p>
				<p class="readout"><span class="k">rotation ° (X/Y/Z)</span><span class="v" data-rotation>—</span></p>
				<p class="readout"><span class="k">look direction</span><span class="v" data-direction>—</span></p>
				<p class="readout"><span class="k">fov</span><span class="v" data-fov>—</span></p>
			</section>
			<section class="section">
				<div class="actions">
					<button type="button" data-action="control">Enable control</button>
					<button type="button" data-action="copy">Copy camera (C)</button>
					<button type="button" data-action="reset">Reset</button>
				</div>
			</section>
			<section class="section">
				<p class="sectionTitle">Scene light</p>
				<div class="field">
					<label>source</label>
					<select data-light-select>
						${getLightOptions().map(({ kind, light }) => `<option value="${getLightOptionKey(kind, light)}">${kind === "directional" ? "Directional" : "Rect area"} / ${light.id}</option>`).join("")}
					</select>
				</div>
				<label class="checkRow"><input type="checkbox" data-light-helpers checked /> Show light helpers in scene</label>
				<div class="field" data-light-field="color"><label>color</label><input type="color" /><input type="text" /></div>
				<div class="field" data-light-field="intensity"><label>intensity</label><input type="range" min="0" max="50" step="0.05" /><input type="number" min="0" step="0.05" /></div>
				<div class="field" data-light-field="position" data-axis="0"><label>position X</label><input type="range" min="-50" max="50" step="0.1" /><input type="number" step="0.1" /></div>
				<div class="field" data-light-field="position" data-axis="1"><label>position Y</label><input type="range" min="-50" max="50" step="0.1" /><input type="number" step="0.1" /></div>
				<div class="field" data-light-field="position" data-axis="2"><label>position Z</label><input type="range" min="-50" max="50" step="0.1" /><input type="number" step="0.1" /></div>
				<div data-light-kind="directional">
					<div class="field" data-light-field="target" data-axis="0"><label>target X</label><input type="range" min="-50" max="50" step="0.1" /><input type="number" step="0.1" /></div>
					<div class="field" data-light-field="target" data-axis="1"><label>target Y</label><input type="range" min="-50" max="50" step="0.1" /><input type="number" step="0.1" /></div>
					<div class="field" data-light-field="target" data-axis="2"><label>target Z</label><input type="range" min="-50" max="50" step="0.1" /><input type="number" step="0.1" /></div>
				</div>
				<div data-light-kind="rectArea">
					<div class="field" data-light-field="rotation" data-axis="0"><label>rotation X deg</label><input type="range" min="-180" max="180" step="1" /><input type="number" step="1" /></div>
					<div class="field" data-light-field="rotation" data-axis="1"><label>rotation Y deg</label><input type="range" min="-180" max="180" step="1" /><input type="number" step="1" /></div>
					<div class="field" data-light-field="rotation" data-axis="2"><label>rotation Z deg</label><input type="range" min="-180" max="180" step="1" /><input type="number" step="1" /></div>
					<div class="field" data-light-field="width"><label>width</label><input type="range" min="0.1" max="50" step="0.1" /><input type="number" min="0.1" step="0.1" /></div>
					<div class="field" data-light-field="height"><label>height</label><input type="range" min="0.1" max="50" step="0.1" /><input type="number" min="0.1" step="0.1" /></div>
				</div>
				<div class="actions">
					<button type="button" data-action="copy-light">Copy light config</button>
					<button type="button" data-action="reset-lights">Reset lights</button>
				</div>
			</section>
			<section class="section">
				<p class="sectionTitle">Plate spacing</p>
				<p class="legend">Gap is measured between plate edges, not between their centres.</p>
				<div class="field" data-plate-spacing-field="rowGap"><label>vertical gap (Y)</label><input type="range" min="0" max="5" step="0.01" /><input type="number" min="0" max="5" step="0.01" /></div>
				<div class="field" data-plate-spacing-field="depthGap"><label>depth gap (Z)</label><input type="range" min="0" max="12" step="0.05" /><input type="number" min="0" max="12" step="0.05" /></div>
				<div class="actions">
					<button type="button" data-action="copy-plate-spacing">Copy spacing</button>
					<button type="button" data-action="reset-plate-spacing">Reset spacing</button>
				</div>
			</section>
			<section class="section">
				<p class="sectionTitle">Plate material</p>
				<p class="legend">Project plates and background decor can use different material classes. Physical-only values are stored even when another class is selected.</p>
				<div class="field"><label>project type</label><select data-material-type="type"><option value="basic">basic</option><option value="standard">standard</option><option value="physical">physical</option></select></div>
				<div class="field"><label>decor type</label><select data-material-type="decorType"><option value="basic">basic</option><option value="standard">standard</option><option value="physical">physical</option></select></div>
				<div class="field" data-material-field="color"><label>color</label><input type="color" /><input type="text" /></div>
				<div class="field" data-material-field="opacity"><label>opacity</label><input type="range" min="0" max="1" step="0.01" /><input type="number" min="0" max="1" step="0.01" /></div>
				<div class="field" data-material-field="roughness"><label>roughness</label><input type="range" min="0" max="1" step="0.01" /><input type="number" min="0" max="1" step="0.01" /></div>
				<div class="field" data-material-field="metalness"><label>metalness</label><input type="range" min="0" max="1" step="0.01" /><input type="number" min="0" max="1" step="0.01" /></div>
				<div class="field" data-material-field="transmission"><label>transmission</label><input type="range" min="0" max="1" step="0.01" /><input type="number" min="0" max="1" step="0.01" /></div>
				<div class="field" data-material-field="thickness"><label>thickness</label><input type="range" min="0" max="5" step="0.01" /><input type="number" min="0" max="5" step="0.01" /></div>
				<div class="field" data-material-field="clearcoat"><label>clearcoat</label><input type="range" min="0" max="1" step="0.01" /><input type="number" min="0" max="1" step="0.01" /></div>
				<div class="field" data-material-field="clearcoatRoughness"><label>coat roughness</label><input type="range" min="0" max="1" step="0.01" /><input type="number" min="0" max="1" step="0.01" /></div>
				<div class="field" data-material-field="ior"><label>ior</label><input type="range" min="1" max="2.333" step="0.01" /><input type="number" min="1" max="2.333" step="0.01" /></div>
				<div class="actions">
					<button type="button" data-action="copy-material">Copy material config</button>
					<button type="button" data-action="reset-material">Reset material</button>
				</div>
			</section>
			<section class="section"><div class="actions"><button type="button" data-action="close">Close</button></div></section>
			<footer class="legend" data-hints>${formatDevPanelHotkeyHints()}</footer>
		`;
		document.body.appendChild(this._panel);

		this._statusEl = this._panel.querySelector("[data-status]");
		this._positionEl = this._panel.querySelector("[data-position]");
		this._rotationEl = this._panel.querySelector("[data-rotation]");
		this._directionEl = this._panel.querySelector("[data-direction]");
		this._fovEl = this._panel.querySelector("[data-fov]");
		this._controlButton = this._panel.querySelector('[data-action="control"]');
		this._lightSelect = this._panel.querySelector("[data-light-select]");
		this._lightHelpersToggle = this._panel.querySelector("[data-light-helpers]");
		this._materialTypeSelects = this._panel.querySelectorAll("[data-material-type]");
		this._detachPanelDrag = attachDevPanelDrag(this._panel, { id: "portfolioCamera" });

		this._bindLightFields();
		this._bindMaterialFields();
		this._bindPlateSpacingFields();
		this._controlButton?.addEventListener("click", () => this._toggleControl());
		this._panel.querySelector('[data-action="copy"]')?.addEventListener("click", () => void this._copy());
		this._panel.querySelector('[data-action="reset"]')?.addEventListener("click", () => this._reset());
		this._panel.querySelector('[data-action="copy-light"]')?.addEventListener("click", () => void this._copyLights());
		this._panel.querySelector('[data-action="reset-lights"]')?.addEventListener("click", () => this._resetLights());
		this._panel.querySelector('[data-action="copy-material"]')?.addEventListener("click", () => void this._copyMaterial());
		this._panel.querySelector('[data-action="reset-material"]')?.addEventListener("click", () => this._resetMaterial());
		this._panel.querySelector('[data-action="copy-plate-spacing"]')?.addEventListener("click", () => void this._copyPlateSpacing());
		this._panel.querySelector('[data-action="reset-plate-spacing"]')?.addEventListener("click", () => this._resetPlateSpacing());
		this._panel.querySelector('[data-action="close"]')?.addEventListener("click", () => this.setEnabled(false));
		this._lightSelect?.addEventListener("change", () => {
			this._selectedLightKey = this._lightSelect.value;
			this._syncLightFields();
		});
		this._lightHelpersToggle?.addEventListener("change", () => this._setLightHelpersVisible(this._lightHelpersToggle.checked));
		for (const select of this._materialTypeSelects) {
			select.addEventListener("change", () => {
				portfolioHubPlatesConfig.material[select.dataset.materialType] = select.value;
				this._applyMaterial(true);
			});
		}
		registerDevPanelHotkey(HOTKEY, {
			label: "Portfolio Camera",
			toggle: () => this.toggle(),
		});

		if (shouldOpenHubDevFromUrl()) {
			this.setEnabled(true);
		}
	}

	_getSelectedLight() {
		return getLightOptions().find(({ kind, light }) => getLightOptionKey(kind, light) === this._selectedLightKey) ?? null;
	}

	_bindLightFields() {
		for (const field of this._panel.querySelectorAll("[data-light-field]")) {
			const property = field.dataset.lightField;
			const axis = field.dataset.axis === undefined ? null : Number(field.dataset.axis);
			const range = field.querySelector('input[type="range"]');
			const number = field.querySelector('input[type="number"]');
			const color = field.querySelector('input[type="color"]');
			const text = field.querySelector('input[type="text"]');
			const key = axis === null ? property : `${property}.${axis}`;
			this._lightFields.set(key, { property, axis, range, number, color, text });

			const onNumeric = (rawValue) => {
				const selected = this._getSelectedLight();
				const next = Number(rawValue);
				if (!selected || !Number.isFinite(next)) return;
				if (axis === null) selected.light[property] = next;
				else selected.light[property][axis] = next;
				if (range) range.value = String(next);
				if (number) number.value = String(next);
				this._applyLights();
			};
			range?.addEventListener("input", () => onNumeric(range.value));
			number?.addEventListener("input", () => onNumeric(number.value));

			const onColor = (rawValue) => {
				const selected = this._getSelectedLight();
				let hex = String(rawValue ?? "").trim();
				if (!hex.startsWith("#")) hex = `#${hex}`;
				if (!selected || !/^#[0-9a-f]{6}$/i.test(hex)) return;
				selected.light.color = hex;
				if (color) color.value = hex;
				if (text) text.value = hex;
				this._applyLights();
			};
			color?.addEventListener("input", () => onColor(color.value));
			text?.addEventListener("change", () => onColor(text.value));
		}
		this._syncLightFields();
	}

	_syncLightFields() {
		const selected = this._getSelectedLight();
		if (!selected) return;
		if (this._lightSelect) this._lightSelect.value = this._selectedLightKey;
		for (const group of this._panel.querySelectorAll("[data-light-kind]")) {
			group.hidden = group.dataset.lightKind !== selected.kind;
		}
		for (const refs of this._lightFields.values()) {
			const value = refs.axis === null ? selected.light[refs.property] : selected.light[refs.property]?.[refs.axis];
			if (typeof value === "number") {
				if (refs.range) refs.range.value = String(value);
				if (refs.number) refs.number.value = String(value);
			} else if (refs.property === "color") {
				if (refs.color) refs.color.value = value;
				if (refs.text) refs.text.value = value;
			}
		}
	}

	_applyLights() {
		this.getScene()?.applyLightsFromDev?.();
		this._setStatus(`light ${this._getSelectedLight()?.light.id ?? ""} updated`);
	}

	_setLightHelpersVisible(visible) {
		this.getScene()?.setDevLightHelpersVisible?.(visible);
		if (this._lightHelpersToggle) this._lightHelpersToggle.checked = visible;
	}

	async _copyLights() {
		const text = formatLightsForCopy();
		try {
			await navigator.clipboard.writeText(text);
			this._setStatus("light config copied to clipboard");
		} catch {
			console.info("[portfolioLights]\n" + text);
			this._setStatus("copy failed - config printed to console");
		}
	}

	_resetLights() {
		portfolioHubLights.ambient = JSON.parse(JSON.stringify(LIGHT_DEFAULTS.ambient));
		portfolioHubLights.directionals.splice(0, portfolioHubLights.directionals.length, ...JSON.parse(JSON.stringify(LIGHT_DEFAULTS.directionals)));
		portfolioHubLights.rectAreas.splice(0, portfolioHubLights.rectAreas.length, ...JSON.parse(JSON.stringify(LIGHT_DEFAULTS.rectAreas)));
		this._selectedLightKey = getLightOptions()[0] ? getLightOptionKey(getLightOptions()[0].kind, getLightOptions()[0].light) : "";
		this._syncLightFields();
		this._applyLights();
		this._setStatus("lights reset to portfolio config");
	}

	_bindMaterialFields() {
		for (const field of this._panel.querySelectorAll("[data-material-field]")) {
			const property = field.dataset.materialField;
			const range = field.querySelector('input[type="range"]');
			const number = field.querySelector('input[type="number"]');
			const color = field.querySelector('input[type="color"]');
			const text = field.querySelector('input[type="text"]');
			this._materialFields.set(property, { range, number, color, text });

			const onNumeric = (rawValue) => {
				const next = Number(rawValue);
				if (!Number.isFinite(next)) return;
				portfolioHubPlatesConfig.material[property] = next;
				if (range) range.value = String(next);
				if (number) number.value = String(next);
				this._applyMaterial();
			};
			range?.addEventListener("input", () => onNumeric(range.value));
			number?.addEventListener("input", () => onNumeric(number.value));

			const onColor = (rawValue) => {
				let hex = String(rawValue ?? "").trim();
				if (!hex.startsWith("#")) hex = `#${hex}`;
				if (!/^#[0-9a-f]{6}$/i.test(hex)) return;
				portfolioHubPlatesConfig.material.color = hex;
				if (color) color.value = hex;
				if (text) text.value = hex;
				this._applyMaterial();
			};
			color?.addEventListener("input", () => onColor(color.value));
			text?.addEventListener("change", () => onColor(text.value));
		}
		this._syncMaterialFields();
	}

	_syncMaterialFields() {
		const material = portfolioHubPlatesConfig.material;
		for (const select of this._materialTypeSelects ?? []) {
			select.value = material[select.dataset.materialType];
		}
		for (const [property, refs] of this._materialFields) {
			const value = material[property];
			if (typeof value === "number") {
				if (refs.range) refs.range.value = String(value);
				if (refs.number) refs.number.value = String(value);
			} else if (property === "color") {
				if (refs.color) refs.color.value = value;
				if (refs.text) refs.text.value = value;
			}
		}
	}

	_applyMaterial(recreate = false) {
		this.getScene()?.applyPlateMaterialFromDev?.({ recreate });
		this._setStatus(recreate ? "plate material class updated" : "plate material updated");
	}

	async _copyMaterial() {
		const text = formatMaterialForCopy();
		try {
			await navigator.clipboard.writeText(text);
			this._setStatus("material config copied to clipboard");
		} catch {
			console.info("[portfolioMaterial]\n" + text);
			this._setStatus("copy failed - material printed to console");
		}
	}

	_resetMaterial() {
		const material = portfolioHubPlatesConfig.material;
		for (const key of Object.keys(material)) delete material[key];
		Object.assign(material, JSON.parse(JSON.stringify(MATERIAL_DEFAULTS)));
		this._syncMaterialFields();
		this._applyMaterial(true);
		this._setStatus("material reset to portfolio config");
	}

	_bindPlateSpacingFields() {
		for (const field of this._panel.querySelectorAll("[data-plate-spacing-field]")) {
			const property = field.dataset.plateSpacingField;
			const range = field.querySelector('input[type="range"]');
			const number = field.querySelector('input[type="number"]');
			this._plateSpacingFields.set(property, { range, number });

			const onNumeric = (rawValue) => {
				const next = Math.max(0, Number(rawValue));
				if (!Number.isFinite(next)) return;
				portfolioHubPlatesConfig[property] = next;
				if (range) range.value = String(next);
				if (number) number.value = String(next);
				this._applyPlateSpacing();
			};

			range?.addEventListener("input", () => onNumeric(range.value));
			number?.addEventListener("input", () => onNumeric(number.value));
		}
		this._syncPlateSpacingFields();
	}

	_syncPlateSpacingFields() {
		for (const [property, refs] of this._plateSpacingFields) {
			const value = portfolioHubPlatesConfig[property];
			if (refs.range) refs.range.value = String(value);
			if (refs.number) refs.number.value = String(value);
		}
	}

	_applyPlateSpacing() {
		this.getScene()?.applyPlateSpacingFromDev?.();
		this._setStatus(`spacing updated · Y ${portfolioHubPlatesConfig.rowGap} · Z ${portfolioHubPlatesConfig.depthGap}`);
	}

	async _copyPlateSpacing() {
		const text = formatPlateSpacingForCopy();
		try {
			await navigator.clipboard.writeText(text);
			this._setStatus("plate spacing copied to clipboard");
		} catch {
			console.info("[portfolioPlateSpacing]\n" + text);
			this._setStatus("copy failed - spacing printed to console");
		}
	}

	_resetPlateSpacing() {
		Object.assign(portfolioHubPlatesConfig, PLATE_SPACING_DEFAULTS);
		this._syncPlateSpacingFields();
		this._applyPlateSpacing();
		this._setStatus("plate spacing reset to portfolio config");
	}

	_setStatus(message) {
		if (this._statusEl) {
			this._statusEl.textContent = message;
		}
	}

	_syncControlButton() {
		const active = this.getScene()?.isFreeCameraEnabled?.() === true;
		if (this._controlButton) {
			this._controlButton.textContent = active ? "Disable control" : "Enable control";
			this._controlButton.classList.toggle("active", active);
		}
	}

	_toggleControl() {
		const scene = this.getScene();
		const camera = this.getCamera();
		if (!scene || !camera) {
			this._setStatus("portfolio scene is not ready");
			return;
		}
		const next = !scene.isFreeCameraEnabled?.();
		const active = scene.setFreeCameraEnabled?.(next, camera) === true;
		this._syncControlButton();
		this._setStatus(
			next && !active
				? "open /portfolio before enabling camera"
				: active
					? "control enabled · click canvas for mouse look"
					: "control disabled",
		);
	}

	async _copy() {
		const scene = this.getScene();
		const camera = this.getCamera();
		if (!scene?.isFreeCameraEnabled?.()) {
			this._setStatus("enable camera control first");
			return;
		}
		const copied = await scene.copyFreeCameraSnapshot?.(camera);
		this._setStatus(copied ? "camera copied → clipboard" : "copy failed · pose printed to console");
	}

	_reset() {
		const scene = this.getScene();
		const camera = this.getCamera();
		scene?.resetFreeCamera?.(camera);
		this._setStatus("camera reset to portfolio config");
		this.update(true);
	}

	update(force = false) {
		if (!this.enabled) {
			return;
		}
		const now = performance.now();
		if (!force && now - this._lastReadoutAt < 100) {
			return;
		}
		this._lastReadoutAt = now;
		const snapshot = this.getScene()?.getFreeCameraSnapshot?.(this.getCamera());
		if (!snapshot) {
			return;
		}
		if (this._positionEl) this._positionEl.textContent = formatVector(snapshot.position);
		if (this._rotationEl) this._rotationEl.textContent = formatVector(snapshot.rotationDeg);
		if (this._directionEl) this._directionEl.textContent = formatVector(snapshot.lookDirection);
		if (this._fovEl) this._fovEl.textContent = Number(snapshot.fov).toFixed(2);
		this._syncControlButton();
	}

	toggle() {
		this.setEnabled(!this.enabled);
	}

	setEnabled(enabled) {
		if (!import.meta.env.DEV || this.enabled === enabled) {
			return;
		}
		this.enabled = enabled;
		this._panel?.classList.toggle("hidden", !enabled);
		if (enabled) {
			this._syncLightFields();
			this._syncMaterialFields();
			this._syncPlateSpacingFields();
			this._setLightHelpersVisible(true);
			this.update(true);
			this._setStatus(this.getScene()?.isFreeCameraEnabled?.() ? "control enabled" : "control disabled");
			return;
		}
		this.getScene()?.setFreeCameraEnabled?.(false, this.getCamera());
		this._setLightHelpersVisible(false);
		this._syncControlButton();
	}

	dispose() {
		if (!import.meta.env.DEV) {
			return;
		}
		this.getScene()?.setFreeCameraEnabled?.(false, this.getCamera());
		this.getScene()?.setDevLightHelpersVisible?.(false);
		unregisterDevPanelHotkey(HOTKEY);
		this._detachPanelDrag?.();
		this._detachPanelDrag = null;
		this._panel?.remove();
		this._panel = null;
	}
}
