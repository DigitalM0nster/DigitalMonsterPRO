import { projectsData } from "../projectsData.js";
import { ensureScreenTextFonts } from "./hubScreenTextCanvas.js";
import { resolveLayer } from "./hubScreenTextConfig.js";
import { HubScreenTextLayer } from "./HubScreenTextLayer.js";
import {
	getPortfolioLocale,
	getPortfolioProjectListUppercase,
	getPortfolioProjectName,
} from "@/i18n/portfolioProjectsCopy.js";
import {
	ensureHubCanvasGlitchRouteScope,
	runHubCanvasGlitchRoute,
	setHubCanvasGlitchLayers,
	setHubCanvasGlitchEnterDeferred,
	playHubCanvasEnterFromScene,
} from "./hubCanvasGlitchRoute.js";
import { getRouteGlitchCascadeFinishMs } from "@/utils/routeGlitchConfig.js";
import { cancelRouteGlitchStagger } from "@/utils/routeGlitchRegistry.js";
import { playGlitchTextSound } from "@/sounds/soundDesign.js";
import { createGlitchTextSlots } from "@/shared/glitchText/glitchLetterModel.js";
import { getSnakeLength, getTotalSnakeDuration, resolveGlitchSnakeTimeScale } from "@/shared/glitchText/glitchSnakeEngine.js";
import { getHeroGlitchSnakeRunOptions } from "@/three/scenes/home/heroText/heroTextGlitchConfig.js";
import { getPortfolioHubGlitchConfig } from "../portfolioHubGlitchConfig.js";
import { applyHubScreenSnakeUniforms } from "./hubScreenSnakeTextMaterial.js";
import { measureWidestPortfolioProjectGlitchCanvas } from "./measurePortfolioProjectGlitchCanvas.js";
import { logPortfolioActiveDebug } from "./portfolioActiveDebug.js";

function resolveProjectLayer(project, projectIndex, columnCfg, locale = getPortfolioLocale()) {
	const defaults = columnCfg.layerDefaults ?? {};
	const textOverride = columnCfg.overrides?.[project.id]?.text;
	const listOpacity = defaults.opacity ?? 1;
	const uppercase = columnCfg.overrides?.[project.id]?.uppercase ?? getPortfolioProjectListUppercase();

	const layerDef = {
		id: `project-${project.id}`,
		...defaults,
		text: textOverride ?? getPortfolioProjectName(project.id, locale),
		uppercase,
		opacity: listOpacity,
		meta: { projectIndex, path: project.path, projectId: project.id },
	};

	return resolveLayer(layerDef, { layerDefaults: defaults });
}

/**
 * Правая колонка HUD: каждый проект — HubScreenTextLayer со своим шейдером.
 * Active-проект держится до смены или ухода с hub; змейка — при смене active.
 */
export class HubScreenProjectsColumn {
	constructor(parentGroup) {
		this.root = parentGroup;
		this.layers = [];
		this.columnCfg = null;
		this._stackVisibility = 1;
		this._activeProjectIndex = -1;
		this._pointerHitIndex = -1;
		this._glowPreviewIndex = -1;
		this._glitchAppearFallbackTimer = null;
		this._projectsIntroGlitchTimer = null;
		this._projectsIntroGlitchActive = false;
		this._projectsIntroVisualComplete = null;
		this._projectsIntroFinishedLayers = [];
	}

	_layoutStack() {
		let cursorY = 0;

		for (const layer of this.layers) {
			layer.mesh.position.set(layer.layout.width * 0.5, cursorY - layer.layout.height * 0.5, 0);
			cursorY -= layer.layout.height + layer.layout.gapAfter;
		}
	}

	/**
	 * Индекс проекта по локальной точке колонки (rightGroup).
	 * Слоты не перекрываются — в отличие от mesh при отрицательном lineGap.
	 */
	resolveProjectIndexAtLocalPoint(localX, localY) {
		let cursorY = 0;

		for (let layerIndex = 0; layerIndex < this.layers.length; layerIndex += 1) {
			const layer = this.layers[layerIndex];
			const slotTop = cursorY;
			const slotStep = layer.layout.height + layer.layout.gapAfter;
			const slotBottom = cursorY - slotStep;

			if (localY <= slotTop && localY > slotBottom) {
				const meshCenterX = layer.layout.width * 0.5;
				const halfWidth = layer.layout.width * 0.5;

				if (localX >= meshCenterX - halfWidth && localX <= meshCenterX + halfWidth) {
					return layerIndex;
				}

				return -1;
			}

			cursorY = slotBottom;
		}

		return -1;
	}

