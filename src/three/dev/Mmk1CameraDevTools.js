import { CITY_TRAFFIC_CONTROLS } from "@/three/scenes/capabilities/city/cityTrafficConfig.js";
import { store } from "@/app/store.jsx";
import { attachDevPanelDrag } from "./devPanelDrag.js";
import { formatDevPanelHotkeyHints, registerDevPanelHotkey, unregisterDevPanelHotkey } from "./devPanelHotkeys.js";
import { injectSceneDevToolsStyles } from "./sceneDevPanelUtils.js";

const HOTKEY = "0";

function shouldOpenFromUrl() {
	const params = new URLSearchParams(window.location.search);
	return params.has("mmk1Dev") || params.has("cityDev")
		|| window.location.pathname === "/capabilities/mmk1";
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
		this.getCityScene = options.getCityScene ?? this.getScene;
		this.getCamera = options.getCamera ?? (() => null);
		this.enabled = false;
		this._lastReadoutAt = 0;
		this._detachPanelDrag = null;
		this._autoOpenPending = false;

		injectSceneDevToolsStyles();
		this._panel = document.createElement("div");
		this._panel.className = "sceneDevTools mmk1CameraDevTools hidden";
		this._panel.dataset.canvasPointerBlocker = "true";
		this._panel.innerHTML = `
			<div class="devPanelDragHandle"><p class="title">MMK-1 / MOBILE CAMERA</p></div>
			<p class="legend">
				<b>${HOTKEY}</b> — открыть/закрыть · WASD — полёт · Space/Alt — вверх/вниз · стрелки — поворот · Shift — быстрее.<br/>
				Откройте нужный кружок, затем включите полёт. Кнопка копирования сохранит ракурс, его номер и размер адаптивного экрана.
			</p>
			<p class="status" data-status>control disabled</p>
			<section class="section" data-crane-flight-section>
				<p class="sectionTitle">Ракурс крана</p>
				<div class="actions">
					<button type="button" data-action="control">Включить полёт</button>
					<button type="button" data-action="copy">Скопировать ракурс (C)</button>
					<button type="button" data-action="reset">Общий вид</button>
				</div>
				<p class="legend">Для обзора мышью нажмите на сцену; Esc освободит курсор. Стрелки работают без захвата мыши.</p>
			</section>
			<section class="section" data-city-flight-section>
				<p class="sectionTitle">Подбор мобильного ракурса</p>
				<p class="legend">Включите адаптивный экран в DevTools, затем полёт.<br/>WASD — движение · Пробел — вверх · Alt — вниз · стрелки — поворот · Shift — быстрее.<br/>0 — скрыть панель и продолжить полёт. C — скопировать ракурс. Мышь остаётся свободной.</p>
				<div class="actions"><button type="button" data-action="city-flight">Включить полёт</button><button type="button" data-action="city-copy">Скопировать ракурс (C)</button><button type="button" data-action="city-overview">Вернуть общий вид</button></div>
				<textarea data-city-snapshot aria-label="Координаты камеры города для копирования" rows="8" readonly hidden style="width:100%;box-sizing:border-box"></textarea>
			</section>
			<section class="section" data-city-traffic-section>
				<p class="sectionTitle">Город · фары и движение</p>
				<p class="legend">Изменения видны сразу. Размер фар не зависит от корпуса. Голубой — основная доля; белые и жёлтые задаются ниже.</p>
				${CITY_TRAFFIC_CONTROLS.map(([key, label, min, max, step]) => min === "color"
					? `<div class="field"><label>${label}</label><input type="color" aria-label="${label}" data-city-traffic-key="${key}" /></div>`
					: `<div class="field"><label>${label}</label><input type="range" aria-label="${label}" min="${min}" max="${max}" step="${step}" data-city-traffic-key="${key}" /><input type="number" aria-label="${label}: значение" min="${min}" max="${max}" step="${step}" data-city-traffic-key="${key}" /></div>`
				).join("")}
				<div class="actions"><button type="button" data-action="copy-city-traffic">Скопировать конфиг</button><button type="button" data-action="reset-city-traffic">Сбросить настройки</button></div>
			</section>
			<section class="section" data-camera-readout>
				<p class="readout"><span class="k">view</span><span class="v" data-view>—</span></p>
				<p class="readout"><span class="k">viewport</span><span class="v" data-viewport>—</span></p>
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
				<div class="actions">
					<button type="button" data-action="close">Close</button>
				</div>
			</section>
			<footer class="legend" data-hints>${formatDevPanelHotkeyHints()}</footer>
		`;
		document.body.appendChild(this._panel);
		const cityPath = window.location.pathname.includes("/capabilities/spatial-matrix");
		if (cityPath) {
			this._panel.querySelector(".title").textContent = "CITY / MOBILE CAMERA";
			for (const section of this._panel.querySelectorAll("section")) {
				if (!section.hasAttribute("data-city-traffic-section") && !section.hasAttribute("data-city-flight-section") && !section.hasAttribute("data-camera-readout") && !section.querySelector('[data-action="close"]')) section.style.setProperty("display", "none", "important");
			}
			this._panel.querySelector(".legend").textContent = "0 — открыть/закрыть. Ползунки работают без перезагрузки. Bloom — общий эффект сайта.";
			for (const action of ["control", "copy", "reset"])
				this._panel.querySelector(`[data-action="${action}"]`).style.display = "none";
		} else {
			this._panel.querySelector("[data-city-flight-section]").hidden = true;
			this._panel.querySelector("[data-city-traffic-section]").hidden = true;
		}

		this._statusEl = this._panel.querySelector("[data-status]");
		this._viewEl = this._panel.querySelector("[data-view]");
		this._viewportEl = this._panel.querySelector("[data-viewport]");
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
		this._cityTrafficInputs = Array.from(this._panel.querySelectorAll("[data-city-traffic-key]"));
		this._controlButton = this._panel.querySelector('[data-action="control"]');
		this._cityFlightButton = this._panel.querySelector('[data-action="city-flight"]');
		this._cityFlightButton.addEventListener("click", () => {
			const scene = this.getCityScene();
			const enabled = scene?.setFreeCameraEnabled?.(!scene.isFreeCameraEnabled?.(), this.getCamera());
			this._setStatus(enabled ? "Полёт включён · WASD и стрелки готовы" : "Полёт выключен");
			this.update(true);
		});
		this._panel.querySelector('[data-action="city-copy"]').addEventListener("click", () => void this._copyCityCamera());
		this._panel.querySelector('[data-action="city-overview"]').addEventListener("click", () => {
			const scene = this.getCityScene();
			scene?.setFreeCameraEnabled?.(false, this.getCamera());
			scene?.resetFreeCamera?.(this.getCamera());
			this._setStatus("Общий вид восстановлен");
			this.update(true);
		});
		this._detachPanelDrag = attachDevPanelDrag(this._panel, { id: "mmk1Camera" });

		this._controlButton?.addEventListener("click", () => this._toggleControl());
		this._panel.querySelector('[data-action="copy"]')?.addEventListener("click", () => void this._copy());
		this._panel.querySelector('[data-action="reset"]')?.addEventListener("click", () => this._reset());
		this._panel.querySelector('[data-action="copy-crane"]')?.addEventListener("click", () => void this._copyCrane());
		this._panel.querySelector('[data-action="reset-crane"]')?.addEventListener("click", () => this._resetCrane());
		this._panel.querySelector('[data-action="copy-material"]')?.addEventListener("click", () => void this._copyMaterial());
		this._panel.querySelector('[data-action="reset-material"]')?.addEventListener("click", () => this._resetMaterial());
		this._panel.querySelector('[data-action="reset-hotspot-thickness"]')?.addEventListener("click", () => this._resetHotspotThickness());
		this._panel.querySelector('[data-action="copy-city-traffic"]')?.addEventListener("click", () => void this._copyCityTrafficSettings());
		this._panel.querySelector('[data-action="reset-city-traffic"]')?.addEventListener("click", () => this._resetCityTrafficSettings());
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
		for (const input of this._cityTrafficInputs) {
			const eventName = input.type === "text" ? "change" : "input";
			input.addEventListener(eventName, (event) => this._setCityTrafficValue(
				event.currentTarget.dataset.cityTrafficKey,
				event.currentTarget.value,
			));
		}
		registerDevPanelHotkey(HOTKEY, {
			label: "Capabilities / City",
			toggle: () => this.toggle(),
		});

		if (shouldOpenFromUrl()) {
			if (window.location.pathname === "/capabilities/mmk1" && !store.appStarted) {
				this._autoOpenPending = true;
			} else {
				this.setEnabled(true);
			}
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
			this._controlButton.textContent = active ? "Выключить полёт" : "Включить полёт";
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
		if (this._cityFlightButton) this._cityFlightButton.textContent =
			this.getCityScene()?.isFreeCameraEnabled?.() ? "Выключить полёт" : "Включить полёт";
		this._setStatus(
			next && !active
				? "Откройте сцену MMK-1"
				: active
					? "Полёт включён · WASD и стрелки готовы"
					: "Полёт выключен",
		);
	}

	async _copy() {
		const scene = this.getScene();
		if (!scene?.isFreeCameraEnabled?.()) {
			this._setStatus("Сначала включите полёт");
			return;
		}
		const copied = await scene.copyFreeCameraSnapshot?.(this.getCamera());
		this._setStatus(copied ? "Ракурс и размер экрана скопированы" : "Ракурс выведен в консоль");
	}

	async _copyCityCamera() {
		const scene = this.getCityScene();
		const snapshot = scene?.getFreeCameraSnapshot?.(this.getCamera());
		if (!snapshot) {
			this._setStatus("Город ещё загружается");
			return;
		}
		const output = this._panel.querySelector("[data-city-snapshot]");
		output.value = `cityCamera = ${JSON.stringify(snapshot, null, 2)}`;
		try {
			await navigator.clipboard.writeText(output.value);
			output.hidden = true;
			this._setStatus("Ракурс и размер экрана скопированы — пришлите их в чат");
		} catch {
			output.hidden = false;
			output.focus();
			output.select();
			this._setStatus("Скопируйте выделенные координаты и пришлите их в чат");
		}
	}

	_reset() {
		this.getScene()?.resetFreeCamera?.(this.getCamera());
		this._setStatus("Восстановлен адаптивный общий вид");
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

	_setCityTrafficValue(key, value) {
		if (!CITY_TRAFFIC_CONTROLS.some(([name]) => name === key)) return;
		if (key.endsWith("Color") && !/^#[0-9a-fA-F]{6}$/.test(String(value))) return;
		const settings = this.getCityScene()?.setCityTrafficSettings?.({ [key]: value });
		if (!settings) {
			this._setStatus("city traffic material is not ready");
			return;
		}
		this._syncCityTrafficControls(settings);
		const formatted = key.endsWith("Color")
			? settings[key]
			: Number(settings[key]).toFixed(3);
		this._setStatus(`city traffics ${key} = ${formatted}`);
	}

	_syncCityTrafficControls(settings = this.getCityScene()?.getCityTrafficSettings?.()) {
		if (!settings) return;
		for (const input of this._cityTrafficInputs ?? []) {
			if (document.activeElement === input) continue;
			const key = input.dataset.cityTrafficKey;
			if (settings[key] == null) continue;
			input.value = String(settings[key]);
		}
	}

	async _copyCityTrafficSettings() {
		const settings = this.getCityScene()?.getCityTrafficSettings?.();
		if (!settings) {
			this._setStatus("city traffic material is not ready");
			return;
		}
		const output = `export const cityTrafficConfig = ${JSON.stringify(settings, null, 2)};`;
		console.info(output);
		try {
			await navigator.clipboard.writeText(output);
			this._setStatus("city traffic values copied to clipboard");
		} catch {
			this._setStatus("clipboard unavailable; values printed to console");
		}
	}

	_resetCityTrafficSettings() {
		const settings = this.getCityScene()?.resetCityTrafficSettings?.();
		this._syncCityTrafficControls(settings);
		this._setStatus(settings ? "city traffic values reset" : "city traffic material is not ready");
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
		if (this._autoOpenPending && store.appStarted) {
			this._autoOpenPending = false;
			this.setEnabled(true);
		}
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
		this._syncCityTrafficControls();
		this._syncControlButton();
		const cityPath = window.location.pathname === "/capabilities/spatial-matrix";
		this._panel.querySelector('[data-city-flight-section]').hidden = !cityPath;
		this._panel.querySelector('[data-city-traffic-section]').hidden = !cityPath;
		this._panel.querySelector('[data-crane-flight-section]').hidden =
			window.location.pathname !== "/capabilities/mmk1";
		if (this._cityFlightButton) this._cityFlightButton.textContent =
			this.getCityScene()?.isFreeCameraEnabled?.() ? "Выключить полёт" : "Включить полёт";
		const cameraScene = window.location.pathname === "/capabilities/spatial-matrix"
			? this.getCityScene() : this.getScene();
		const snapshot = cameraScene?.getFreeCameraSnapshot?.(this.getCamera());
		if (!snapshot) {
			return;
		}
		if (this._viewEl) this._viewEl.textContent = snapshot.viewId ?? "overview";
		if (this._viewportEl) this._viewportEl.textContent = snapshot.viewport
			? `${snapshot.viewport.width} × ${snapshot.viewport.height} @ ${snapshot.viewport.devicePixelRatio}`
			: "—";
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
			if (this.getCityScene()?.isFreeCameraEnabled?.() && document.pointerLockElement)
				document.exitPointerLock?.();
			this.update(true);
			const cameraScene = window.location.pathname === "/capabilities/spatial-matrix"
				? this.getCityScene() : this.getScene();
			this._setStatus(cameraScene?.isFreeCameraEnabled?.() ? "Полёт включён · WASD и стрелки готовы" : "Полёт выключен");
			return;
		}
		// The city panel covers most of a phone viewport; hiding it must keep flight live.
		if (window.location.pathname !== "/capabilities/spatial-matrix")
			this.getScene()?.setFreeCameraEnabled?.(false, this.getCamera());
		this._syncControlButton();
	}

	dispose() {
		if (!import.meta.env.DEV) {
			return;
		}
		this.getScene()?.setFreeCameraEnabled?.(false, this.getCamera());
		this.getCityScene()?.setFreeCameraEnabled?.(false, this.getCamera());
		unregisterDevPanelHotkey(HOTKEY);
		this._detachPanelDrag?.();
		this._detachPanelDrag = null;
		this._panel?.remove();
		this._panel = null;
	}
}
