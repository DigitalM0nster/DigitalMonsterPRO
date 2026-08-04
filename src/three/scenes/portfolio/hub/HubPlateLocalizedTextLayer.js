import * as THREE from "three";
import { createGlitchTextSlots } from "@/components/GlitchText/glitchLetterModel.js";
import { GlitchSnakeEngine } from "@/components/GlitchText/glitchSnakeEngine.js";
import { drawGlitchTextLine } from "@/components/GlitchText/drawGlitchText.js";
import {
	estimateLanguageSwitchDuration,
	estimateLanguageSwitchPhases,
} from "@/three/scenes/home/heroText/HeroTextGlitchController.js";
import {
	applyHubPlateLabelLocaleTransition,
	applyHubPlateLabelRevealUniforms,
	createHubPlateLabelMaterial,
} from "./hubPlateLabelMaterial.js";
import {
	applyHubScreenSnakeLocaleTransition,
	applyHubScreenSnakeOpacity,
	applyHubScreenSnakeUniforms,
	createHubScreenSnakeTextMaterial,
} from "./screenTitle/hubScreenSnakeTextMaterial.js";

const SPACE_WIDTH_EM = 0.35;
const LETTER_ORDER_VALUE_MIN = 0.08;
const LETTER_ORDER_VALUE_RANGE = 0.88;
const PACKED_REPLACEMENT_FRAME_COUNT = 3;
const PACKED_ATLAS_HEIGHT_SCALE = 2;

function clamp01(value) {
	return Math.max(0, Math.min(1, value));
}

function normalizeLines(lines = []) {
	return lines
		.map((line) => ({ ...line, text: String(line?.text ?? "").trim() }))
		.filter((line) => line.text.length > 0);
}

function haveSameLines(currentLines, nextLines) {
	if (currentLines.length !== nextLines.length) {
		return false;
	}
	for (let index = 0; index < currentLines.length; index += 1) {
		const current = currentLines[index];
		const next = nextLines[index];
		const keys = new Set([...Object.keys(current), ...Object.keys(next)]);
		for (const key of keys) {
			if (!Object.is(current[key], next[key])) {
				return false;
			}
		}
	}
	return true;
}

function createCanvas(width, height, pixelRatio) {
	const canvas = document.createElement("canvas");
	canvas.width = Math.max(1, Math.round(width * pixelRatio));
	canvas.height = Math.max(1, Math.round(height * pixelRatio));
	return canvas;
}

function createCanvasTexture(canvas) {
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.minFilter = THREE.LinearFilter;
	texture.magFilter = THREE.LinearFilter;
	texture.generateMipmaps = false;
	texture.needsUpdate = true;
	return texture;
}

function createLetterOrderTexture(canvas) {
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.NoColorSpace;
	texture.minFilter = THREE.NearestFilter;
	texture.magFilter = THREE.NearestFilter;
	texture.generateMipmaps = false;
	texture.needsUpdate = true;
	return texture;
}

function resetContext(ctx, pixelRatio) {
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
	ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
}

function createGlitchGroup(line, onRedraw) {
	const slots = createGlitchTextSlots(line.text, false);
	const engine = new GlitchSnakeEngine(onRedraw);
	engine.setSlots(slots);
	return { engine, slots };
}

function easeInOutCubic(value) {
	const progress = clamp01(value);
	return progress < 0.5
		? 4 * progress * progress * progress
		: 1 - Math.pow(-2 * progress + 2, 3) / 2;
}

function measureSlotsWidth(ctx, slots, style) {
	const fontSize = style.fontSize ?? 16;
	const letterSpacing = fontSize * (style.letterSpacing ?? 0);
	const fontFamily = style.fontFamily ?? 'ManifoldExtended, "Segoe UI", sans-serif';
	ctx.font = `${style.fontWeight ?? 500} ${fontSize}px ${fontFamily}`;

	let width = 0;
	for (let index = 0; index < slots.length; index += 1) {
		const slot = slots[index];
		if (slot.isSpace) {
			width += fontSize * SPACE_WIDTH_EM;
			continue;
		}
		width += ctx.measureText(slot.char).width;
		if (index < slots.length - 1) {
			width += letterSpacing;
		}
	}
	return width;
}

