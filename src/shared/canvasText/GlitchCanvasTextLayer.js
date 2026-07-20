import * as THREE from "three";
import CanvasGlitchText from "@/shared/glitchText/canvasGlitchText.js";
import { GLITCH_REPLACEMENT_SHADOW_BLUR, resolveReplacementGlowMetrics } from "@/shared/glitchText/drawGlitchText.js";
import { getPortfolioHubGlitchConfig } from "@/three/scenes/portfolio/hub/portfolioHubGlitchConfig.js";
import {
	applyScreenTextOpacity,
	applyScreenTextGlow,
	createScreenTextMaterial,
	syncScreenTextTexture,
} from "@/three/scenes/portfolio/hub/screenTitle/hubScreenTextShaders.js";
import { applyHubScreenSnakeUniforms } from "@/three/scenes/portfolio/hub/screenTitle/hubScreenSnakeTextMaterial.js";

/** Как portfolio.scss .item { transition: opacity 0.35s ease } */
const LAYER_OPACITY_FADE_MS = 350;

function easeOutCubic(t) {
	return 1 - (1 - t) ** 3;
}

function getReplacementGlow(isActive, activeGlow, fontSize, layerCfg, snakeActive = false) {
	if (layerCfg?.meta?.projectIndex !== undefined) {
		void snakeActive;
		return resolveReplacementGlowMetrics(fontSize, 0);
	}

	const strength = isActive ? Math.max(0, activeGlow) : 1;
	return resolveReplacementGlowMetrics(fontSize, strength);
}

/**
 * Универсальный 3D-слой: canvas glitch-текст → текстура → plane + шейдер.
 * Используется в portfolio HUD; hero subtitle/stack — отдельный HeroTextMesh (screen-space).
 */
export class GlitchCanvasTextLayer {
	constructor() {
		this.mesh = null;
		this.mainMesh = null;
		this.snakeMesh = null;
		this.texture = null;
		this.snakeTexture = null;
		this.material = null;
		this.mainMaterial = null;
		this.snakeMaterial = null;
		this.geometry = null;
		this.snakeGeometry = null;
		this.layerCfg = null;
		this.layout = { width: 0, height: 0, gapAfter: 0 };
		this._splitMeshes = false;
		this._opacityDisplay = 1;
		this._opacityTarget = 1;
		this._opacityFrom = 1;
		this._opacityStartedAt = 0;
		this._opacityAnimating = false;
		this._visibilityMultiplier = 1;
		this._isFocusActive = false;
		this._pointerHover = false;
		this._glow = 0;
		this._replacementShadowBlur = GLITCH_REPLACEMENT_SHADOW_BLUR;
		this._replacementGlowStrength = 1;
		this._mainColor = null;
		this.glitchText = null;
		this._canvasAspect = 1;
		/** Кэш canvas-opacity — не перерисовывать на каждый кадр fade. */
		this._cachedDrawMainOpacity = null;
		this._cachedDrawReplacementFull = null;
	}

	_usesGlitchText(layerCfg) {
		return layerCfg?.useGlitchText === true || layerCfg?.meta?.projectIndex !== undefined;
	}

	_shouldKeepMeshInRenderGraph() {
		return Boolean(this.layerCfg?.keepMeshInRenderGraph) || this._usesGlitchText(this.layerCfg);
	}

	_applyCanvasMetrics(canvas, aspect) {
		this.texture = new THREE.CanvasTexture(canvas);
		this.texture.colorSpace = THREE.SRGBColorSpace;
		this.texture.minFilter = THREE.LinearFilter;
		this.texture.magFilter = THREE.LinearFilter;
		this.texture.needsUpdate = true;

		const planeHeight = this.layerCfg.planeHeight ?? 0.3;
		const planeWidth = this.layerCfg.planeWidth ?? planeHeight * aspect;
		this._canvasAspect = aspect;
		this.layout.width = planeWidth;
		this.layout.height = planeHeight;

		this.geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
		this.material = createScreenTextMaterial(this.layerCfg.shader, this.texture, this.layerCfg);
		syncScreenTextTexture(this.layerCfg.shader, this.material, this.texture);
		this.mainMaterial = this.material;
		this.mesh = new THREE.Mesh(this.geometry, this.material);
		this.mainMesh = this.mesh;
		this.mesh.renderOrder = this.layerCfg.renderOrder ?? 999;

		if (this.layerCfg?.meta) {
			const meta = {
				...this.layerCfg.meta,
				hubProjectIndex: this.layerCfg.meta.projectIndex,
			};
			Object.assign(this.mesh.userData, meta);
		}
	}

