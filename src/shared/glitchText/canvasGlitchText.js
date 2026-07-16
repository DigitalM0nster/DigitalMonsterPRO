import { createGlitchTextSlots } from "./glitchLetterModel.js";
import { GlitchSnakeEngine } from "./glitchSnakeEngine.js";
import { getHeroGlitchSnakeRunOptions } from "@/three/scenes/home/heroText/heroTextGlitchConfig.js";
import { HeroTextGlitchController } from "@/three/scenes/home/heroText/HeroTextGlitchController.js";
import {
	drawCanvasGlitchText,
	GLITCH_REPLACEMENT_SHADOW_BLUR,
	REPLACEMENT_GLOW_STRENGTH_MAX,
	measureCanvasGlitchTextSize,
} from "./drawCanvasGlitchText.js";

const MIN_CANVAS_WIDTH = 240;
const MIN_CANVAS_HEIGHT = 64;

/**
 * @typedef {object} CanvasGlitchTextOptions
 * @property {string} text
 * @property {boolean} [uppercase]
 * @property {number} [fontSize]
 * @property {number} [fontWeight]
 * @property {number} [letterSpacing]
 * @property {string} [color]
 * @property {number} [paddingLeft]
 * @property {number} [paddingTop]
 * @property {number} [paddingRight]
 * @property {number} [paddingBottom]
 * @property {boolean} [initialHidden]
 * @property {number} [replacementShadowBlur]
 * @property {number} [replacementGlowStrength]
 * @property {number} [replacementHaloAlpha]
 * @property {number} [passedLetterHighlightAlpha]
 * @property {number} [maxReplacementShadowBlur]
 * @property {number} [stableCanvasWidth]
 * @property {number} [stableCanvasHeight]
 * @property {number} [pixelRatio] Device pixel ratio for sharp compositing into DPR canvases
 * @property {'hud' | 'hero' | 'caseStudyNav'} [drawProfile]
 * @property {string} [fontFamily]
 * @property {boolean} [splitCanvases]
 * @property {(flags: { main?: boolean, snake?: boolean }) => void} [onRedraw]
 */

/**
 * Canvas-аналог HTML GlitchText: те же тайминги змейки и символы замены.
 * API совместим с ref GlitchText (playAppear / playDisappear / restoreVisible) + runHover.
 */
export class CanvasGlitchText {
	/** @param {CanvasGlitchTextOptions} options */
	constructor(options) {
		this.options = {
			text: String(options.text ?? ""),
			uppercase: options.uppercase !== false,
			fontSize: options.fontSize ?? 28,
			fontWeight: options.fontWeight ?? 500,
			letterSpacing: options.letterSpacing ?? 0,
			color: options.color ?? "#ffffff",
			paddingLeft: options.paddingLeft ?? 24,
			paddingTop: options.paddingTop ?? 12,
			paddingRight: options.paddingRight ?? 24,
			paddingBottom: options.paddingBottom ?? 12,
			replacementShadowBlur: options.replacementShadowBlur ?? GLITCH_REPLACEMENT_SHADOW_BLUR,
			replacementGlowStrength: options.replacementGlowStrength ?? 1,
			replacementHaloAlpha: options.replacementHaloAlpha,
			maxReplacementShadowBlur: options.maxReplacementShadowBlur ?? options.replacementShadowBlur ?? GLITCH_REPLACEMENT_SHADOW_BLUR,
			stableCanvasWidth: options.stableCanvasWidth ?? null,
			stableCanvasHeight: options.stableCanvasHeight ?? null,
			drawProfile: options.drawProfile ?? "hud",
			fontFamily: options.fontFamily ?? null,
			passedLetterHighlightAlpha: options.passedLetterHighlightAlpha ?? 0,
		};

		const rawPr = Number(options.pixelRatio);
		this.pixelRatio = Number.isFinite(rawPr) && rawPr > 0 ? rawPr : 1;
		/** CSS-space size of the bitmap (canvas.width / pixelRatio). */
		this._cssWidth = MIN_CANVAS_WIDTH;
		this._cssHeight = MIN_CANVAS_HEIGHT;

		this.canvas = document.createElement("canvas");
		this.ctx = this.canvas.getContext("2d");
		this.splitCanvases = options.splitCanvases === true;
		if (this.splitCanvases) {
			this.snakeCanvas = document.createElement("canvas");
			this.snakeCtx = this.snakeCanvas.getContext("2d");
		} else {
			this.snakeCanvas = null;
			this.snakeCtx = null;
		}
		this.slots = createGlitchTextSlots(this.options.text, this.options.uppercase);
		this.onRedraw = options.onRedraw;
		this._glowPreviewActive = false;
		this._mainOpacity = 1;
		this._replacementFullOpacity = false;
		/** Coalesce snake onChange → max 1 Canvas2D draw + texture upload per frame. */
		this._drawCoalesceRaf = 0;
		this._pendingDrawLayer = null;
		/** @type {HeroTextGlitchController | null} */
		this._localeSwitchController = null;
		this.engine = new GlitchSnakeEngine(() => {
			this._requestDrawInPlace("both");
		});

		this.engine.setSlots(this.slots);

		if (options.initialHidden) {
			this.engine.prepareAppear();
		} else {
			this.redraw();
		}
	}