/**
 * Compact localized text atlas for the selected case panel.
 *
 * The current and next locale are rasterized once into two compact atlases.
 * The visible glitch-snake then runs entirely in the plate shader: runtime
 * frames update one progress uniform and never repaint or upload CanvasTexture
 * pixels. Both atlases are projected through a UV rectangle on the plate's
 * real curved front geometry.
 */
export class HubPlateLocalizedTextLayer {
	constructor({
		name,
		parent,
		geometry,
		panelWidth,
		panelHeight,
		rect,
		lines,
		pixelRatio = 1.5,
		opacity = 1,
		bloomBoost = 1,
		revealSeed = 0,
		revealConfig = {},
		renderOrder = 35,
		z = 0.0015,
		hover = null,
	}) {
		this.name = name;
		this.parent = parent;
		this.geometry = geometry;
		this.rect = { ...rect };
		this.pixelRatio = Math.max(1, pixelRatio);
		this.opacity = opacity;
		this.revealConfig = revealConfig;
		this.currentLines = normalizeLines(lines);
		this.currentGroups = [];
		this.nextLines = null;
		this.nextGroups = null;
		this._transitionRaf = 0;
		this._transitionResolve = null;
		this._transitionId = 0;
		this._disposed = false;
		this._localeSnakeActive = false;
		this._snakeTextureHasPixels = false;

		// Both atlases keep the full-resolution clean locale in their upper half.
		// The lower half contains all three canonical GlitchSnake replacement
		// symbols as half-resolution frames (2x2 packing, one cell unused). This
		// preserves the real E -> O -> A style cascade without runtime texture uploads.
		this.mainCanvas = createCanvas(
			rect.width,
			rect.height * PACKED_ATLAS_HEIGHT_SCALE,
			this.pixelRatio,
		);
		this.snakeCanvas = createCanvas(
			rect.width,
			rect.height * PACKED_ATLAS_HEIGHT_SCALE,
			this.pixelRatio,
		);
		// Match the effective resolution of the half-size replacement atlas so
		// font hinting lands on the same pixels in both textures.
		this.letterOrderPixelRatio = Math.min(this.pixelRatio, 1.25);
		this.mainLetterOrderCanvas = createCanvas(
			rect.width,
			rect.height,
			this.letterOrderPixelRatio,
		);
		this.snakeLetterOrderCanvas = createCanvas(
			rect.width,
			rect.height,
			this.letterOrderPixelRatio,
		);
		this.mainCtx = this.mainCanvas.getContext("2d");
		this.snakeCtx = this.snakeCanvas.getContext("2d");
		this.mainLetterOrderCtx = this.mainLetterOrderCanvas.getContext("2d");
		this.snakeLetterOrderCtx = this.snakeLetterOrderCanvas.getContext("2d");
		this.mainTexture = createCanvasTexture(this.mainCanvas);
		this.snakeTexture = createCanvasTexture(this.snakeCanvas);
		this.mainLetterOrderTexture = createLetterOrderTexture(this.mainLetterOrderCanvas);
		this.snakeLetterOrderTexture = createLetterOrderTexture(this.snakeLetterOrderCanvas);

		const uvRect = new THREE.Vector4(
			rect.x / panelWidth,
			1 - (rect.y + rect.height) / panelHeight,
			rect.width / panelWidth,
			rect.height / panelHeight,
		);
		this.mainMaterial = createHubPlateLabelMaterial(this.mainTexture, {
			opacity,
			bloomBoost,
			revealSeed,
			reveal: revealConfig,
			uvRect,
			mapSampleRect: new THREE.Vector4(0, 0.5, 1, 0.5),
			localePackedMap: true,
			localeOrderMap: this.mainLetterOrderTexture,
			hover,
		});
		this.mainMaterial.depthTest = false;
		this.mainMaterial.side = THREE.DoubleSide;
		this.snakeMaterial = createHubScreenSnakeTextMaterial(this.snakeTexture, {
			uvRect,
			localePackedMap: true,
			localeOrderMap: this.snakeLetterOrderTexture,
		});
		applyHubScreenSnakeUniforms(this.snakeMaterial);

		this.mainMesh = new THREE.Mesh(geometry, this.mainMaterial);
		this.mainMesh.name = `${name}_main`;
		this.mainMesh.position.z = z;
		this.mainMesh.renderOrder = renderOrder;
		this.mainMesh.raycast = () => {};
		this.snakeMesh = new THREE.Mesh(geometry, this.snakeMaterial);
		this.snakeMesh.name = `${name}_snake`;
		this.snakeMesh.position.z = z + 0.0001;
		this.snakeMesh.renderOrder = renderOrder + 1;
		this.snakeMesh.raycast = () => {};
		this.snakeMesh.visible = false;

		this.group = new THREE.Group();
		this.group.name = name;
		this.group.add(this.mainMesh, this.snakeMesh);
		parent.add(this.group);

		this._replaceGroups(this.currentLines);
		this._paintStatic();
		this.setReveal(0, { entering: false, partLinear: 0 });
	}

