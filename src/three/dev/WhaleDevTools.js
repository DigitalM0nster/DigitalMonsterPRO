import { digitalWhaleConfig } from "../scenes/home/digitalWhaleConfig.js";
import { getSiteBloomConfig, siteBloomDevOverrides } from "../render/models/siteBloomConfig.js";
import { attachDevPanelDrag } from "./devPanelDrag.js";
import { formatConfigNumber, injectSceneDevToolsStyles, shouldOpenWhaleDevFromUrl } from "./sceneDevPanelUtils.js";
import {
	formatDevPanelHotkeyHints,
	registerDevPanelHotkey,
	unregisterDevPanelHotkey,
} from "./devPanelHotkeys.js";

const HOTKEY = "w";
const STORAGE_KEY = "digitalMonster.whaleDevPanel.v2";

const FIELD_SECTIONS = [
	{
		title: "Появление существа",
		description: "X: − влево, + вправо. Y: − вниз, + вверх. Глубина отодвигает существо от камеры.",
		fields: [
			["enter.startX", -2, 2, 0.01, "Старт X"],
			["enter.startY", -1.5, 1.5, 0.01, "Старт Y"],
			["enter.depth", 0, 80, 0.5, "Глубина старта"],
			["enter.durationSec", 0.5, 20, 0.1, "Длительность, сек"],
		],
	},
	{
		title: "Положение существа",
		fields: [
			["posX", -30, 30, 0.1],
			["posY", -12, 10, 0.1],
			["posZ", -40, 20, 0.1],
			["rotationX", -6.28, 6.28, 0.001],
			["rotationY", -6.28, 6.28, 0.001],
			["rotationZ", -6.28, 6.28, 0.001],
			["scale", 0.005, 0.2, 0.001],
		],
	},
	{
		title: "Поверхность модели",
		fields: [
			["modelOpacity", 0, 1, 0.01, "Прозрачность модели"],
			["modelColor", "color"],
		],
	},
	{
		title: "Визуал партиклов",
		fields: [
			["pointScale", 0.2, 24, 0.05],
			["particleDensity", 0.1, 1, 0.01],
			["particleScale", 0.2, 3, 0.01],
			["opacity", 0, 1, 1],
			["emissiveIntensity", 0, 30, 0.1],
			["glowPulseMax", 0.5, 16, 0.1],
			["colorTint", "color"],
		],
	},
	{
		title: "Отлетающие партиклы",
		fields: [
			["wake.count", 0, 400, 1],
			["wake.pointScale", 0.2, 8, 0.05],
			["wake.alpha", 0, 1, 0.01],
			["wake.glow", 0, 12, 0.1],
			["wake.speed", 0, 0.3, 0.005],
			["wake.spread", 0, 1.5, 0.01],
			["wake.wanderAmp", 0, 8, 0.05],
			["wake.flowX", -2, 2, 0.01],
			["wake.flowY", -2, 2, 0.01],
			["wake.color", "color"],
		],
	},
	{
		title: "Site bloom",
		fields: [
			["bloomIntensity", 0, 10, 0.1],
			["bloomRadius", 0.2, 1.4, 0.01],
		],
	},
];

function formatSection(section) {
	return `<section class="section">
		<p class="sectionTitle">${section.title}</p>
		${section.description ? `<p class="legend">${section.description}</p>` : ""}
		${section.fields.map((field) => {
			const [key, typeOrMin, max, step, label = key] = field;
			if (typeOrMin === "color") {
				return `<div class="field" data-field="${key}">
					<label>${label}</label>
					<input type="color" />
					<input type="text" />
				</div>`;
			}
			return `<div class="field" data-field="${key}">
				<label>${label}</label>
				<input type="range" min="${typeOrMin}" max="${max}" step="${step}" />
				<input type="number" min="${typeOrMin}" max="${max}" step="${step}" />
			</div>`;
		}).join("\n")}
	</section>`;
}

function sanitizeNumber(value, min, max, fallback) {
	const number = Number(value);
	if (!Number.isFinite(number)) return fallback;
	return Math.max(min, Math.min(max, number));
}