	/**
	 * Keep cache resolution in sync with the destination canvas DPR.
	 * @param {number} pixelRatio
	 */
	setPixelRatio(pixelRatio) {
		const next = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
		if (Math.abs(next - this.pixelRatio) < 0.001) {
			return;
		}
		this.pixelRatio = next;
		this.ensureCanvasSize();
		this.drawInPlace();
	}

	/**
	 * Batch snake engine redraws into one rAF tick (intro/hover letter storms).
	 * @param {'both' | 'main' | 'snake'} layer
	 */
	_requestDrawInPlace(layer = "both") {
		if (this._pendingDrawLayer == null) {
			this._pendingDrawLayer = layer;
		} else if (this._pendingDrawLayer !== layer) {
			this._pendingDrawLayer = "both";
		}

		if (this._drawCoalesceRaf) {
			return;
		}

		this._drawCoalesceRaf = requestAnimationFrame(() => {
			this._drawCoalesceRaf = 0;
			const pending = this._pendingDrawLayer ?? "both";
			this._pendingDrawLayer = null;
			this.drawInPlace(pending);
		});
	}

	_cancelPendingDrawInPlace() {
		if (this._drawCoalesceRaf) {
			cancelAnimationFrame(this._drawCoalesceRaf);
			this._drawCoalesceRaf = 0;
		}
		this._pendingDrawLayer = null;
	}

	getDrawStyle() {
		return {
			fontSize: this.options.fontSize,
			fontWeight: this.options.fontWeight,
			letterSpacing: this.options.letterSpacing,
			color: this.options.color,
			fontFamily: this.options.fontFamily ?? undefined,
			drawProfile: this.options.drawProfile,
			paddingLeft: this.options.paddingLeft,
			paddingTop: this.options.paddingTop,
			paddingRight: this.options.paddingRight,
			paddingBottom: this.options.paddingBottom,
			replacementShadowBlur: this.options.replacementShadowBlur,
			replacementGlowStrength: this.options.replacementGlowStrength,
			replacementHaloAlpha: this.options.replacementHaloAlpha,
			replacementGlowPreview: this._glowPreviewActive,
			mainOpacity: this._mainOpacity,
			replacementFullOpacity: this._replacementFullOpacity,
			passedLetterHighlightAlpha: this.options.passedLetterHighlightAlpha,
		};
	}

	/**
	 * Прозрачность в canvas: при hover основные буквы плавно → 1, второстепенные сразу 1.
	 * @param {{ mainOpacity?: number, replacementFullOpacity?: boolean }} params
	 */
	setDrawOpacity({ mainOpacity = 1, replacementFullOpacity = false } = {}) {
		const nextMain = Math.max(0, Math.min(1, mainOpacity));
		const changed = this._mainOpacity !== nextMain || this._replacementFullOpacity !== replacementFullOpacity;

		this._mainOpacity = nextMain;
		this._replacementFullOpacity = replacementFullOpacity;

		if (changed) {
			this.drawInPlace(this.splitCanvases ? "main" : "both");
		}
	}

	_notifyRedraw(flags = { main: true, snake: true }) {
		this.onRedraw?.(flags);
	}

	_drawToContext(ctx, slots, style, drawOptions = {}) {
		if (!ctx) {
			return;
		}

		const dpr = this.pixelRatio;
		const shouldClear = drawOptions.clear !== false;
		if (shouldClear) {
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
		}
		if (dpr !== 1) {
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		} else {
			ctx.setTransform(1, 0, 0, 1, 0, 0);
		}
		drawCanvasGlitchText(ctx, slots, style, { ...drawOptions, clear: false });
	}