	_replaceGroups(lines) {
		for (const group of this.currentGroups) {
			group.engine.abort();
		}
		this.currentGroups = lines.map((line) => createGlitchGroup(line, () => {}));
	}

	_drawGroups(ctx, groups, layouts, layer) {
		for (let index = 0; index < groups.length; index += 1) {
			const layout = layouts[index];
			if (!layout) {
				continue;
			}
			const style = {
				drawProfile: "hud",
				fontSize: layout.fontSize,
				fontWeight: layout.fontWeight,
				fontFamily: layout.fontFamily,
				letterSpacing: layout.letterSpacing ?? 0,
				color: layout.color,
				mainOpacity: layout.opacity ?? 1,
				replacementFullOpacity: true,
			};
			const aligned = layout.align === "right" || layout.align === "center";
			const width = aligned
				? measureSlotsWidth(ctx, groups[index].slots, style)
				: 0;
			let x = layout.x ?? 0;
			if (layout.align === "right") {
				x = this.rect.width - (layout.right ?? 0) - width;
			} else if (layout.align === "center") {
				x -= width * 0.5;
			}
			drawGlitchTextLine(ctx, groups[index].slots, x, layout.y ?? 0, style, {
				clear: false,
				layer,
			});
		}
	}

	_drawReplacementGroups(ctx, groups, layouts, replacementFrameIndex) {
		for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
			const slots = groups[groupIndex]?.slots ?? [];
			for (const slot of slots) {
				if (slot.isSpace) {
					continue;
				}
				slot.mainHiddenCount = 1;
				slot.appearPending = false;
				slot.mainAlpha = 1;
				slot.visibleCounts.fill(0);
				if (slot.visibleCounts.length > 0) {
					const replacementIndex = replacementFrameIndex % slot.visibleCounts.length;
					slot.visibleCounts[replacementIndex] = 1;
				}
			}
		}

		this._drawGroups(ctx, groups, layouts, "snake");