	_getLayerDefaults() {
		return this.columnCfg?.layerDefaults ?? {};
	}

	_applyLayerVisuals({ immediateOpacity = false } = {}) {
		if (this._glowPreviewIndex >= 0) {
			// Превью bloom змейки — не трогаем focus/glow, но opacity должна жить.
			this._applyOpacityFromDefaults();
			this.syncSnakeBloomUniforms();
			return;
		}

		const defaults = this._getLayerDefaults();
		const scale = this._stackVisibility;
		const listOpacity = (defaults.opacity ?? 1) * scale;
		const activeGlow = defaults.activeGlow ?? 0;
		const activeOpacity = (defaults.activeOpacity ?? 1) * scale;
		const inactiveOpacity = (defaults.inactiveOpacity ?? 0.5) * scale;
		const activeIndex = this._activeProjectIndex;
		const pointerHit = this._pointerHitIndex;

		for (let layerIndex = 0; layerIndex < this.layers.length; layerIndex += 1) {
			const layer = this.layers[layerIndex];

			if (activeIndex < 0) {
				layer.setFocusActive(false, 0, { pointerHover: false });
				layer.setLayerOpacity(listOpacity, { immediate: true });
				continue;
			}

			if (layerIndex === activeIndex) {
				layer.setFocusActive(true, activeGlow, { pointerHover: layerIndex === pointerHit });
				layer.setLayerOpacity(activeOpacity, { immediate: immediateOpacity });
			} else {
				layer.setFocusActive(false, 0, { pointerHover: false });
				layer.setLayerOpacity(inactiveOpacity, { immediate: immediateOpacity });
			}
		}

		this.syncSnakeBloomUniforms();
	}
	_applyOpacityFromDefaults() {
		const defaults = this._getLayerDefaults();
		const scale = this._stackVisibility;
		const listOpacity = (defaults.opacity ?? 1) * scale;
		const activeOpacity = (defaults.activeOpacity ?? 1) * scale;
		const inactiveOpacity = (defaults.inactiveOpacity ?? 0.5) * scale;
		const activeIndex = this._activeProjectIndex;

		for (let layerIndex = 0; layerIndex < this.layers.length; layerIndex += 1) {
			const layer = this.layers[layerIndex];

			if (activeIndex < 0) {
				layer.setLayerOpacity(listOpacity, { immediate: true });
				continue;
			}

			if (layerIndex === activeIndex) {
				layer.setLayerOpacity(activeOpacity);
			} else {
				layer.setLayerOpacity(inactiveOpacity);
			}
		}
	}

	/** Каждый кадр: курсор над пунктом (клик + pointerHover на active). */
	setPointerHitIndex(index = -1) {
		const next = index ?? -1;
		if (next === this._pointerHitIndex) {
			return;
		}

		this._pointerHitIndex = next;
		if (this._activeProjectIndex >= 0) {
			this._applyLayerVisuals();
		}
	}

	/** Липкий active — смена проекта или сброс при уходе с /portfolio. */
	setActiveProjectIndex(index = -1, { skipHoverGlitch = false, immediateOpacity = false } = {}) {
		const next = index ?? -1;
		if (next === this._activeProjectIndex) {
			return;
		}

		this._activeProjectIndex = next;
		logPortfolioActiveDebug("COLUMN_ACTIVE_CHANGED", {
			activeIndex: next,
			projectId: projectsData[next]?.id ?? null,
			skipHoverGlitch,
			immediateOpacity,
		});
		this._applyLayerVisuals({ immediateOpacity });

		if (!skipHoverGlitch && next >= 0 && next < this.layers.length) {
			const layer = this.layers[next];
			const slots = layer.glitchText?.engine?.slots;
			const fullyHidden = slots?.every((slot) => slot.isSpace || slot.appearPending);

			if (!fullyHidden) {
				layer.runHoverGlitch();
			}
		}
	}