	/** Dev-preview: показать второстепенные буквы с текущим glow. */
	enterReplacementGlowPreview() {
		if (this._glowPreviewActive) {
			this.drawInPlace(this.splitCanvases ? "snake" : "both");
			return;
		}

		this._glowPreviewActive = true;
		this.engine.abort();
		this.drawInPlace(this.splitCanvases ? "snake" : "both");
	}

	exitReplacementGlowPreview() {
		if (!this._glowPreviewActive) {
			return;
		}

		this._glowPreviewActive = false;
		this.engine.restoreVisible();
		this.drawInPlace(this.splitCanvases ? "snake" : "both");
	}

	get isReplacementGlowPreviewActive() {
		return this._glowPreviewActive;
	}

	getMeasureStyle() {
		return {
			...this.getDrawStyle(),
			replacementGlowStrength: Math.max(this.options.replacementGlowStrength ?? 1, REPLACEMENT_GLOW_STRENGTH_MAX),
		};
	}

	/** Перерисовка без смены размера canvas — кадры змейки. @param {'both' | 'main' | 'snake'} [layer] */
	drawInPlace(layer = "both") {
		if (!this.ctx) {
			return;
		}

		if (this._localeSwitchController) {
			this._drawLocaleSwitchFrames(this._localeSwitchController);
			return;
		}

		const style = this.getDrawStyle();

		if (!this.splitCanvases) {
			this._drawToContext(this.ctx, this.slots, style, { clear: true, layer: "both" });
			this._notifyRedraw({ main: true, snake: false });
			return;
		}

		const drawMain = layer === "both" || layer === "main";
		const drawSnake = layer === "both" || layer === "snake";

		if (drawMain) {
			this._drawToContext(this.ctx, this.slots, style, { clear: true, layer: "main" });
		}

		if (drawSnake) {
			this._drawToContext(this.snakeCtx, this.slots, style, { clear: true, layer: "snake" });
		}

		this._notifyRedraw({ main: drawMain, snake: drawSnake });
	}

	/** Рисует текущее состояние змейки в чужой canvas без очистки destination. */
	drawAt(ctx, x, y, styleOverrides = {}) {
		if (!ctx) {
			return;
		}

		const style = { ...this.getDrawStyle(), ...styleOverrides };
		const controller = this._localeSwitchController;
		const groups = controller
			? [...controller.primaryGroups, ...(controller.secondaryGroups ?? [])]
			: [{ slots: this.slots }];

		for (const group of groups) {
			drawCanvasGlitchText(
				ctx,
				group.slots,
				{ ...style, paddingLeft: x, paddingTop: y },
				{ clear: false, layer: "both" },
			);
		}
	}

	/**
	 * Composite the already-rendered compact canvas instead of recalculating
	 * every glyph and its glow on a large destination canvas.
	 */
	drawCachedAt(ctx, x, y, styleOverrides = {}) {
		if (!ctx) {
			return;
		}

		let cacheChanged = false;
		for (const key of [
			"fontSize",
			"fontWeight",
			"letterSpacing",
			"fontFamily",
			"color",
			"replacementGlowStrength",
			"replacementShadowBlur",
			"replacementHaloAlpha",
			"passedLetterHighlightAlpha",
		]) {
			if (styleOverrides[key] !== undefined && this.options[key] !== styleOverrides[key]) {
				this.options[key] = styleOverrides[key];
				cacheChanged = true;
			}
		}

		if (cacheChanged) {
			this.ensureCanvasSize();
			this.drawInPlace();
		}

		const dx = x - this.options.paddingLeft;
		const dy = y - this.options.paddingTop;
		// Destination ctx is usually DPR-transformed (CSS units). Draw the hi-res
		// cache into CSS box size so it stays 1:1 with device pixels — no upscale blur.
		ctx.drawImage(this.canvas, dx, dy, this._cssWidth, this._cssHeight);
	}