function clamp01(value) {
	return Math.max(0, Math.min(1, value));
}

/** DEV-only controls for whale transform and surface look directly on site. */
export class WhaleDevTools {
	constructor(options = {}) {
		if (!import.meta.env.DEV) {
			return;
		}

		this.getScene = options.getScene ?? (() => null);
		this.getPostProcess = options.getPostProcess ?? (() => null);
		this.gfx = options.gfx ?? {};
		this.enabled = false;
		this._fields = new Map();
		this._defaults = structuredClone(digitalWhaleConfig.whale);
		this._enterDefaults = structuredClone(digitalWhaleConfig.whaleEnter);
		this._detachPanelDrag = null;

		injectSceneDevToolsStyles();
		this._panel = document.createElement("div");
		this._panel.className = "sceneDevTools whaleDevTools hidden";
		this._panel.innerHTML = `
			<div class="devPanelDragHandle"><p class="title">Digital Whale</p></div>
			<p class="legend">?whaleDev=1 / <b>${HOTKEY}</b> — whale live controls. Параметры применяются сразу на сцене.</p>
			<p class="status" data-status></p>
			${FIELD_SECTIONS.map(formatSection).join("\n")}
			<section class="section">
				<div class="actions">
					<button type="button" data-action="replay">Повторить появление</button>
					<button type="button" data-action="copy">Копировать</button>
					<button type="button" data-action="save">Сохранить локально</button>
					<button type="button" data-action="reset">Сброс</button>
					<button type="button" data-action="close">Закрыть</button>
				</div>
				<footer class="legend" data-hints></footer>
			</section>
			<textarea aria-label="Настройки для копирования" readonly hidden></textarea>`;
		document.body.appendChild(this._panel);

		this._statusEl = this._panel.querySelector("[data-status]");
		this._hintsEl = this._panel.querySelector("[data-hints]");
		this._textarea = this._panel.querySelector("textarea");

		this._loadSavedConfig();
		this._bindFields();
		this._detachPanelDrag = attachDevPanelDrag(this._panel, { id: "digitalWhale" });

		this._panel.querySelector('[data-action="replay"]')?.addEventListener("click", () => this._replayEntrance());
		this._panel.querySelector('[data-action="copy"]')?.addEventListener("click", () => this._copyConfig());
		this._panel.querySelector('[data-action="save"]')?.addEventListener("click", () => this._saveConfigLocally());
		this._panel.querySelector('[data-action="reset"]')?.addEventListener("click", () => this._reset());
		this._panel.querySelector('[data-action="close"]')?.addEventListener("click", () => this.setEnabled(false));

		registerDevPanelHotkey(HOTKEY, {
			label: "Whale",
			toggle: () => this.toggle(),
		});

		this._syncFields();
		this._syncHints();
		this._syncStatus("Нажми W для открытия/скрытия.");
		if (shouldOpenWhaleDevFromUrl()) {
			this.setEnabled(true);
		}
	}