	refreshActiveProjectVisuals() {
		this._applyLayerVisuals();
	}

	clearActiveProject() {
		if (this._activeProjectIndex < 0 && this._pointerHitIndex < 0) {
			return;
		}

		this._activeProjectIndex = -1;
		this._pointerHitIndex = -1;
		this._applyLayerVisuals();
	}

	startGlowPreview(layerIndex = 0) {
		if (layerIndex < 0 || layerIndex >= this.layers.length) {
			return;
		}

		this._glowPreviewIndex = layerIndex;
		this._applyPreviewLayerGlow();
	}

	clearGlowPreview() {
		if (this._glowPreviewIndex < 0) {
			return;
		}

		this._glowPreviewIndex = -1;
		for (const layer of this.layers) {
			layer.exitReplacementGlowPreview?.();
		}
		this._applyLayerVisuals();
		this.syncSnakeBloomUniforms();
	}

	/** HDR-bloom змейки — одинаково на всех слоях списка. */
	syncSnakeBloomUniforms(cfg = getPortfolioHubGlitchConfig()) {
		for (const layer of this.layers) {
			const snakeMaterial = layer.snakeMaterial ?? layer.material;
			if (!snakeMaterial) {
				continue;
			}
			applyHubScreenSnakeUniforms(snakeMaterial, cfg);
		}
	}

	_applyPreviewLayerGlow(cfg = getPortfolioHubGlitchConfig()) {
		const index = this._glowPreviewIndex;
		if (index < 0 || index >= this.layers.length) {
			return;
		}

		for (let layerIndex = 0; layerIndex < this.layers.length; layerIndex += 1) {
			if (layerIndex !== index) {
				this.layers[layerIndex]?.exitReplacementGlowPreview?.();
			}
		}

		const layer = this.layers[index];
		if (!layer?.glitchText) {
			return;
		}

		this.syncSnakeBloomUniforms(cfg);
		layer.enterReplacementGlowPreview();
	}

	/** Live-tune змейки (dev-панель). */
	applySnakeGlowConfig(cfg = getPortfolioHubGlitchConfig()) {
		for (const layer of this.layers) {
			layer.applySnakeGlowConfig?.(cfg);
			layer.glitchText?.drawInPlace?.();
		}

		this.syncSnakeBloomUniforms(cfg);

		if (this._glowPreviewIndex >= 0) {
			this._applyPreviewLayerGlow(cfg);
		}
	}

	async build(columnCfg, { glitchIntro = true } = {}) {
		this.dispose();
		this.columnCfg = columnCfg;

		if (columnCfg.enabled === false) {
			return;
		}

		const layerDefs = projectsData.map((project, projectIndex) =>
			resolveProjectLayer(project, projectIndex, columnCfg),
		);

		await ensureScreenTextFonts(layerDefs);

		for (let projectIndex = 0; projectIndex < layerDefs.length; projectIndex += 1) {
			const project = projectsData[projectIndex];
			const stableCanvas = measureWidestPortfolioProjectGlitchCanvas(project.id, layerDefs[projectIndex]);
			layerDefs[projectIndex].stableCanvasWidth = stableCanvas.width;
			layerDefs[projectIndex].stableCanvasHeight = stableCanvas.height;
		}

		for (const layerDef of layerDefs) {
			const layer = new HubScreenTextLayer().build(layerDef, columnCfg.lineGap, {
				initialHidden: glitchIntro,
			});
			this.layers.push(layer);
			this.root.add(layer.mesh);
		}

		this._layoutStack();
		this._applyLayerVisuals();

		setHubCanvasGlitchLayers(this.layers);
		ensureHubCanvasGlitchRouteScope();
		setHubCanvasGlitchEnterDeferred(glitchIntro);
	}

	_syncAllLayersGlitchHidden() {
		for (const layer of this.layers) {
			layer.syncGlitchTextureHidden?.();
		}
	}

	/** Пометить canvas-текстуры для upload на GPU после prepareAppear. */
	_flushGlitchTexturesToGpu() {
		for (const layer of this.layers) {
			layer._markTexturesDirty?.({ main: true, snake: true });
		}
	}