		for (const group of groups) {
			for (const slot of group.slots) {
				if (slot.isSpace) {
					continue;
				}
				slot.mainHiddenCount = 0;
				slot.appearPending = false;
				slot.mainAlpha = 1;
				slot.visibleCounts.fill(0);
			}
		}
	}

	_drawPackedReplacementFrames(ctx, groups, layouts) {
		for (let frameIndex = 0; frameIndex < PACKED_REPLACEMENT_FRAME_COUNT; frameIndex += 1) {
			const column = frameIndex % 2;
			const row = Math.floor(frameIndex / 2);
			ctx.save();
			ctx.translate(
				column * this.rect.width * 0.5,
				this.rect.height + row * this.rect.height * 0.5,
			);
			ctx.scale(0.5, 0.5);
			this._drawReplacementGroups(ctx, groups, layouts, frameIndex);
			ctx.restore();
		}
	}

	_drawLetterOrderMask(ctx, groups, layouts) {
		ctx.save();
		const totalLetterCount = groups.reduce(
			(total, group) => total + (group?.slots ?? []).reduce(
				(count, slot) => count + (slot.isSpace ? 0 : 1),
				0,
			),
			0,
		);
		let globalLetterIndex = 0;
		for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
			const layout = layouts[groupIndex];
			const slots = groups[groupIndex]?.slots ?? [];
			if (!layout || slots.length === 0) {
				continue;
			}

			const fontSize = layout.fontSize ?? 16;
			const letterSpacing = fontSize * (layout.letterSpacing ?? 0);
			const fontFamily = layout.fontFamily ?? 'ManifoldExtended, "Segoe UI", sans-serif';
			ctx.font = `${layout.fontWeight ?? 500} ${fontSize}px ${fontFamily}`;

			const aligned = layout.align === "right" || layout.align === "center";
			const width = aligned
				? measureSlotsWidth(ctx, slots, layout)
				: 0;
			let cursorX = layout.x ?? 0;
			if (layout.align === "right") {
				cursorX = this.rect.width - (layout.right ?? 0) - width;
			} else if (layout.align === "center") {
				cursorX -= width * 0.5;
			}

			const letterCells = [];
			for (const slot of slots) {
				if (slot.isSpace) {
					cursorX += fontSize * SPACE_WIDTH_EM;
					continue;
				}

				const charWidth = ctx.measureText(slot.char).width;
				letterCells.push({
					x: cursorX,
					width: charWidth,
					center: cursorX + charWidth * 0.5,
				});
				cursorX += charWidth + letterSpacing;
			}

			const linePadY = fontSize * 0.45;
			const cellTop = Math.max(0, (layout.y ?? 0) - linePadY);
			const cellBottom = Math.min(
				this.rect.height,
				(layout.y ?? 0) + fontSize + linePadY,
			);

			for (let letterIndex = 0; letterIndex < letterCells.length; letterIndex += 1) {
				const cell = letterCells[letterIndex];
				const previousCell = letterCells[letterIndex - 1];
				const nextCell = letterCells[letterIndex + 1];
				const order = totalLetterCount > 1
					? globalLetterIndex / (totalLetterCount - 1)
					: 0;
				const encodedValue = LETTER_ORDER_VALUE_MIN + order * LETTER_ORDER_VALUE_RANGE;
				const encodedChannel = Math.round(encodedValue * 255);
				const cellLeft = previousCell
					? (previousCell.center + cell.center) * 0.5
					: Math.max(0, cell.x - fontSize * 0.35);
				const cellRight = nextCell
					? (cell.center + nextCell.center) * 0.5
					: Math.min(this.rect.width, cell.x + cell.width + fontSize * 0.35);

				// A phase belongs to the complete letter cell, not to antialiased glyph
				// coverage. Sampling coverage as data split one replacement glyph into
				// different phases (the visible "half-letter" regression). Non-overlapping
				// midpoint cells keep the whole source/replacement glyph on one snake step.
				ctx.fillStyle = `rgb(${encodedChannel}, ${encodedChannel}, ${encodedChannel})`;
				ctx.fillRect(
					cellLeft,
					cellTop,
					Math.max(1, cellRight - cellLeft),
					Math.max(1, cellBottom - cellTop),
				);
				globalLetterIndex += 1;
			}
		}
		ctx.restore();
	}

	_paintStatic() {
		if (!this.mainCtx || !this.snakeCtx || this._disposed) {
			return;
		}
		resetContext(this.mainCtx, this.pixelRatio);
		this._drawGroups(this.mainCtx, this.currentGroups, this.currentLines, "main");
		this._drawPackedReplacementFrames(
			this.mainCtx,
			this.currentGroups,
			this.currentLines,
		);
		resetContext(this.mainLetterOrderCtx, this.letterOrderPixelRatio);
		this._drawLetterOrderMask(
			this.mainLetterOrderCtx,
			this.currentGroups,
			this.currentLines,
		);
		this.mainTexture.needsUpdate = true;
		this.mainLetterOrderTexture.needsUpdate = true;
		this._clearSnakeTextureIfNeeded();
	}

	_clearSnakeTextureIfNeeded() {
		if (!this.snakeCtx || !this._snakeTextureHasPixels) {
			if (this.snakeMesh) {
				this.snakeMesh.visible = false;
			}
			return false;
		}

		this._snakeTextureHasPixels = false;
		if (this.snakeMesh) {
			this.snakeMesh.visible = false;
		}
		return true;
	}

	_cancelTransition() {
		this._transitionId += 1;
		if (this._transitionRaf) {
			cancelAnimationFrame(this._transitionRaf);
			this._transitionRaf = 0;
		}
		this._transitionResolve?.(false);
		this._transitionResolve = null;
		for (const group of this.nextGroups ?? []) {
			group.engine.abort();
		}
		this.nextGroups = null;
		this.nextLines = null;
		this._localeSnakeActive = false;
		this._snakeTextureHasPixels = false;
		if (this.snakeMesh) {
			this.snakeMesh.visible = false;
		}
		applyHubPlateLabelLocaleTransition(this.mainMaterial, 0, false);
		applyHubScreenSnakeLocaleTransition(this.snakeMaterial, 0, false);
	}

	_prepareGpuTransition(lines) {
		this.nextLines = lines;
		this.nextGroups = lines.map((line) => createGlitchGroup(line, () => {}));
		resetContext(this.snakeCtx, this.pixelRatio);
		// Upper half: sharp final locale. Lower half: all three real replacement glyphs.
		this._drawGroups(this.snakeCtx, this.nextGroups, this.nextLines, "main");
		this._drawPackedReplacementFrames(
			this.snakeCtx,
			this.nextGroups,
			this.nextLines,
		);
		resetContext(this.snakeLetterOrderCtx, this.letterOrderPixelRatio);
		this._drawLetterOrderMask(
			this.snakeLetterOrderCtx,
			this.nextGroups,
			this.nextLines,
		);
		// This is the only texture upload at the start of the animated part. Every
		// following frame changes shader uniforms only; Canvas2D stays idle.
		this.snakeTexture.needsUpdate = true;
		this.snakeLetterOrderTexture.needsUpdate = true;
		this._snakeTextureHasPixels = true;
		this._localeSnakeActive = true;
		this.snakeMesh.visible = true;
		applyHubPlateLabelLocaleTransition(this.mainMaterial, 0, true);
		applyHubScreenSnakeLocaleTransition(this.snakeMaterial, 0, true);
	}

	_setGpuTransitionProgress(disappearProgress, appearProgress = disappearProgress) {
		applyHubPlateLabelLocaleTransition(
			this.mainMaterial,
			clamp01(disappearProgress),
			true,
		);
		applyHubScreenSnakeLocaleTransition(
			this.snakeMaterial,
			clamp01(appearProgress),
			true,
		);
	}

	_finishGpuTransition() {
		for (const group of this.currentGroups) {
			group.engine.abort();
		}
		this.currentLines = this.nextLines;
		this.currentGroups = this.nextGroups;
		this.nextLines = null;
		this.nextGroups = null;

		[this.mainCanvas, this.snakeCanvas] = [this.snakeCanvas, this.mainCanvas];
		[this.mainCtx, this.snakeCtx] = [this.snakeCtx, this.mainCtx];
		[this.mainTexture, this.snakeTexture] = [this.snakeTexture, this.mainTexture];
		[this.mainLetterOrderCanvas, this.snakeLetterOrderCanvas] = [
			this.snakeLetterOrderCanvas,
			this.mainLetterOrderCanvas,
		];
		[this.mainLetterOrderCtx, this.snakeLetterOrderCtx] = [
			this.snakeLetterOrderCtx,
			this.mainLetterOrderCtx,
		];
		[this.mainLetterOrderTexture, this.snakeLetterOrderTexture] = [
			this.snakeLetterOrderTexture,
			this.mainLetterOrderTexture,
		];
		this.mainMaterial.uniforms.map.value = this.mainTexture;
		this.snakeMaterial.uniforms.map.value = this.snakeTexture;
		this.mainMaterial.uniforms.localeOrderMap.value = this.mainLetterOrderTexture;
		this.snakeMaterial.uniforms.uLocaleOrderMap.value = this.snakeLetterOrderTexture;

		this._localeSnakeActive = false;
		this._snakeTextureHasPixels = false;
		this.snakeMesh.visible = false;
		applyHubPlateLabelLocaleTransition(this.mainMaterial, 0, false);
		applyHubScreenSnakeLocaleTransition(this.snakeMaterial, 0, false);
	}

	estimateSwitchDuration(nextLines, runOptions) {
		const normalized = normalizeLines(nextLines);
		return estimateLanguageSwitchDuration(
			this.currentGroups,
			normalized.map((line) => line.text),
			runOptions,
		);
	}

	hasLineChanges(nextLines) {
		return !haveSameLines(this.currentLines, normalizeLines(nextLines));
	}

	async switchLines(nextLines, runOptions) {
		const normalized = normalizeLines(nextLines);
		this._cancelTransition();
		if (this._disposed || haveSameLines(this.currentLines, normalized)) {
			return false;
		}

		this._prepareGpuTransition(normalized);
		const phases = estimateLanguageSwitchPhases(
			this.currentGroups,
			normalized.map((line) => line.text),
			runOptions,
		);
		const duration = Math.max(
			180,
			phases.disappearDurationMs,
			phases.totalDurationMs,
		);
		const transitionId = ++this._transitionId;
		const startedAt = performance.now();

		const completed = await new Promise((resolve) => {
			this._transitionResolve = resolve;
			const tick = (now) => {
				if (this._disposed || transitionId !== this._transitionId) {
					this._transitionRaf = 0;
					this._transitionResolve = null;
					resolve(false);
					return;
				}

				const elapsed = now - startedAt;
				const linear = clamp01(elapsed / duration);
				const disappearLinear = phases.disappearDurationMs > 0
					? elapsed / phases.disappearDurationMs
					: 1;
				const appearLinear = phases.appearDurationMs > 0
					? (elapsed - phases.appearDelayMs) / phases.appearDurationMs
					: 1;
				this._setGpuTransitionProgress(
					easeInOutCubic(disappearLinear),
					easeInOutCubic(appearLinear),
				);
				if (linear >= 1) {
					this._transitionRaf = 0;
					this._transitionResolve = null;
					resolve(true);
					return;
				}
				this._transitionRaf = requestAnimationFrame(tick);
			};
			this._transitionRaf = requestAnimationFrame(tick);
		});

		if (!completed || this._disposed || transitionId !== this._transitionId) {
			return false;
		}
		this._finishGpuTransition();
		return true;
	}

	setLinesImmediate(lines) {
		this._cancelTransition();
		this.currentLines = normalizeLines(lines);
		this._replaceGroups(this.currentLines);
		this._paintStatic();
	}

	setReveal(alpha, revealState = {}) {
		const safeAlpha = clamp01(alpha);
		applyHubPlateLabelRevealUniforms(
			this.mainMaterial.uniforms,
			safeAlpha,
			revealState,
			this.revealConfig,
		);
		applyHubScreenSnakeOpacity(this.snakeMaterial, safeAlpha * this.opacity);
	}

	dispose() {
		this._disposed = true;
		this._cancelTransition();
		for (const group of this.currentGroups) {
			group.engine.abort();
		}
		this.currentGroups = [];
		this.group?.parent?.remove(this.group);
		this.mainMaterial?.dispose();
		this.snakeMaterial?.dispose();
		this.mainTexture?.dispose();
		this.snakeTexture?.dispose();
		this.mainLetterOrderTexture?.dispose();
		this.snakeLetterOrderTexture?.dispose();
		this.group = null;
	}
}