	_loadSavedConfig() {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (!raw) {
				return;
			}

			const saved = JSON.parse(raw);
			const source = digitalWhaleConfig.whale;
			const enterSource = digitalWhaleConfig.whaleEnter;
			if (saved?.whale?.wake && typeof saved.whale.wake === "object") {
				Object.assign(source.wake, saved.whale.wake);
			}
			for (const key of Object.keys(saved?.whale ?? {})) {
				if (key === "wake") continue;
				if (key === "glowPulseMax") {
					const glowPulse = { ...source.glowPulse };
					glowPulse.max = sanitizeNumber(saved.whale[key], 0.5, 40, glowPulse.max);
					source.glowPulse = glowPulse;
					continue;
				}
				if (source[key] == null) continue;
				const value = saved.whale[key];
				if (typeof source[key] === "number") {
					source[key] = Number(value);
				} else if (typeof source[key] === "string") {
					source[key] = String(value);
				}
			}
			for (const key of ["startX", "startY", "depth", "durationMs"]) {
				if (typeof saved?.whaleEnter?.[key] === "number" && key in enterSource) {
					enterSource[key] = Number(saved.whaleEnter[key]);
				}
			}
			if (typeof saved?.bloomIntensity === "number") {
				siteBloomDevOverrides.intensity = sanitizeNumber(saved.bloomIntensity, 0, 10, siteBloomDevOverrides.intensity ?? 1);
			}
			if (typeof saved?.bloomRadius === "number") {
				siteBloomDevOverrides.radius = sanitizeNumber(saved.bloomRadius, 0.2, 1.4, siteBloomDevOverrides.radius ?? 0.85);
			}
		} catch {
			/* Optional storage parse errors. */
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

			const onNumeric = (raw) => {
				let next = Number(raw);
				if (!Number.isFinite(next)) return;
				if (key === "particleDensity") {
					next = clamp01(next);
				}
				if (key === "opacity") {
					next = clamp01(next) >= .5 ? 1 : 0;
				} else if (key === "modelOpacity") {
					next = clamp01(next);
				}
				if (key.startsWith("enter.")) {
					const enterKey = key.slice("enter.".length);
					if (enterKey === "durationSec") {
						digitalWhaleConfig.whaleEnter.durationMs = Math.max(100, next * 1000);
					} else if (typeof digitalWhaleConfig.whaleEnter?.[enterKey] === "number") {
						digitalWhaleConfig.whaleEnter[enterKey] = next;
					}
					this.getScene()?.restartWhaleEntranceFromDev?.();
					this._syncStatus(`Появление: ${enterKey} = ${formatConfigNumber(next)}`);
				} else if (key === "glowPulseMax") {
					const w = digitalWhaleConfig.whale;
					const glowPulse = { ...w.glowPulse };
					glowPulse.max = sanitizeNumber(next, 0.5, 40, glowPulse.max);
					w.glowPulse = glowPulse;
					this.getScene()?.applyWhaleConfigFromDev?.();
					this._syncStatus(`Glow pulse: ${formatConfigNumber(glowPulse.max)}`);
				} else if (key === "bloomIntensity") {
					siteBloomDevOverrides.intensity = sanitizeNumber(next, 0, 10, siteBloomDevOverrides.intensity ?? 1);
					this.getPostProcess()?.applyConfigFromDev?.();
					this._syncStatus(`Bloom intensity: ${formatConfigNumber(siteBloomDevOverrides.intensity)}`);
				} else if (key === "bloomRadius") {
					siteBloomDevOverrides.radius = sanitizeNumber(next, 0.2, 1.4, siteBloomDevOverrides.radius ?? 0.85);
					this.getPostProcess()?.applyConfigFromDev?.();
					this._syncStatus(`Bloom radius: ${formatConfigNumber(siteBloomDevOverrides.radius)}`);
				} else if (key.startsWith("wake.")) {
					const wakeKey = key.slice("wake.".length);
					if (typeof digitalWhaleConfig.whale.wake?.[wakeKey] !== "number") return;
					digitalWhaleConfig.whale.wake[wakeKey] = next;
					this.getScene()?.applyWhaleConfigFromDev?.();
					this._syncStatus(`Updated: ${key} = ${formatConfigNumber(next)}`);
				} else if (typeof digitalWhaleConfig.whale[key] === "number") {
					digitalWhaleConfig.whale[key] = next;
					this.getScene()?.applyWhaleConfigFromDev?.();
					this._syncStatus(`Updated: ${key} = ${formatConfigNumber(next)}`);
				}

				if (range) range.value = String(next);
				if (number) number.value = String(next);
			};

			range?.addEventListener("input", () => onNumeric(range.value));
			number?.addEventListener("input", () => onNumeric(number.value));
			number?.addEventListener("change", () => onNumeric(number.value));

			const onColor = (raw) => {
				let hex = String(raw || "").trim();
				if (!hex.startsWith("#")) hex = `#${hex}`;
				if (!/^#[0-9a-fA-F]{6}$/i.test(hex)) return;
				if (key === "wake.color") {
					digitalWhaleConfig.whale.wake.color = hex;
				} else if (key === "modelColor") {
					digitalWhaleConfig.whale.modelColor = hex;
				} else {
					digitalWhaleConfig.whale.colorTint = hex;
				}
				if (color) color.value = hex;
				if (text) text.value = hex;
				this.getScene()?.applyWhaleConfigFromDev?.();
				this._syncStatus(`${key}: ${hex}`);
			};
			color?.addEventListener("input", () => onColor(color.value));
			text?.addEventListener("input", () => onColor(text.value));
			text?.addEventListener("change", () => onColor(text.value));
		}
	}

