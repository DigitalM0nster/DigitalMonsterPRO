import { attachDevPanelDrag } from "./devPanelDrag.js";
import { formatDevPanelHotkeyHints, registerDevPanelHotkey, unregisterDevPanelHotkey } from "./devPanelHotkeys.js";
import { injectSceneDevToolsStyles } from "./sceneDevPanelUtils.js";
import {
	getCityFogAmount,
	getCityFogEffectiveEnd,
} from "../scenes/capabilities/city/cityFogProfile.js";

const HOTKEY = "0";

function shouldOpenFromUrl() {
	const params = new URLSearchParams(window.location.search);
	return params.has("mmk1Dev") || params.has("cityDev");
}

function formatVector(values = []) {
	return values.map((value) => Number(value).toFixed(3)).join(", ");
}

export class Mmk1CameraDevTools {
	constructor(options = {}) {
		if (!import.meta.env.DEV) {
			return;
		}

		this.getScene = options.getScene ?? (() => null);
		this.getCamera = options.getCamera ?? (() => null);
		this.enabled = false;
		this._lastReadoutAt = 0;
		this._detachPanelDrag = null;

		injectSceneDevToolsStyles();
		this._panel = document.createElement("div");
		this._panel.className = "sceneDevTools mmk1CameraDevTools hidden";
		this._panel.dataset.canvasPointerBlocker = "true";
		this._panel.innerHTML = `
			<div class="devPanelDragHandle"><p class="title">Capabilities / City</p></div>
			<p class="legend">
				Hotkey <b>${HOTKEY}</b> · ?cityDev=1 · WASD move · Space up · Alt down · Q/E roll · Shift faster.<br/>
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
				<p class="sectionTitle">Crane orientation</p>
				<div class="field">
					<label for="mmk1-crane-rotation-y">rotation Y (deg)</label>
					<input id="mmk1-crane-rotation-y" type="range" min="-360" max="360" step="0.1" data-crane-range />
					<input type="number" min="-360" max="360" step="0.1" data-crane-number />
				</div>
				<div class="actions">
					<button type="button" data-action="copy-crane">Copy crane Y</button>
					<button type="button" data-action="reset-crane">Reset crane</button>
				</div>
			</section>
			<section class="section">
				<p class="sectionTitle">Crane fake-lit material</p>
				<div class="field">
					<label for="mmk1-material-profile">camera profile</label>
					<select id="mmk1-material-profile" data-material-profile>
						<option value="overview">overview / first camera</option>
						<option value="close">close / hotspot cameras</option>
					</select>
				</div>
				<div class="field">
					<label>base color</label>
					<input type="color" data-material-key="baseColor" />
				</div>
				<div class="field">
					<label>rim color</label>
					<input type="color" data-material-key="rimColor" />
				</div>
				<div class="field">
					<label>rim strength</label>
					<input type="range" min="0" max="4" step="0.01" data-material-key="rimStrength" />
					<input type="number" min="0" max="4" step="0.01" data-material-key="rimStrength" />
				</div>
				<div class="field">
					<label>metalness</label>
					<input type="range" min="0" max="1" step="0.01" data-material-key="metalness" />
					<input type="number" min="0" max="1" step="0.01" data-material-key="metalness" />
				</div>
				<div class="field">
					<label>roughness</label>
					<input type="range" min="0" max="1" step="0.01" data-material-key="roughness" />
					<input type="number" min="0" max="1" step="0.01" data-material-key="roughness" />
				</div>
				<div class="field">
					<label>ambient floor</label>
					<input type="range" min="0" max="1.5" step="0.01" data-material-key="ambient" />
					<input type="number" min="0" max="1.5" step="0.01" data-material-key="ambient" />
				</div>
				<div class="field">
					<label>specular</label>
					<input type="range" min="0" max="2" step="0.01" data-material-key="specularStrength" />
					<input type="number" min="0" max="2" step="0.01" data-material-key="specularStrength" />
				</div>
				<div class="field">
					<label>surface variation</label>
					<input type="range" min="0" max="1" step="0.01" data-material-key="surfaceVariation" />
					<input type="number" min="0" max="1" step="0.01" data-material-key="surfaceVariation" />
				</div>
				<div class="field">
					<label>weathering</label>
					<input type="range" min="0" max="1" step="0.01" data-material-key="weathering" />
					<input type="number" min="0" max="1" step="0.01" data-material-key="weathering" />
				</div>
				<div class="field">
					<label>brushing</label>
					<input type="range" min="0" max="1" step="0.01" data-material-key="brushing" />
					<input type="number" min="0" max="1" step="0.01" data-material-key="brushing" />
				</div>
				<div class="actions">
					<button type="button" data-action="copy-material">Copy material</button>
					<button type="button" data-action="reset-material">Reset profile</button>
				</div>
			</section>
			<section class="section">
				<p class="sectionTitle">Hotspot circles</p>
				<div class="field">
					<label>line thickness</label>
					<input type="range" min="0.5" max="2.5" step="0.05" data-hotspot-thickness-range />
					<input type="number" min="0.5" max="2.5" step="0.05" data-hotspot-thickness-number />
				</div>
				<div class="actions">
					<button type="button" data-action="reset-hotspot-thickness">Reset thickness</button>
				</div>
			</section>
			<section class="section">
				<p class="sectionTitle">City windows</p>
				<div class="field">
					<label>glow intensity</label>
					<input type="range" min="0" max="6" step="0.01" data-city-window-key="intensity" />
					<input type="number" min="0" max="6" step="0.01" data-city-window-key="intensity" />
				</div>
				<div class="field">
					<label>fog density</label>
					<input type="range" min="0" max="0.25" step="0.001" data-city-window-key="fogDensity" />
					<input type="number" min="0" max="0.25" step="0.001" data-city-window-key="fogDensity" />
				</div>
				<div class="field">
					<label>fog color</label>
					<input type="color" data-city-window-key="fogColor" />
					<input type="text" data-city-window-key="fogColor" />
				</div>
				<div class="field">
					<label>fog start</label>
					<input type="range" min="0" max="80" step="0.1" data-city-window-key="fogNear" />
					<input type="number" min="0" max="80" step="0.1" data-city-window-key="fogNear" />
				</div>
				<div class="field">
					<label>fog curve</label>
					<input type="range" min="0.1" max="6" step="0.01" data-city-window-key="fogPower" />
					<input type="number" min="0.1" max="6" step="0.01" data-city-window-key="fogPower" />
				</div>
				<div class="field">
					<label>fog opacity</label>
					<input type="range" min="0" max="1" step="0.01" data-city-window-key="fogOpacity" />
					<input type="number" min="0" max="1" step="0.01" data-city-window-key="fogOpacity" />
				</div>
				<label class="fieldToggle">
					<input type="checkbox" data-city-fog-guides />
					Show START / curve slices / END directly in the 3D scene
				</label>
				<div class="fogProfile">
					<svg class="fogProfileChart" viewBox="0 0 360 176" role="img" aria-label="Fog amount over camera distance">
						<line class="fogProfileGrid" x1="34" y1="144" x2="348" y2="144" />
						<line class="fogProfileGrid" x1="34" y1="18" x2="34" y2="144" />
						<line class="fogProfileGrid" x1="34" y1="81" x2="348" y2="81" />
						<line class="fogProfileOpacity" x1="34" x2="348" data-fog-opacity-line />
						<path class="fogProfileArea" data-fog-area />
						<path class="fogProfileCurve" data-fog-curve />
						<line class="fogProfileMarker start" y1="18" y2="144" data-fog-start-line />
						<line class="fogProfileMarker end" y1="18" y2="144" data-fog-end-line />
						<text class="fogProfileLabel start" y="12" data-fog-start-label></text>
						<text class="fogProfileLabel end" y="25" data-fog-end-label></text>
						<text class="fogProfileLabel" x="34" y="158">0</text>
						<text class="fogProfileLabel" x="348" y="158" text-anchor="end" data-fog-axis-max></text>
						<text class="fogProfileLabel" x="31" y="22" text-anchor="end">100%</text>
						<text class="fogProfileLabel" x="31" y="84" text-anchor="end">50%</text>
					</svg>
					<p class="readout"><span class="k">visible span</span><span class="v" data-fog-visible-span>—</span></p>
					<p class="readout"><span class="k">curve meaning</span><span class="v" data-fog-curve-meaning>—</span></p>
					<p class="legend">Exponential fog has no hard end. The yellow marker is the effective end where it reaches 99% of its configured opacity.</p>
				</div>
				<div class="actions">
					<button type="button" data-action="copy-city-windows">Copy values</button>
					<button type="button" data-action="reset-city-windows">Reset windows</button>
				</div>
			</section>
			<section class="section">
				<div class="actions">
					<button type="button" data-action="control">Enable control</button>
					<button type="button" data-action="copy">Copy camera (C)</button>
					<button type="button" data-action="reset">Reset</button>
					<button type="button" data-action="close">Close</button>
				</div>
			</section>
			<footer class="legend" data-hints>${formatDevPanelHotkeyHints()}</footer>
		`;
		document.body.appendChild(this._panel);

		this._statusEl = this._panel.querySelector("[data-status]");
		this._positionEl = this._panel.querySelector("[data-position]");
		this._rotationEl = this._panel.querySelector("[data-rotation]");
		this._directionEl = this._panel.querySelector("[data-direction]");
		this._fovEl = this._panel.querySelector("[data-fov]");
		this._craneRange = this._panel.querySelector("[data-crane-range]");
		this._craneNumber = this._panel.querySelector("[data-crane-number]");
		this._materialProfile = this._panel.querySelector("[data-material-profile]");
		this._materialInputs = Array.from(this._panel.querySelectorAll("[data-material-key]"));
		this._hotspotThicknessRange = this._panel.querySelector("[data-hotspot-thickness-range]");
		this._hotspotThicknessNumber = this._panel.querySelector("[data-hotspot-thickness-number]");
		this._cityWindowInputs = Array.from(this._panel.querySelectorAll("[data-city-window-key]"));
		this._cityFogGuidesToggle = this._panel.querySelector("[data-city-fog-guides]");
		this._cityFogGraph = {
			area: this._panel.querySelector("[data-fog-area]"),
			curve: this._panel.querySelector("[data-fog-curve]"),
			opacityLine: this._panel.querySelector("[data-fog-opacity-line]"),
			startLine: this._panel.querySelector("[data-fog-start-line]"),
			endLine: this._panel.querySelector("[data-fog-end-line]"),
			startLabel: this._panel.querySelector("[data-fog-start-label]"),
			endLabel: this._panel.querySelector("[data-fog-end-label]"),
			axisMax: this._panel.querySelector("[data-fog-axis-max]"),
			visibleSpan: this._panel.querySelector("[data-fog-visible-span]"),
			curveMeaning: this._panel.querySelector("[data-fog-curve-meaning]"),
		};
		this._controlButton = this._panel.querySelector('[data-action="control"]');
		this._detachPanelDrag = attachDevPanelDrag(this._panel, { id: "mmk1Camera" });

		this._controlButton?.addEventListener("click", () => this._toggleControl());
		this._panel.querySelector('[data-action="copy"]')?.addEventListener("click", () => void this._copy());
		this._panel.querySelector('[data-action="reset"]')?.addEventListener("click", () => this._reset());
		this._panel.querySelector('[data-action="copy-crane"]')?.addEventListener("click", () => void this._copyCrane());
		this._panel.querySelector('[data-action="reset-crane"]')?.addEventListener("click", () => this._resetCrane());
		this._panel.querySelector('[data-action="copy-material"]')?.addEventListener("click", () => void this._copyMaterial());
		this._panel.querySelector('[data-action="reset-material"]')?.addEventListener("click", () => this._resetMaterial());
		this._panel.querySelector('[data-action="reset-hotspot-thickness"]')?.addEventListener("click", () => this._resetHotspotThickness());
		this._panel.querySelector('[data-action="copy-city-windows"]')?.addEventListener("click", () => void this._copyCityWindowSettings());
		this._panel.querySelector('[data-action="reset-city-windows"]')?.addEventListener("click", () => this._resetCityWindowSettings());
		this._panel.querySelector('[data-action="close"]')?.addEventListener("click", () => this.setEnabled(false));
		this._craneRange?.addEventListener("input", (event) => this._setCraneRotation(event.currentTarget.value));
		this._craneNumber?.addEventListener("input", (event) => this._setCraneRotation(event.currentTarget.value));
		this._materialProfile?.addEventListener("change", () => this._previewMaterialProfile());
		for (const input of this._materialInputs) {
			input.addEventListener("input", (event) => this._setMaterialValue(
				event.currentTarget.dataset.materialKey,
				event.currentTarget.value,
			));
		}
		this._hotspotThicknessRange?.addEventListener("input", (event) => this._setHotspotThickness(event.currentTarget.value));
		this._hotspotThicknessNumber?.addEventListener("input", (event) => this._setHotspotThickness(event.currentTarget.value));
		for (const input of this._cityWindowInputs) {
			const eventName = input.type === "text" ? "change" : "input";
			input.addEventListener(eventName, (event) => this._setCityWindowValue(
				event.currentTarget.dataset.cityWindowKey,
				event.currentTarget.value,
			));
		}
		this._cityFogGuidesToggle?.addEventListener("change", () => {
			this._setCityFogGuidesEnabled(this._cityFogGuidesToggle.checked);
		});

		registerDevPanelHotkey(HOTKEY, {
			label: "Capabilities / City",
			toggle: () => this.toggle(),
		});

		if (shouldOpenFromUrl()) {
			this.setEnabled(true);
		}
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
			this._setStatus("MMK-1 scene is not ready");
			return;
		}
		const next = !scene.isFreeCameraEnabled?.();
		const active = scene.setFreeCameraEnabled?.(next, camera) === true;
		this._syncControlButton();
		this._setStatus(
			next && !active
				? "open /capabilities before enabling camera"
				: active
					? "control enabled · click canvas for mouse look"
					: "control disabled",
		);
	}

	async _copy() {
		const scene = this.getScene();
		if (!scene?.isFreeCameraEnabled?.()) {
			this._setStatus("enable camera control first");
			return;
		}
		const copied = await scene.copyFreeCameraSnapshot?.(this.getCamera());
		this._setStatus(copied ? "camera copied → clipboard" : "copy failed · pose printed to console");
	}

	_reset() {
		this.getScene()?.resetFreeCamera?.(this.getCamera());
		this._setStatus("camera reset to MMK-1 default");
		this.update(true);
	}

	_setCraneRotation(value) {
		const rotationDeg = Math.max(-360, Math.min(360, Number(value)));
		if (!Number.isFinite(rotationDeg) || !this.getScene()?.setCraneRotationDeg?.(rotationDeg)) {
			this._setStatus("MMK-1 crane is not ready");
			return;
		}
		this._syncCraneControls(rotationDeg);
		this._setStatus(`crane rotation Y = ${rotationDeg.toFixed(1)} deg`);
	}

	_syncCraneControls(rotationDeg = this.getScene()?.getCraneRotationDeg?.()) {
		if (!Number.isFinite(rotationDeg)) {
			return;
		}
		const formatted = Number(rotationDeg).toFixed(1);
		if (this._craneRange && document.activeElement !== this._craneRange) {
			this._craneRange.value = formatted;
		}
		if (this._craneNumber && document.activeElement !== this._craneNumber) {
			this._craneNumber.value = formatted;
		}
	}

	async _copyCrane() {
		const rotationDeg = this.getScene()?.getCraneRotationDeg?.();
		if (!Number.isFinite(rotationDeg)) {
			this._setStatus("MMK-1 crane is not ready");
			return;
		}
		const output = `mmk1CraneRotationYDeg = ${rotationDeg.toFixed(3)};`;
		console.info(output);
		try {
			await navigator.clipboard.writeText(output);
			this._setStatus("crane rotation copied в†’ clipboard");
		} catch {
			this._setStatus("clipboard unavailable В· value printed to console");
		}
	}

	_resetCrane() {
		const rotationDeg = this.getScene()?.resetCraneRotationDeg?.();
		this._syncCraneControls(rotationDeg);
		this._setStatus("crane rotation reset");
	}

	_getSelectedMaterialProfile() {
		return this._materialProfile?.value === "close" ? "close" : "overview";
	}

	_previewMaterialProfile() {
		const profile = this._getSelectedMaterialProfile();
		const settings = this.getScene()?.setCraneMaterialPreviewProfile?.(profile);
		this._syncMaterialControls(settings);
		this._setStatus(`material preview = ${profile}`);
	}

	_setMaterialValue(key, value) {
		if (!key) return;
		const profile = this._getSelectedMaterialProfile();
		const settings = this.getScene()?.setCraneMaterialSettings?.(profile, { [key]: value });
		if (!settings) {
			this._setStatus("MMK-1 crane material is not ready");
			return;
		}
		this._syncMaterialControls(settings);
		this._setStatus(`${profile}.${key} = ${settings[key]}`);
	}

	_syncMaterialControls(settings = null) {
		const resolved = settings ?? this.getScene()?.getCraneMaterialSettings?.();
		if (!resolved) return;
		if (this._materialProfile && document.activeElement !== this._materialProfile) {
			this._materialProfile.value = resolved.profile ?? resolved.activeProfile ?? "overview";
		}
		for (const input of this._materialInputs ?? []) {
			if (document.activeElement === input) continue;
			const key = input.dataset.materialKey;
			if (resolved[key] != null) input.value = resolved[key];
		}
	}

	async _copyMaterial() {
		const profile = this._getSelectedMaterialProfile();
		const settings = this.getScene()?.getCraneMaterialSettings?.(profile);
		if (!settings) {
			this._setStatus("MMK-1 crane material is not ready");
			return;
		}
		const material = { ...settings };
		delete material.activeProfile;
		delete material.profile;
		const output = `mmk1CraneMaterials.${profile} = ${JSON.stringify(material, null, 2)};`;
		console.info(output);
		try {
			await navigator.clipboard.writeText(output);
			this._setStatus(`${profile} material copied to clipboard`);
		} catch {
			this._setStatus("clipboard unavailable; material printed to console");
		}
	}

	_resetMaterial() {
		const profile = this._getSelectedMaterialProfile();
		const settings = this.getScene()?.resetCraneMaterialSettings?.(profile);
		this._syncMaterialControls(settings);
		this._setStatus(`${profile} material reset`);
	}

	_setHotspotThickness(value) {
		const next = this.getScene()?.setHotspotLineThickness?.(value);
		if (!Number.isFinite(next)) {
			this._setStatus("hotspot circles are not ready");
			return;
		}
		this._syncHotspotThickness(next);
		this._setStatus(`hotspot line thickness = ${next.toFixed(2)}`);
	}

	_syncHotspotThickness(value = this.getScene()?.getHotspotLineThickness?.()) {
		if (!Number.isFinite(value)) return;
		const formatted = Number(value).toFixed(2);
		if (this._hotspotThicknessRange && document.activeElement !== this._hotspotThicknessRange) {
			this._hotspotThicknessRange.value = formatted;
		}
		if (this._hotspotThicknessNumber && document.activeElement !== this._hotspotThicknessNumber) {
			this._hotspotThicknessNumber.value = formatted;
		}
	}

	_resetHotspotThickness() {
		const value = this.getScene()?.resetHotspotLineThickness?.();
		this._syncHotspotThickness(value);
		this._setStatus("hotspot line thickness reset");
	}

	_setCityWindowValue(key, value) {
		if (!["intensity", "fogColor", "fogDensity", "fogNear", "fogPower", "fogOpacity"].includes(key)) return;
		if (key === "fogColor" && !/^#[0-9a-fA-F]{6}$/.test(String(value))) return;
		const settings = this.getScene()?.setCityWindowMaterialSettings?.({ [key]: value });
		if (!settings) {
			this._setStatus("city window material is not ready");
			return;
		}
		this._syncCityWindowControls(settings);
		const formatted = key === "fogColor"
			? settings[key]
			: Number(settings[key]).toFixed(3);
		this._setStatus(`city windows ${key} = ${formatted}`);
	}

	_syncCityWindowControls(settings = this.getScene()?.getCityWindowMaterialSettings?.()) {
		if (!settings) return;
		for (const input of this._cityWindowInputs ?? []) {
			if (document.activeElement === input) continue;
			const key = input.dataset.cityWindowKey;
			if (settings[key] == null) continue;
			input.value = String(settings[key]);
		}
		this._syncCityFogGraph(settings);
	}

	_syncCityFogGraph(settings) {
		const graph = this._cityFogGraph;
		if (!graph?.curve || !graph.area) return;
		const density = Math.max(0, Number(settings.fogDensity) || 0);
		const near = Math.max(0, Number(settings.fogNear) || 0);
		const power = Math.max(0.1, Number(settings.fogPower) || 1);
		const opacity = Math.max(0, Math.min(1, Number(settings.fogOpacity) || 0));
		const graphKey = `${density}|${near}|${power}|${opacity}`;
		if (this._lastCityFogGraphKey === graphKey) return;
		this._lastCityFogGraphKey = graphKey;

		const effectiveEnd = getCityFogEffectiveEnd(settings);
		const graphMax = Math.min(
			300,
			Math.max(80, near + 10, Number.isFinite(effectiveEnd) ? effectiveEnd * 1.12 : 80),
		);
		const left = 34;
		const right = 348;
		const top = 18;
		const bottom = 144;
		const width = right - left;
		const height = bottom - top;
		const mapX = (distance) => left + Math.max(0, Math.min(1, distance / graphMax)) * width;
		const fogAt = (distance) => {
			return getCityFogAmount(distance, settings);
		};

		const points = [];
		for (let index = 0; index <= 96; index += 1) {
			const distance = graphMax * index / 96;
			const x = mapX(distance);
			const y = bottom - fogAt(distance) * height;
			points.push(`${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`);
		}
		const curvePath = points.join(" ");
		graph.curve.setAttribute("d", curvePath);
		graph.area.setAttribute("d", `${curvePath} L${right},${bottom} L${left},${bottom} Z`);

		const startX = mapX(near);
		graph.startLine?.setAttribute("x1", startX);
		graph.startLine?.setAttribute("x2", startX);
		graph.startLabel?.setAttribute("x", Math.min(right - 74, startX + 4));
		if (graph.startLabel) graph.startLabel.textContent = `START ${near.toFixed(1)}`;

		const endVisible = Number.isFinite(effectiveEnd);
		const endX = endVisible ? mapX(effectiveEnd) : right;
		graph.endLine?.toggleAttribute("hidden", !endVisible);
		graph.endLine?.setAttribute("x1", endX);
		graph.endLine?.setAttribute("x2", endX);
		graph.endLabel?.setAttribute("x", Math.max(left + 90, endX - 4));
		graph.endLabel?.setAttribute("text-anchor", "end");
		if (graph.endLabel) {
			graph.endLabel.textContent = endVisible
				? `END 99% ${effectiveEnd.toFixed(1)}`
				: "END — FOG OFF";
		}

		const opacityY = bottom - opacity * height;
		graph.opacityLine?.setAttribute("y1", opacityY);
		graph.opacityLine?.setAttribute("y2", opacityY);
		if (graph.axisMax) graph.axisMax.textContent = `${graphMax.toFixed(0)} distance`;
		if (graph.visibleSpan) {
			graph.visibleSpan.textContent = endVisible
				? `${near.toFixed(1)} → ${effectiveEnd.toFixed(1)}`
				: "fog disabled";
		}
		if (graph.curveMeaning) {
			graph.curveMeaning.textContent = power < 0.75
				? "fast early rise"
				: power < 1.25
					? "natural exponential"
					: power < 2.5
						? "soft start"
						: "late steep rise";
		}
	}

	_setCityFogGuidesEnabled(enabled) {
		const active = this.getScene()?.setCityFogSceneGuideEnabled?.(enabled) === true;
		if (this._cityFogGuidesToggle) this._cityFogGuidesToggle.checked = active;
		this._setStatus(active ? "city fog guides visible in scene" : "city fog guides hidden");
	}

	_syncCityFogGuideControl() {
		if (!this._cityFogGuidesToggle) return;
		this._cityFogGuidesToggle.checked = this.getScene()?.isCityFogSceneGuideEnabled?.() === true;
	}

	async _copyCityWindowSettings() {
		const settings = this.getScene()?.getCityWindowMaterialSettings?.();
		if (!settings) {
			this._setStatus("city window material is not ready");
			return;
		}
		const output = `cityWindowMaterial = ${JSON.stringify(settings, null, 2)};`;
		console.info(output);
		try {
			await navigator.clipboard.writeText(output);
			this._setStatus("city window values copied to clipboard");
		} catch {
			this._setStatus("clipboard unavailable; values printed to console");
		}
	}

	_resetCityWindowSettings() {
		const settings = this.getScene()?.resetCityWindowMaterialSettings?.();
		this._syncCityWindowControls(settings);
		this._setStatus(settings ? "city window values reset" : "city window material is not ready");
	}

	async _copyLamps() {
		const settings = this.getScene()?.getCraneLightsMaterialSettings?.();
		if (!settings) {
			this._setStatus("MMK-1 lamp material is not ready");
			return;
		}
		const output = `mmk1LampMaterial = ${JSON.stringify(settings, null, 2)};`;
		console.info(output);
		try {
			await navigator.clipboard.writeText(output);
			this._setStatus("lamp material copied → clipboard");
		} catch {
			this._setStatus("clipboard unavailable · value printed to console");
		}
	}

	_resetLamps() {
		const settings = this.getScene()?.resetCraneLightsMaterialSettings?.();
		this._syncLampControls(settings);
		this._setStatus("lamp material reset");
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
		this._syncCraneControls();
		this._syncMaterialControls();
		this._syncHotspotThickness();
		this._syncCityWindowControls();
		this._syncCityFogGuideControl();
		this._syncControlButton();
		const snapshot = this.getScene()?.getFreeCameraSnapshot?.(this.getCamera());
		if (!snapshot) {
			return;
		}
		if (this._positionEl) this._positionEl.textContent = formatVector(snapshot.position);
		if (this._rotationEl) this._rotationEl.textContent = formatVector(snapshot.rotationDeg);
		if (this._directionEl) this._directionEl.textContent = formatVector(snapshot.lookDirection);
		if (this._fovEl) this._fovEl.textContent = Number(snapshot.fov).toFixed(2);
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
			this.getScene()?.setCityFogSceneGuideEnabled?.(true);
			this.update(true);
			this._setStatus(this.getScene()?.isFreeCameraEnabled?.() ? "control enabled" : "control disabled");
			return;
		}
		this.getScene()?.setCityFogSceneGuideEnabled?.(false);
		this.getScene()?.setFreeCameraEnabled?.(false, this.getCamera());
		this._syncControlButton();
	}

	dispose() {
		if (!import.meta.env.DEV) {
			return;
		}
		this.getScene()?.setFreeCameraEnabled?.(false, this.getCamera());
		unregisterDevPanelHotkey(HOTKEY);
		this._detachPanelDrag?.();
		this._detachPanelDrag = null;
		this._panel?.remove();
		this._panel = null;
	}
}