	_createCanvasTexture(canvas) {
		const texture = new THREE.CanvasTexture(canvas);
		texture.colorSpace = THREE.SRGBColorSpace;
		texture.minFilter = THREE.LinearFilter;
		texture.magFilter = THREE.LinearFilter;
		texture.needsUpdate = true;
		return texture;
	}

	/** Список проектов: main + snake — два mesh в одной группе. */
	_applySplitCanvasMetrics(mainCanvas, snakeCanvas, aspect) {
		const planeHeight = this.layerCfg.planeHeight ?? 0.3;
		const planeWidth = this.layerCfg.planeWidth ?? planeHeight * aspect;
		this._canvasAspect = aspect;
		this.layout.width = planeWidth;
		this.layout.height = planeHeight;

		this.texture = this._createCanvasTexture(mainCanvas);
		this.snakeTexture = this._createCanvasTexture(snakeCanvas);

		this.geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
		this.snakeGeometry = new THREE.PlaneGeometry(planeWidth, planeHeight);

		const mainShader = this.layerCfg.shader ?? "whiteText";
		const snakeShader = this.layerCfg.snakeShader ?? "snakeText";
		const baseRenderOrder = this.layerCfg.renderOrder ?? 999;

		this.mainMaterial = createScreenTextMaterial(mainShader, this.texture, this.layerCfg);
		this.snakeMaterial = createScreenTextMaterial(snakeShader, this.snakeTexture, this.layerCfg);
		syncScreenTextTexture(mainShader, this.mainMaterial, this.texture);
		syncScreenTextTexture(snakeShader, this.snakeMaterial, this.snakeTexture);

		this.mainMesh = new THREE.Mesh(this.geometry, this.mainMaterial);
		this.snakeMesh = new THREE.Mesh(this.snakeGeometry, this.snakeMaterial);
		this.mainMesh.renderOrder = baseRenderOrder;
		this.snakeMesh.renderOrder = baseRenderOrder + 1;

		const group = new THREE.Group();
		group.add(this.mainMesh);
		group.add(this.snakeMesh);
		this.mesh = group;

		// material — snake для live-tune bloom в колонке.
		this.material = this.snakeMaterial;

		if (this.layerCfg?.meta) {
			const meta = {
				...this.layerCfg.meta,
				hubProjectIndex: this.layerCfg.meta.projectIndex,
			};
			Object.assign(group.userData, meta);
			Object.assign(this.mainMesh.userData, meta);
			Object.assign(this.snakeMesh.userData, meta);
		}
	}

	_isProjectListGlitchLayer() {
		return this.layerCfg?.meta?.projectIndex !== undefined && Boolean(this.glitchText);
	}

	/** HDR-bloom uniform на snake-mesh списка проектов. */
	_syncProjectListBloomUniforms() {
		if (!this._isProjectListGlitchLayer() || !this.snakeMaterial) {
			return;
		}

		const cfg = getPortfolioHubGlitchConfig();
		applyHubScreenSnakeUniforms(this.snakeMaterial, cfg);
	}

	_markTexturesDirty({ main = false, snake = false } = {}) {
		if (main && this.texture) {
			this.texture.needsUpdate = true;
		}
		if (snake && this.snakeTexture) {
			this.snakeTexture.needsUpdate = true;
		}
	}

	_applyOpacity() {
		if (!this.layerCfg) {
			return;
		}

		const alpha = this._opacityDisplay * this._visibilityMultiplier;
		const projectListGlitch = this._isProjectListGlitchLayer();

		if (this._splitMeshes && this.mainMaterial) {
			applyScreenTextOpacity(this.layerCfg.shader, this.mainMaterial, alpha, this.layerCfg);

			if (this.mesh) {
				this.mesh.visible = this._shouldKeepMeshInRenderGraph() || alpha > 0.001;
			}

			this._syncGlitchDrawOpacity();
			return;
		}

		if (!this.material) {
			return;
		}

		const shaderAlpha = projectListGlitch ? alpha : this.glitchText && this._pointerHover ? 1 : alpha;
		applyScreenTextOpacity(this.layerCfg.shader, this.material, shaderAlpha, this.layerCfg);

		if (this.mesh) {
			this.mesh.visible = this._shouldKeepMeshInRenderGraph() || alpha > 0.001;
		}

		this._syncGlitchDrawOpacity();
	}