	playEnterGlitch({ onComplete } = {}) {
		this._clearGlitchAppearFallback();
		this._syncAllLayersGlitchHidden();
		this._flushGlitchTexturesToGpu();
		this._projectsIntroVisualComplete = typeof onComplete === "function" ? onComplete : null;
		this._projectsIntroFinishedLayers = this.layers.map(() => false);
		logPortfolioActiveDebug("SNAKE_STARTED", { itemCount: this.layers.length });
		this._markProjectsIntroGlitchActive();
		playHubCanvasEnterFromScene();
		this._scheduleGlitchAppearFallback();
	}

	playExitGlitch() {
		this._clearGlitchAppearFallback();
		this._projectsIntroVisualComplete = null;
		this.clearActiveProject();
		const listOpacity = (this._getLayerDefaults().opacity ?? 1) * this._stackVisibility;
		for (const layer of this.layers) {
			layer.setFocusActive(false, 0, { pointerHover: false });
			layer.setLayerOpacity(listOpacity, { immediate: true });
		}
		runHubCanvasGlitchRoute("exit");
	}

	stashLayersHiddenForDormant() {
		this._clearGlitchAppearFallback();
		this._projectsIntroVisualComplete = null;
		this._clearProjectsIntroGlitchTimer();
		this._projectsIntroGlitchActive = false;
		cancelRouteGlitchStagger("portfolioHub");
		this._syncAllLayersGlitchHidden();
		this._flushGlitchTexturesToGpu();
	}

	_clearProjectsIntroGlitchTimer() {
		if (this._projectsIntroGlitchTimer) {
			clearTimeout(this._projectsIntroGlitchTimer);
			this._projectsIntroGlitchTimer = null;
		}
	}

	/** Enter-каскад змейки — bloom сцены не должен ждать 2s grid enter. */
	_markProjectsIntroGlitchActive() {
		this._clearProjectsIntroGlitchTimer();
		this._projectsIntroGlitchActive = true;

		const finishMs = getRouteGlitchCascadeFinishMs("portfolioHub", "enter", this.layers.length);
		this._projectsIntroGlitchTimer = setTimeout(() => {
			this._projectsIntroGlitchTimer = null;
			this._projectsIntroGlitchActive = false;
		}, finishMs + 100);
	}

	isProjectsIntroGlitchActive() {
		return this._projectsIntroGlitchActive;
	}

	_clearGlitchAppearFallback() {
		if (this._glitchAppearFallbackTimer) {
			clearTimeout(this._glitchAppearFallbackTimer);
			this._glitchAppearFallbackTimer = null;
		}
	}

	_scheduleGlitchAppearFallback() {
		this._clearGlitchAppearFallback();
		const finishMs = getRouteGlitchCascadeFinishMs("portfolioHub", "enter", this.layers.length);
		this._glitchAppearFallbackTimer = setTimeout(() => {
			this._glitchAppearFallbackTimer = null;
			for (const layer of this.layers) {
				layer.glitchText?.ensureVisible?.();
				layer._markTexturesDirty?.({ main: true, snake: true });
			}
		}, finishMs + 80);
	}

	patchLayerDefaults(partial = {}) {
		if (!this.columnCfg?.layerDefaults) {
			return;
		}

		Object.assign(this.columnCfg.layerDefaults, partial);

		for (const layer of this.layers) {
			if (!layer.layerCfg) {
				continue;
			}
			if (partial.activeColor !== undefined) {
				layer.layerCfg.activeColor = partial.activeColor;
			}
			if (partial.color !== undefined) {
				layer.layerCfg.color = partial.color;
			}
			if (partial.opacity !== undefined) {
				layer.layerCfg.opacity = partial.opacity;
			}
			if (partial.planeHeight !== undefined) {
				layer.setPlaneHeight(partial.planeHeight);
			}
		}

		this._applyLayerVisuals();

		if (partial.planeHeight !== undefined) {
			this._layoutStack();
		}
	}

	relayout(lineGap = this.columnCfg?.lineGap) {
		if (lineGap === undefined) {
			return;
		}

		if (this.columnCfg) {
			this.columnCfg.lineGap = lineGap;
		}

		for (const layer of this.layers) {
			layer.layout.gapAfter = lineGap;
		}

		this._layoutStack();
	}