	_copyConfig() {
		const payload = JSON.stringify({
			whaleEnter: structuredClone(digitalWhaleConfig.whaleEnter),
			whale: {
				posX: digitalWhaleConfig.whale.posX,
				posY: digitalWhaleConfig.whale.posY,
				posZ: digitalWhaleConfig.whale.posZ,
				rotationX: digitalWhaleConfig.whale.rotationX,
				rotationY: digitalWhaleConfig.whale.rotationY,
				rotationZ: digitalWhaleConfig.whale.rotationZ,
				pointScale: digitalWhaleConfig.whale.pointScale,
				particleDensity: digitalWhaleConfig.whale.particleDensity,
				particleScale: digitalWhaleConfig.whale.particleScale,
				opacity: digitalWhaleConfig.whale.opacity,
				modelOpacity: digitalWhaleConfig.whale.modelOpacity,
				modelColor: digitalWhaleConfig.whale.modelColor,
				emissiveIntensity: digitalWhaleConfig.whale.emissiveIntensity,
				colorTint: digitalWhaleConfig.whale.colorTint,
				glowPulseMax: digitalWhaleConfig.whale.glowPulse?.max,
				wake: structuredClone(digitalWhaleConfig.whale.wake),
				scale: digitalWhaleConfig.whale.scale,
				swimSpeed: digitalWhaleConfig.whale.swimSpeed,
			},
			bloomIntensity: siteBloomDevOverrides.intensity,
			bloomRadius: siteBloomDevOverrides.radius,
		}, null, 2);
		if (this._textarea) {
			this._textarea.hidden = false;
			this._textarea.value = payload;
		}

		navigator.clipboard?.writeText(payload).then(
			() => this._syncStatus("Настройки скопированы в буфер."),
			() => {
				this._textarea?.focus();
				this._textarea?.select();
				this._syncStatus("Скопируй вручную из textarea.");
			},
		);
	}

	_saveConfigLocally() {
		try {
			const snapshot = {
				whaleEnter: structuredClone(digitalWhaleConfig.whaleEnter),
				whale: {
					posX: digitalWhaleConfig.whale.posX,
					posY: digitalWhaleConfig.whale.posY,
					posZ: digitalWhaleConfig.whale.posZ,
					rotationX: digitalWhaleConfig.whale.rotationX,
					rotationY: digitalWhaleConfig.whale.rotationY,
					rotationZ: digitalWhaleConfig.whale.rotationZ,
					pointScale: digitalWhaleConfig.whale.pointScale,
					particleDensity: digitalWhaleConfig.whale.particleDensity,
					particleScale: digitalWhaleConfig.whale.particleScale,
					opacity: digitalWhaleConfig.whale.opacity,
					modelOpacity: digitalWhaleConfig.whale.modelOpacity,
					modelColor: digitalWhaleConfig.whale.modelColor,
					emissiveIntensity: digitalWhaleConfig.whale.emissiveIntensity,
					colorTint: digitalWhaleConfig.whale.colorTint,
					glowPulseMax: digitalWhaleConfig.whale.glowPulse?.max,
					wake: structuredClone(digitalWhaleConfig.whale.wake),
					scale: digitalWhaleConfig.whale.scale,
					swimSpeed: digitalWhaleConfig.whale.swimSpeed,
				},
				bloomIntensity: siteBloomDevOverrides.intensity,
				bloomRadius: siteBloomDevOverrides.radius,
			};
			localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
			this._syncStatus("Сохранено локально.");
		} catch {
			this._syncStatus("Не удалось сохранить в localStorage.");
		}
	}