	_syncGlitchDrawOpacity() {
		if (!this.glitchText) {
			return;
		}

		const alpha = this._opacityDisplay * this._visibilityMultiplier;

		if (this._isProjectListGlitchLayer()) {
			const mainOpacity = 1;

			if (this._cachedDrawMainOpacity !== mainOpacity) {
				this._cachedDrawMainOpacity = mainOpacity;
				this._cachedDrawReplacementFull = true;
				this.glitchText.setDrawOpacity({
					mainOpacity,
					replacementFullOpacity: true,
				});
			}
			return;
		}

		this.glitchText.setDrawOpacity({
			mainOpacity: this._pointerHover ? alpha : 1,
			replacementFullOpacity: this._pointerHover,
		});
	}

	/**
	 * @param {object} layerCfg
	 * @param {number} [lineGap]
	 * @param {{ initialHidden?: boolean, drawProfile?: 'hud' | 'hero' }} [options]
	 */
	build(layerCfg, lineGap = 14, { initialHidden = true, drawProfile = "hud" } = {}) {
		this.dispose();
		this.layerCfg = { ...layerCfg, drawProfile: layerCfg.drawProfile ?? drawProfile };
		this._opacityDisplay = layerCfg.opacity ?? 1;
		this._opacityTarget = this._opacityDisplay;
		this._opacityFrom = this._opacityDisplay;
		this._opacityAnimating = false;
		this.layout.gapAfter = lineGap;

		if (!this._usesGlitchText(this.layerCfg)) {
			throw new Error("GlitchCanvasTextLayer requires useGlitchText or meta.projectIndex");
		}

		this._splitMeshes = this.layerCfg?.meta?.projectIndex !== undefined;

		this.glitchText = new CanvasGlitchText({
			text: layerCfg.text,
			uppercase: layerCfg.uppercase,
			fontSize: layerCfg.fontSize,
			fontWeight: layerCfg.fontWeight,
			letterSpacing: layerCfg.letterSpacing,
			color: layerCfg.color,
			fontFamily: layerCfg.fontFamily,
			drawProfile: this.layerCfg.drawProfile,
			paddingLeft: layerCfg.paddingLeft,
			paddingTop: layerCfg.paddingTop,
			paddingRight: layerCfg.paddingRight,
			paddingBottom: layerCfg.paddingBottom,
			stableCanvasWidth: layerCfg.stableCanvasWidth,
			stableCanvasHeight: layerCfg.stableCanvasHeight,
			splitCanvases: this._splitMeshes,
			maxReplacementShadowBlur:
				resolveReplacementGlowMetrics(layerCfg.fontSize ?? 45, layerCfg.activeGlow ?? 1).blur * 1.75,
			initialHidden,
			onRedraw: (flags = { main: true, snake: true }) => {
				this._syncGlitchDrawOpacity();
				this._markTexturesDirty(flags);
			},
		});

		const metrics = this.glitchText.getCanvasMetrics();
		if (this._splitMeshes && metrics.snakeCanvas) {
			this._applySplitCanvasMetrics(metrics.canvas, metrics.snakeCanvas, metrics.aspect);
		} else {
			this._applyCanvasMetrics(metrics.canvas, metrics.aspect);
		}
		this._applyOpacity();
		this._syncProjectListBloomUniforms();
		this._markTexturesDirty({ main: true, snake: true });
		this._mainColor = this.layerCfg.color ?? "#ffffff";

		return this;
	}

	getGlitchHandle() {
		if (!this.glitchText) {
			return null;
		}

		return {
			playAppear: (timeBudgetMs) => this.glitchText.playAppear(timeBudgetMs),
			playDisappear: (timeBudgetMs) => this.glitchText.playDisappear(timeBudgetMs),
			restoreVisible: () => this.glitchText.restoreVisible(),
		};
	}