	setStackVisibility(multiplier = 1) {
		this._stackVisibility = Math.max(0, Math.min(1, multiplier));
		this._applyLayerVisuals();
	}

	updateAnimations(nowMs = performance.now()) {
		for (const layer of this.layers) {
			layer.updateLayerOpacity(nowMs);
		}

		if (!this._projectsIntroVisualComplete) {
			return;
		}

		const layerFinishedStates = this.layers.map((layer, index) => {
			const engine = layer.glitchText?.engine;
			if (!engine || engine.hasActiveAnimation()) {
				return false;
			}

			const finished = engine.slots.every(
				(slot) => slot.isSpace || (!slot.appearPending && slot.mainAlpha >= 0.999),
			);
			if (finished && !this._projectsIntroFinishedLayers[index]) {
				this._projectsIntroFinishedLayers[index] = true;
				logPortfolioActiveDebug("SNAKE_ITEM_FINISHED", {
					index,
					projectId: projectsData[index]?.id ?? null,
				});
			}
			return finished;
		});
		const allIntroAnimationsFinished = layerFinishedStates.every(Boolean);
		if (allIntroAnimationsFinished) {
			logPortfolioActiveDebug("SNAKE_ALL_FINISHED", {
				activeIndexBeforeCommit: this._activeProjectIndex,
			});
			const onComplete = this._projectsIntroVisualComplete;
			this._projectsIntroVisualComplete = null;
			onComplete();
		}
	}

	/** Смена языка названий проектов (змейка на каждом слое, как hero subtitle). */
	async switchLocale(locale = getPortfolioLocale()) {
		if (this.layers.length === 0) {
			return;
		}

		const runOptions = getHeroGlitchSnakeRunOptions({ playSound: false });
		const uppercase = getPortfolioProjectListUppercase();
		const timing = {
			delayBetweenLetters: runOptions.delayBetweenLetters,
			delayBetweenSymbols: runOptions.delayBetweenSymbols,
			mainLetterFadeMs: runOptions.mainLetterFadeMs,
		};
		const overlapRatio = Math.max(0, Math.min(1, runOptions.appearOverlapRatio ?? 0.9));
		let maxSwitchDuration = 0;

		for (const project of projectsData) {
			const nextText = getPortfolioProjectName(project.id, locale);
			const letterSlots = createGlitchTextSlots(nextText, uppercase).filter((slot) => !slot.isSpace);
			const snakeLength = getSnakeLength(letterSlots.length);
			const naturalDuration = getTotalSnakeDuration(letterSlots, snakeLength, 1, timing);
			const timeScale = resolveGlitchSnakeTimeScale(naturalDuration, runOptions);
			const waveDuration = getTotalSnakeDuration(letterSlots, snakeLength, timeScale, timing);
			const totalDuration = Math.round(waveDuration * overlapRatio) + waveDuration;
			maxSwitchDuration = Math.max(maxSwitchDuration, totalDuration);
		}

		if (maxSwitchDuration > 0) {
			playGlitchTextSound(maxSwitchDuration, "hover");
		}

		await Promise.all(
			this.layers.map((layer, projectIndex) => {
				const project = projectsData[projectIndex];
				if (!project) {
					return Promise.resolve();
				}

				const nextText = getPortfolioProjectName(project.id, locale);

				return layer.switchLocaleWithSnake(nextText, { uppercase, playSound: false });
			}),
		);
	}

	dispose() {
		this._clearGlitchAppearFallback();
		this._projectsIntroVisualComplete = null;
		this._clearProjectsIntroGlitchTimer();
		this._projectsIntroGlitchActive = false;
		cancelRouteGlitchStagger("portfolioHub");
		runHubCanvasGlitchRoute("exit");
		this._glowPreviewIndex = -1;
		this._activeProjectIndex = -1;
		this._pointerHitIndex = -1;

		for (const layer of this.layers) {
			if (layer.mesh) {
				this.root.remove(layer.mesh);
			}
			layer.dispose();
		}
		this.layers = [];
		this.columnCfg = null;
	}
}