	_reset() {
		Object.assign(digitalWhaleConfig.whale, this._defaults);
		Object.assign(digitalWhaleConfig.whaleEnter, this._enterDefaults);
		siteBloomDevOverrides.intensity = undefined;
		siteBloomDevOverrides.radius = undefined;
		try {
			localStorage.removeItem(STORAGE_KEY);
		} catch {
			/* Reset still applies in memory if storage is unavailable. */
		}
		this.getPostProcess()?.applyConfigFromDev?.();
		this._syncFields();
		this.getScene()?.applyWhaleConfigFromDev?.();
		this.getScene()?.restartWhaleEntranceFromDev?.();
		this._syncStatus("Сброшено к дефолту сцены и dev-override.");
	}

	_replayEntrance() {
		this.getScene()?.restartWhaleEntranceFromDev?.();
		this._syncStatus(`Повтор: ${formatConfigNumber((digitalWhaleConfig.whaleEnter.durationMs ?? 0) / 1000)} сек.`);
	}

	_syncFields() {
		const w = digitalWhaleConfig.whale;
		const bloomConfig = getSiteBloomConfig(this.gfx);
		const pairs = [
			["enter.startX", digitalWhaleConfig.whaleEnter.startX],
			["enter.startY", digitalWhaleConfig.whaleEnter.startY],
			["enter.depth", digitalWhaleConfig.whaleEnter.depth],
			["enter.durationSec", digitalWhaleConfig.whaleEnter.durationMs / 1000],
			["posX", w.posX], ["posY", w.posY], ["posZ", w.posZ],
			["rotationX", w.rotationX], ["rotationY", w.rotationY], ["rotationZ", w.rotationZ],
			["scale", w.scale],
			["pointScale", w.pointScale], ["particleDensity", w.particleDensity], ["particleScale", w.particleScale],
			["opacity", w.opacity], ["emissiveIntensity", w.emissiveIntensity], ["glowPulseMax", w.glowPulse?.max],
			["modelOpacity", w.modelOpacity],
			["wake.count", w.wake?.count], ["wake.pointScale", w.wake?.pointScale], ["wake.alpha", w.wake?.alpha],
			["wake.glow", w.wake?.glow], ["wake.speed", w.wake?.speed], ["wake.spread", w.wake?.spread],
			["wake.wanderAmp", w.wake?.wanderAmp], ["wake.flowX", w.wake?.flowX], ["wake.flowY", w.wake?.flowY],
			["bloomIntensity", bloomConfig.intensity], ["bloomRadius", bloomConfig.radius],
		];
		for (const [fieldKey, value] of pairs) {
			const refs = this._fields.get(fieldKey);
			if (!refs || value == null) continue;
			if (typeof value !== "number") continue;
			if (refs.range) refs.range.value = String(value);
			if (refs.number) refs.number.value = String(value);
		}

		for (const [key, value] of [["colorTint", w.colorTint], ["modelColor", w.modelColor], ["wake.color", w.wake.color]]) {
			const refs = this._fields.get(key);
			if (refs?.color) refs.color.value = value;
			if (refs?.text) refs.text.value = value;
		}
	}

	_syncHints() {
		if (this._hintsEl) this._hintsEl.textContent = formatDevPanelHotkeyHints();
	}

	_syncStatus(text) {
		if (this._statusEl) this._statusEl.textContent = text;
	}

	toggle() { this.setEnabled(!this.enabled); }

	setEnabled(next) {
		if (!import.meta.env.DEV || this.enabled === next) return;
		this.enabled = next;
		this._panel.classList.toggle("hidden", !next);
		if (!next) return;
		this._syncFields();
		this._syncHints();
		this._syncStatus(`Digital Whale · ${HOTKEY} закрывает/открывает · ${formatDevPanelHotkeyHints()}`);
	}

	dispose() {
		unregisterDevPanelHotkey(HOTKEY);
		this._detachPanelDrag?.();
		this._panel?.remove();
		this._detachPanelDrag = null;
		this._panel = null;
	}
}