	syncGlitchTextureHidden() {
		if (!this.glitchText) {
			return;
		}

		this.glitchText.prepareAppear();
		this._markTexturesDirty({ main: true, snake: true });
	}

	runHoverGlitch() {
		if (!this.glitchText) {
			return;
		}

		this.glitchText.exitReplacementGlowPreview?.();
		this.glitchText.runHover();
		this._markTexturesDirty({ main: true, snake: true });
	}

	/** Остановить змейку и сбросить canvas (при уходе hover с пункта). */
	abortSnakeGlitch() {
		if (!this.glitchText?.engine?.hasActiveAnimation()) {
			return false;
		}

		this.glitchText.engine.abort();
		this.glitchText.drawInPlace(this._splitMeshes ? "both" : "both");
		this._cachedDrawMainOpacity = null;
		this._cachedDrawReplacementFull = null;
		this._markTexturesDirty({ main: true, snake: true });
		return true;
	}

	enterReplacementGlowPreview() {
		this.glitchText?.enterReplacementGlowPreview?.();
	}

	exitReplacementGlowPreview() {
		this.glitchText?.exitReplacementGlowPreview?.();
	}

	setVisibility(multiplier = 1) {
		this._visibilityMultiplier = Math.max(0, Math.min(1, multiplier));
		this._applyOpacity();
	}

	setLayerOpacity(opacity = 1, { immediate = false } = {}) {
		const target = Math.max(0, Math.min(1, opacity));
		this._visibilityMultiplier = 1;

		if (immediate) {
			this._opacityDisplay = target;
			this._opacityTarget = target;
			this._opacityFrom = target;
			this._opacityAnimating = false;
			this._applyOpacity();
			return;
		}

		// Повторная синхронизация layout приходит каждый кадр. Тот же target не должен
		// заново запускать fade, иначе его время постоянно сбрасывается к нулю.
		if (Math.abs(target - this._opacityTarget) < 0.0001) {
			return;
		}

		this._opacityFrom = this._opacityDisplay;
		this._opacityTarget = target;
		this._opacityStartedAt = performance.now();
		this._opacityAnimating = true;
		this._applyOpacity();
	}

	updateLayerOpacity(nowMs = performance.now()) {
		if (!this._opacityAnimating) {
			return;
		}

		const t = Math.min(1, (nowMs - this._opacityStartedAt) / LAYER_OPACITY_FADE_MS);
		this._opacityDisplay = this._opacityFrom + (this._opacityTarget - this._opacityFrom) * easeOutCubic(t);
		this._applyOpacity();

		if (t >= 1) {
			this._opacityDisplay = this._opacityTarget;
			this._opacityAnimating = false;
			this._applyOpacity();
		}
	}

	setFocusActive(isActive = false, activeGlow = 0, { pointerHover = false } = {}) {
		if (!this.layerCfg || (!this.material && !this.mainMaterial)) {
			return false;
		}

		const shaderGlow = this.glitchText ? 0 : isActive ? activeGlow : 0;
		const fontSize = this.layerCfg.fontSize ?? 45;
		const snakeActive = this.glitchText?.engine?.hasActiveAnimation?.() ?? false;
		const replacementGlow = getReplacementGlow(isActive, activeGlow, fontSize, this.layerCfg, snakeActive);
		const mainColor = isActive
			? (this.layerCfg.activeColor ?? "#f4fbff")
			: (this.layerCfg.color ?? "#ffffff");

		if (this.glitchText && this._mainColor !== mainColor) {
			this._mainColor = mainColor;
			this.glitchText.setMainColor(mainColor);
		}

		if (
			this._isFocusActive === isActive &&
			this._pointerHover === pointerHover &&
			this._glow === shaderGlow &&
			(!this.glitchText ||
				(this._replacementShadowBlur === replacementGlow.blur &&
					this._replacementGlowStrength === replacementGlow.strength))
		) {
			this._syncProjectListBloomUniforms();
			return false;
		}

		this._isFocusActive = isActive;
		this._pointerHover = pointerHover;
		this._glow = shaderGlow;
		this._replacementShadowBlur = replacementGlow.blur;
		this._replacementGlowStrength = replacementGlow.strength;
		if (this.mainMaterial) {
			applyScreenTextGlow(this.layerCfg.shader, this.mainMaterial, shaderGlow);
		} else {
			applyScreenTextGlow(this.layerCfg.shader, this.material, shaderGlow);
		}

		if (this.glitchText) {
			this.glitchText.setReplacementGlow({
				blur: replacementGlow.blur,
				strength: replacementGlow.strength,
				force: this.glitchText.isReplacementGlowPreviewActive,
			});
		}

		this._syncGlitchDrawOpacity();
		this._syncProjectListBloomUniforms();

		return false;
	}