	_drawLocaleSwitchFrames(controller) {
		if (!this.ctx) {
			return;
		}

		const style = this.getDrawStyle();

		if (!this.splitCanvases) {
			this.ctx.setTransform(1, 0, 0, 1, 0, 0);
			this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
			for (const group of controller.primaryGroups) {
				this._drawToContext(this.ctx, group.slots, style, { clear: false, layer: "both" });
			}
			for (const group of controller.secondaryGroups ?? []) {
				this._drawToContext(this.ctx, group.slots, style, { clear: false, layer: "both" });
			}
			this._notifyRedraw({ main: true, snake: false });
			return;
		}

		this.ctx.setTransform(1, 0, 0, 1, 0, 0);
		this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
		this.snakeCtx.setTransform(1, 0, 0, 1, 0, 0);
		this.snakeCtx.clearRect(0, 0, this.snakeCanvas.width, this.snakeCanvas.height);

		for (const group of controller.primaryGroups) {
			this._drawToContext(this.ctx, group.slots, style, { clear: false, layer: "main" });
			this._drawToContext(this.snakeCtx, group.slots, style, { clear: false, layer: "snake" });
		}

		for (const group of controller.secondaryGroups ?? []) {
			this._drawToContext(this.ctx, group.slots, style, { clear: false, layer: "main" });
			this._drawToContext(this.snakeCtx, group.slots, style, { clear: false, layer: "snake" });
		}

		this._notifyRedraw({ main: true, snake: true });
	}

	_abortLocaleSwitch() {
		this._localeSwitchController?.dispose();
		this._localeSwitchController = null;
	}

	ensureCanvasSize(primarySlots = this.slots, secondarySlots = null) {
		if (!this.ctx) {
			return;
		}

		const dpr = this.pixelRatio;
		const stableWidth = this.options.stableCanvasWidth;
		const stableHeight = this.options.stableCanvasHeight;

		if (stableWidth && stableHeight) {
			this._cssWidth = stableWidth;
			this._cssHeight = stableHeight;
			const pixelW = Math.max(1, Math.round(stableWidth * dpr));
			const pixelH = Math.max(1, Math.round(stableHeight * dpr));
			if (this.canvas.width !== pixelW) {
				this.canvas.width = pixelW;
			}
			if (this.canvas.height !== pixelH) {
				this.canvas.height = pixelH;
			}
			if (this.splitCanvases && this.snakeCanvas) {
				if (this.snakeCanvas.width !== pixelW) {
					this.snakeCanvas.width = pixelW;
				}
				if (this.snakeCanvas.height !== pixelH) {
					this.snakeCanvas.height = pixelH;
				}
			}
			return;
		}

		// Measure in CSS px (identity transform).
		this.ctx.setTransform(1, 0, 0, 1, 0, 0);
		const style = this.getMeasureStyle();
		let measured = measureCanvasGlitchTextSize(this.ctx, primarySlots, style);

		if (secondarySlots) {
			const secondaryMeasured = measureCanvasGlitchTextSize(this.ctx, secondarySlots, style);
			measured = {
				width: Math.max(measured.width, secondaryMeasured.width),
				height: Math.max(measured.height, secondaryMeasured.height),
			};
		}

		const cssW = Math.max(MIN_CANVAS_WIDTH, measured.width);
		const cssH = Math.max(MIN_CANVAS_HEIGHT, measured.height);
		this._cssWidth = cssW;
		this._cssHeight = cssH;
		const nextWidth = Math.max(1, Math.round(cssW * dpr));
		const nextHeight = Math.max(1, Math.round(cssH * dpr));

		if (this.canvas.width !== nextWidth) {
			this.canvas.width = nextWidth;
		}

		if (this.canvas.height !== nextHeight) {
			this.canvas.height = nextHeight;
		}

		if (this.splitCanvases && this.snakeCanvas) {
			if (this.snakeCanvas.width !== nextWidth) {
				this.snakeCanvas.width = nextWidth;
			}
			if (this.snakeCanvas.height !== nextHeight) {
				this.snakeCanvas.height = nextHeight;
			}
		}
	}

	/** Максимальный blur — резерв высоты canvas под activeGlow. */
	setMaxReplacementShadowBlur(blur = GLITCH_REPLACEMENT_SHADOW_BLUR) {
		const next = Math.max(GLITCH_REPLACEMENT_SHADOW_BLUR, blur);
		if (this.options.maxReplacementShadowBlur === next) {
			return;
		}

		this.options.maxReplacementShadowBlur = next;
		this.ensureCanvasSize();
		this.drawInPlace();
	}

	/** @param {{ blur?: number, strength?: number, force?: boolean }} params */
	setReplacementGlow({ blur, strength, force = false } = {}) {
		let changed = false;

		if (blur !== undefined && this.options.replacementShadowBlur !== blur) {
			this.options.replacementShadowBlur = blur;
			changed = true;
		}

		if (strength !== undefined && this.options.replacementGlowStrength !== strength) {
			this.options.replacementGlowStrength = strength;
			changed = true;
		}

		if (!changed && !force) {
			return;
		}

		this.drawInPlace(this.splitCanvases ? "snake" : "both");
	}

