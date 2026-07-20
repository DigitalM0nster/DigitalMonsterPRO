import { store } from "@/store.jsx";
import { getSceneCarousel } from "@/three/render/transition/carouselPage.js";
import { getCarouselProgressState, getHexShaderProgress } from "@/three/render/overlay/hexShaderProgress.js";
import {
	getAboutPanelHudEnterProgress,
	getAboutPanelHudMixProgress,
} from "@/about/aboutPanelHudBridge.js";
import { getStageProgress, getStageProgressTarget } from "@/portfolio/core/stageProgress.js";
import { isAboutExperienceRuntimeActive } from "@/about/aboutExperienceRuntime.js";
import { isCaseExperienceRuntimeActive } from "@/portfolio/core/caseExperienceRuntime.js";
import { injectSceneDevToolsStyles, shouldOpenProgressDevFromUrl } from "./sceneDevPanelUtils.js";
import { formatDevPanelHotkeyHints, registerDevPanelHotkey, unregisterDevPanelHotkey } from "./devPanelHotkeys.js";
import { attachDevPanelDrag } from "./devPanelDrag.js";

const HOTKEY = "1";

function fmt(value, digits = 4) {
	const n = Number(value);
	if (!Number.isFinite(n)) {
		return "—";
	}
	return n.toFixed(digits);
}

function fmtBool(value) {
	return value ? "yes" : "no";
}

function row(key, label) {
	return `<p class="readout" data-row="${key}"><span class="k">${label}</span><span class="v" data-v>—</span></p>`;
}

/**
 * DEV panel — live carousel / About / case progress + targets.
 * Hotkey: 1 · URL: ?progressDev=1
 */
export class ProgressDevTools {
	constructor() {
		if (!import.meta.env.DEV) {
			return;
		}

		this.enabled = false;
		this._hotkey = HOTKEY;
		this._raf = 0;
		this._detachPanelDrag = null;

		injectSceneDevToolsStyles();
		this._panel = document.createElement("div");
		this._panel.className = "sceneDevTools progressDevTools hidden";
		this._panel.innerHTML = `
			<div class="devPanelDragHandle">
				<p class="title">Progress</p>
			</div>
			<p class="legend">Live progress / target · ring + interior stories · hotkey <b>${HOTKEY}</b> · ?progressDev=1</p>
			<section class="section">
				<p class="sectionTitle">Carousel (ring)</p>
				${row("c.ids", "prev / current / next")}
				${row("c.mixIds", "mix source → target")}
				${row("c.progress", "progress")}
				${row("c.progressTarget", "progressTarget")}
				${row("c.mix", "mixProgress (|p|)")}
				${row("c.hex", "hex shader")}
				${row("c.flags", "aboutBound / caseBound / hexNav")}
			</section>
			<section class="section">
				<p class="sectionTitle">About story</p>
				${row("a.active", "runtime active")}
				${row("a.story", "story / target")}
				${row("a.stage", "stage local / target")}
				${row("a.norm", "norm 0…1 / target")}
				${row("a.index", "stage index / id")}
				${row("a.hud", "HUD enter / mix")}
			</section>
			<section class="section">
				<p class="sectionTitle">Case story</p>
				${row("k.open", "openedCase / runtime")}
				${row("k.story", "story / target")}
				${row("k.scroll", "scroll 0…1 / target")}
				${row("k.stage", "stage local / target")}
				${row("k.index", "stage index / id")}
			</section>
			<section class="section">
				<div class="actions">
					<button type="button" data-action="close">Close</button>
				</div>
			</section>
			<footer class="legend" data-hints></footer>
		`;
		document.body.appendChild(this._panel);

		this._values = new Map();
		for (const el of this._panel.querySelectorAll("[data-row]")) {
			const key = el.getAttribute("data-row");
			const valueEl = el.querySelector("[data-v]");
			if (key && valueEl) {
				this._values.set(key, { row: el, valueEl });
			}
		}

		this._hintsEl = this._panel.querySelector("[data-hints]");
		this._detachPanelDrag = attachDevPanelDrag(this._panel, { id: "progressReadout" });
		this._panel.querySelector('[data-action="close"]')?.addEventListener("click", () => this.setEnabled(false));

		registerDevPanelHotkey(this._hotkey, {
			label: "Progress",
			toggle: () => this.toggle(),
		});

		if (this._hintsEl) {
			this._hintsEl.textContent = formatDevPanelHotkeyHints();
		}

		if (shouldOpenProgressDevFromUrl()) {
			this.setEnabled(true);
		}
	}