	/** Live-tune змейки списка проектов (dev-панель). */
	applySnakeGlowConfig(cfg = getPortfolioHubGlitchConfig()) {
		if (!this._isProjectListGlitchLayer() || !this.snakeMaterial) {
			return;
		}

		applyHubScreenSnakeUniforms(this.snakeMaterial, cfg);
		this._markTexturesDirty({ main: false, snake: true });
	}

	switchLocaleWithSnake(nextText, { uppercase } = {}) {
		if (!this.glitchText) {
			return Promise.resolve();
		}

		const runOptions = uppercase !== undefined ? { uppercase } : {};

		return this.glitchText.switchLocaleWithSnake(nextText, runOptions).then(() => {
			if (this.layerCfg) {
				this.layerCfg.text = nextText;
				if (uppercase !== undefined) {
					this.layerCfg.uppercase = uppercase;
				}
			}

			if (this.texture) {
				this._markTexturesDirty({ main: true, snake: true });
			}
		});
	}

	setLocaleTextHidden(nextText, { uppercase } = {}) {
		if (!this.glitchText) {
			return;
		}

		const nextUppercase = uppercase ?? this.layerCfg?.uppercase;
		// setTextForAppear — no full-visible redraw flash before prepareAppear.
		this.glitchText.setTextForAppear(nextText, nextUppercase);

		if (this.layerCfg) {
			this.layerCfg.text = nextText;
			this.layerCfg.uppercase = nextUppercase;
		}

		this._markTexturesDirty({ main: true, snake: true });
	}

	setPlaneHeight(planeHeight = 0.3) {
		if (!this.layerCfg || !this.mesh) {
			return false;
		}

		const nextHeight = Math.max(0.01, planeHeight);
		if (Math.abs(this.layout.height - nextHeight) < 0.00001) {
			return false;
		}

		this.layerCfg.planeHeight = nextHeight;
		const aspect = this._canvasAspect || this.layout.width / Math.max(this.layout.height, 0.0001);
		const planeWidth = this.layerCfg.planeWidth ?? nextHeight * aspect;
		this.layout.width = planeWidth;
		this.layout.height = nextHeight;

		const prevGeometry = this.geometry;
		this.geometry = new THREE.PlaneGeometry(planeWidth, nextHeight);
		if (this.mainMesh) {
			this.mainMesh.geometry = this.geometry;
		} else if (this.mesh?.isMesh) {
			this.mesh.geometry = this.geometry;
		}
		prevGeometry?.dispose?.();

		if (this._splitMeshes && this.snakeMesh) {
			const prevSnakeGeometry = this.snakeGeometry;
			this.snakeGeometry = new THREE.PlaneGeometry(planeWidth, nextHeight);
			this.snakeMesh.geometry = this.snakeGeometry;
			prevSnakeGeometry?.dispose?.();
		}

		return true;
	}

	dispose() {
		this.glitchText?.dispose();
		this.glitchText = null;
		this.geometry?.dispose?.();
		this.geometry = null;
		this.snakeGeometry?.dispose?.();
		this.snakeGeometry = null;
		this.mainMaterial?.dispose?.();
		this.mainMaterial = null;
		this.snakeMaterial?.dispose?.();
		this.snakeMaterial = null;
		this.material = null;
		this.texture?.dispose?.();
		this.texture = null;
		this.snakeTexture?.dispose?.();
		this.snakeTexture = null;
		this.mainMesh = null;
		this.snakeMesh = null;
		this.mesh = null;
		this.layerCfg = null;
	}
}