	/** @deprecated — используй setReplacementGlow */
	setReplacementShadowBlur(blur = GLITCH_REPLACEMENT_SHADOW_BLUR) {
		this.setReplacementGlow({ blur });
	}

	getCanvasMetrics() {
		if (!this.ctx) {
			return {
				canvas: this.canvas,
				snakeCanvas: this.snakeCanvas,
				aspect: MIN_CANVAS_WIDTH / MIN_CANVAS_HEIGHT,
			};
		}

		this.ensureCanvasSize();
		this.drawInPlace("both");

		return {
			canvas: this.canvas,
			snakeCanvas: this.snakeCanvas,
			aspect: this.canvas.width / Math.max(this.canvas.height, 1),
		};
	}

	redraw() {
		return this.getCanvasMetrics();
	}

	setMainColor(color) {
		const next = String(color ?? "#ffffff");
		if (this.options.color === next) {
			return;
		}

		this.options.color = next;
		this.drawInPlace(this.splitCanvases ? "main" : "both");
	}

	setText(text, uppercase = this.options.uppercase) {
		this._abortLocaleSwitch();
		this.options.text = String(text);
		this.options.uppercase = uppercase;
		this.engine.abort();
		this.slots = createGlitchTextSlots(this.options.text, this.options.uppercase);
		this.engine.setSlots(this.slots);
		return this.redraw();
	}

	/**
	 * Replace text and keep glyphs hidden for a following playAppear.
	 * Avoids a 1-frame flash of the full next string after disappear.
	 */
	setTextForAppear(text, uppercase = this.options.uppercase) {
		this._abortLocaleSwitch();
		this._cancelPendingDrawInPlace();
		this.options.text = String(text);
		this.options.uppercase = uppercase;
		this.engine.abort();
		this._cancelPendingDrawInPlace();
		this.slots = createGlitchTextSlots(this.options.text, this.options.uppercase);
		this.engine.setSlots(this.slots);
		this.prepareAppear();
		this._cancelPendingDrawInPlace();
		this.drawInPlace();
		return this;
	}

	/** Смена текста змейкой — тот же HeroTextGlitchController, что на главной. */
	switchLocaleWithSnake(nextText, options = {}) {
		this._abortLocaleSwitch();
		this.exitReplacementGlowPreview();

		const runOptions = getHeroGlitchSnakeRunOptions(options);
		const uppercase = options.uppercase ?? this.options.uppercase;
		const nextValue = String(nextText);

		this.ensureCanvasSize();

		const controller = new HeroTextGlitchController({
			uppercase,
			onRedraw: () => this._drawLocaleSwitchFrames(controller),
		});
		controller.primaryGroups = [{ engine: this.engine, slots: this.slots }];
		this._localeSwitchController = controller;

		return controller.runLanguageSwitch([nextValue], runOptions).then(() => {
			const group = controller.primaryGroups[0];
			this.engine = group.engine;
			this.slots = group.slots;
			this.options.text = nextValue;
			this.options.uppercase = uppercase;
			this._localeSwitchController = null;
			this.ensureCanvasSize();
			this.drawInPlace();
		});
	}

	prepareAppear() {
		this.engine.prepareAppear();
	}

	restoreVisible() {
		this.engine.restoreVisible();
	}

	/** Если appear не стартовал — показать текст (fallback после race с route enter). */
	ensureVisible() {
		const hasHidden = this.engine.slots.some((slot) => !slot.isSpace && slot.appearPending);
		if (!hasHidden || this.engine.hasActiveAnimation()) {
			return;
		}

		this.restoreVisible();
	}

	runHover(options = {}) {
		this.exitReplacementGlowPreview();
		return this.engine.run("hover", options);
	}

	clearHoverPassed() {
		this.engine.clearHoverPassed();
	}

	/** @param {number} [timeBudgetMs] */
	playAppear(timeBudgetMs) {
		return this.engine.run("appear", { timeBudgetMs });
	}

	/** @param {number} [timeBudgetMs] */
	playDisappear(timeBudgetMs) {
		return this.engine.run("disappear", { timeBudgetMs });
	}

	dispose() {
		this._cancelPendingDrawInPlace();
		this._abortLocaleSwitch();
		this.engine.abort();
	}
}

export default CanvasGlitchText;