	toggle() {
		this.setEnabled(!this.enabled);
	}

	setEnabled(enabled) {
		if (!import.meta.env.DEV || !this._panel) {
			return;
		}
		this.enabled = Boolean(enabled);
		this._panel.classList.toggle("hidden", !this.enabled);
		if (this.enabled) {
			this._tick();
		} else if (this._raf) {
			cancelAnimationFrame(this._raf);
			this._raf = 0;
		}
	}

	_set(key, text, dim = false) {
		const entry = this._values.get(key);
		if (!entry) {
			return;
		}
		entry.valueEl.textContent = text;
		entry.row.classList.toggle("dim", Boolean(dim));
	}

	_tick() {
		if (!this.enabled) {
			return;
		}

		const carousel = getSceneCarousel();
		const car = getCarouselProgressState();
		const mixIds = carousel.getMixSourceTargetIds?.() ?? {};
		const hex = getHexShaderProgress();

		this._set("c.ids", `${carousel.previousId} / ${carousel.currentId} / ${carousel.nextId}`);
		this._set("c.mixIds", `${mixIds.sourceId ?? "—"} → ${mixIds.targetId ?? "—"}`);
		this._set("c.progress", fmt(car.progress));
		this._set("c.progressTarget", fmt(car.progressTarget));
		this._set("c.mix", fmt(car.mixProgress));
		this._set("c.hex", fmt(hex));
		this._set(
			"c.flags",
			[
				fmtBool(carousel.isAboutBoundaryDrive?.()),
				fmtBool(carousel.isCaseBoundaryDrive?.()),
				fmtBool(carousel.isHexNavigationActive?.()),
			].join(" / "),
		);

		const about = store.aboutExperience;
		const aboutActive = isAboutExperienceRuntimeActive() || Boolean(about?.active);
		this._set("a.active", fmtBool(aboutActive), !aboutActive);
		this._set(
			"a.story",
			`${fmt(about?.storyProgress)} / ${fmt(about?.storyProgressTarget)}`,
			!aboutActive,
		);
		this._set(
			"a.stage",
			`${fmt(about?.stageProgress)} / ${fmt(about?.stageProgressTarget)}`,
			!aboutActive,
		);
		this._set(
			"a.norm",
			`${fmt(about?.progress)} / ${fmt(about?.progressTarget)}`,
			!aboutActive,
		);
		this._set(
			"a.index",
			`${about?.activeStageIndex ?? "—"} / ${about?.activeStageId ?? "—"}`,
			!aboutActive,
		);
		const hudEnter = getAboutPanelHudEnterProgress();
		this._set(
			"a.hud",
			`${hudEnter == null ? "null" : fmt(hudEnter)} / ${fmt(getAboutPanelHudMixProgress())}`,
		);

		const pe = store.portfolioExperience;
		const caseOpen = Boolean(store.openedCase);
		const caseActive = isCaseExperienceRuntimeActive();
		const caseDim = !caseOpen && !caseActive;
		this._set("k.open", `${fmtBool(caseOpen)} / ${fmtBool(caseActive)}`, caseDim);
		this._set(
			"k.story",
			`${fmt(pe?.storyProgress)} / ${fmt(pe?.storyProgressTarget)}`,
			caseDim,
		);
		this._set(
			"k.scroll",
			`${fmt(store.scroll)} / ${fmt(store.caseScrollTarget)}`,
			caseDim,
		);
		this._set(
			"k.stage",
			`${fmt(getStageProgress())} / ${fmt(getStageProgressTarget())}`,
			caseDim,
		);
		this._set(
			"k.index",
			`${pe?.activeStateIndex ?? "—"} / ${pe?.activeStateId ?? "—"}`,
			caseDim,
		);

		this._raf = requestAnimationFrame(() => this._tick());
	}

	dispose() {
		if (this._raf) {
			cancelAnimationFrame(this._raf);
			this._raf = 0;
		}
		unregisterDevPanelHotkey(this._hotkey);
		this._detachPanelDrag?.();
		this._detachPanelDrag = null;
		this._panel?.remove();
		this._panel = null;
		this.enabled = false;
	}
}
