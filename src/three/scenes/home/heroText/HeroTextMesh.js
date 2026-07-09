import * as THREE from "three";
import { heroTextVertexShader } from "../../../shaders/heroText/heroTextVertex.glsl.js";
import { heroTextVertexInstancedShader } from "../../../shaders/heroText/heroTextVertexInstanced.glsl.js";
import { heroTextShaderConfig, applyHeroTitleShaderUniforms } from "./heroTextShaderConfig.js";
import { heroTextRevealConfig } from "./heroTextRevealConfig.js";
import { createHeroTextRevealUniforms, HeroTextRevealController } from "./heroTextReveal.js";
import { getHeroGlitchSnakeRunOptions, heroTextGlitchConfig, applyHeroGlitchShaderUniforms } from "./heroTextGlitchConfig.js";
import { HeroTextGlitchController } from "./HeroTextGlitchController.js";
import { drawHeroGlitchLine } from "./drawHeroGlitchText.js";

function measureTextWithSpacing(context, text, letterSpacingPx) {
	if (!text.length) {
		return 0;
	}

	let width = 0;
	for (let i = 0; i < text.length; i++) {
		width += context.measureText(text[i]).width;
		if (i < text.length - 1) {
			width += letterSpacingPx;
		}
	}
	return width;
}

function fillTextWithSpacing(context, text, x, y, letterSpacingPx) {
	let cursorX = x;
	for (let i = 0; i < text.length; i++) {
		const char = text[i];
		context.fillText(char, cursorX, y);
		cursorX += context.measureText(char).width + letterSpacingPx;
	}
}

/**
 * Canvas → texture → screen-space shader text (порт TextMesh из digital-monster).
 * Без gsap/dat.gui — progress анимируется внутри update().
 */
export class HeroTextMesh {
	constructor({
		renderer,
		scene,
		canvasWidth,
		fragmentShader,
		text,
		offsetX,
		offsetY,
		fontFamily,
		fontSize,
		fontWeight,
		lineHeight,
		fontColor,
		letterSpacing = 0,
		decorativeTopLine = false,
		decorativeLineWidthVw = 0.14,
		numCols,
		numRows,
		useInstancedLetters,
		shaderProfile = "title",
		revealSeed = 0.17,
		useGlitchSnake = false,
	}) {
		this.renderer = renderer;
		this.scene = scene;
		this.splitBloomLayers = Boolean(shaderProfile === "title" && useInstancedLetters);
		this.canvasWidth = canvasWidth;
		this.fragmentShader = fragmentShader;
		this.text = text;
		this.offsetX = offsetX;
		this.offsetY = offsetY;
		this.fontFamily = fontFamily;
		this.fontSize = fontSize;
		this.fontWeight = fontWeight;
		this.lineHeight = lineHeight;
		this.fontColor = fontColor;
		this.letterSpacing = letterSpacing;
		this.decorativeTopLine = decorativeTopLine;
		this.decorativeLineWidthVw = decorativeLineWidthVw;
		this.useInstancedLetters = useInstancedLetters ?? false;
		this.useGlitchSnake = useGlitchSnake;
		this.shaderProfile = shaderProfile;
		this.numCols = numCols ?? 15;
		this.numRows = numRows ?? 3;
		this.uVirtualCursorYs = [0, 0, 0];

		this.time = 0;
		this.uProgress = 0;
		this.baseWidth = 1920;
		this.influenceRadius = 0.035;
		this.mouse = { x: 0, y: 0 };
		this._progressAnim = null;
		this._pendingReveal = null;
		this._glitchController = null;
		this._textTexture = null;
		this.reveal = new HeroTextRevealController([], { revealSeed });
		this._onMouseMove = (event) => {
			this.mouse.x = event.clientX / window.innerWidth;
			this.mouse.y = -(event.clientY / window.innerHeight) + 1;
		};

		this.width = window.innerWidth;
		this.height = window.innerHeight;
		this.aspectRatio = this.width / this.height;

		window.addEventListener("mousemove", this._onMouseMove);
		this.createText();
	}

	reverseNormalizeItem(targetItem) {
		return targetItem * (this.baseWidth / this.width);
	}

	getLineHeightVw() {
		if (!this.canvasWidth || !this.width) {
			return 0;
		}
		const n = this.lineHeight * (this.baseWidth / this.width);
		return n / this.canvasWidth;
	}

	getDecorativeInsetVw() {
		if (!this.decorativeTopLine) {
			return 0;
		}
		return this.getLineHeightVw() * 0.72;
	}

	getBlockHeightVw() {
		return this.getDecorativeInsetVw() + this.text.length * this.getLineHeightVw();
	}

	getBlockBottomOffsetY() {
		return this.offsetY + this.getBlockHeightVw();
	}

	_getShaderUniformExtras() {
		const cfg = heroTextShaderConfig;

		if (this.shaderProfile === "stack") {
			return {
				uSubtitleBrightness: { value: cfg.stackFillBrightness },
				uSubtitleAlpha: { value: cfg.stackMasterAlpha },
				uSubtitleGamma: { value: cfg.stackGamma },
				uSubtitleTint: { value: new THREE.Color(cfg.stackTint) },
				uReplacementBloomBoost: { value: heroTextGlitchConfig.replacementBloomBoost },
				uReplacementBloomTint: { value: new THREE.Color(heroTextGlitchConfig.replacementBloomColor) },
			};
		}

		if (this.shaderProfile === "subtitle") {
			return {
				uSubtitleBrightness: { value: cfg.taglineFillBrightness },
				uSubtitleAlpha: { value: cfg.taglineMasterAlpha },
				uSubtitleGamma: { value: cfg.taglineGamma },
				uSubtitleTint: { value: new THREE.Color(cfg.taglineTint) },
				uReplacementBloomBoost: { value: heroTextGlitchConfig.replacementBloomBoost },
				uReplacementBloomTint: { value: new THREE.Color(heroTextGlitchConfig.replacementBloomColor) },
			};
		}

		return {
			uFillBrightness: { value: cfg.titleFillBrightness },
			uMasterAlpha: { value: cfg.titleMasterAlpha },
			uGlitchStrength: { value: cfg.titleGlitchStrength },
			uOutlineBoost: { value: new THREE.Vector3(cfg.titleOutlineR, cfg.titleOutlineG, cfg.titleOutlineB) },
			uOutlineThreshold: { value: cfg.titleOutlineThreshold },
			uFillGradientTop: { value: new THREE.Color(cfg.titleGradientTop) },
			uFillGradientBottom: { value: new THREE.Color(cfg.titleGradientBottom) },
			uTitleShimmer: { value: cfg.titleShimmer },
			uRenderPass: { value: 0 },
		};
	}

	_getMaterials() {
		return [this.textMaterial, this.fillMaterial].filter(Boolean);
	}

	_bindRevealMaterials() {
		this.reveal.setMaterials(this._getMaterials());
		for (const material of this._getMaterials()) {
			if (material.uniforms.uProgress) {
				material.uniforms.uProgress.value = 1;
			}
			if (material.uniforms.uIsAppearing) {
				material.uniforms.uIsAppearing.value = 1;
			}
		}
		this.uProgress = 1;
		this.reveal.prepareHidden();
		this.reveal.syncFromConfig();

		if (this._pendingReveal) {
			const pending = this._pendingReveal;
			this._pendingReveal = null;
			if (pending.intent === "enter") {
				this.reveal.playEnter(pending.durationMs, pending.options);
			} else {
				this.reveal.playExit(pending.durationMs, pending.options);
			}
		}
	}

	playRevealEnter(durationMs, options) {
		if (!this.textMaterial) {
			this._pendingReveal = { intent: "enter", durationMs, options };
			return Promise.resolve();
		}
		return this.reveal.playEnter(durationMs, options);
	}

	playRevealExit(durationMs, options) {
		if (!this.textMaterial) {
			this._pendingReveal = { intent: "exit", durationMs, options };
			return Promise.resolve();
		}
		return this.reveal.playExit(durationMs, options);
	}

	applyShaderConfig() {
		for (const material of this._getMaterials()) {
			applyHeroTitleShaderUniforms(material.uniforms, heroTextShaderConfig, this.shaderProfile);
			if (this.useGlitchSnake) {
				applyHeroGlitchShaderUniforms(material);
			}
		}
	}

	animateProgress(targetValue, durationMs = 1000) {
		if (!this.textMaterial) {
			this._pendingProgressAnim = { targetValue, durationMs };
			return Promise.resolve();
		}

		for (const material of this._getMaterials()) {
			if (material.uniforms.uIsAppearing) {
				material.uniforms.uIsAppearing.value = targetValue >= 1 ? 1 : 0;
			}
		}

		const from = this.uProgress;
		this._progressAnim = {
			from,
			to: targetValue,
			startedAt: performance.now(),
			durationMs,
		};

		return new Promise((resolve) => {
			this._progressAnim.resolve = resolve;
		});
	}

	_tickProgressAnim() {
		const anim = this._progressAnim;
		if (!anim || !this.textMaterial) {
			return;
		}

		const t = Math.min(1, (performance.now() - anim.startedAt) / anim.durationMs);
		this.uProgress = anim.from + (anim.to - anim.from) * t;
		for (const material of this._getMaterials()) {
			material.uniforms.uProgress.value = this.uProgress;
		}

		if (t >= 1) {
			const resolve = anim.resolve;
			this._progressAnim = null;
			resolve?.();
		}
	}

	_ensureGlitchController() {
		if (this._glitchController) {
			return this._glitchController;
		}

		this._glitchController = new HeroTextGlitchController({
			uppercase: false,
			onRedraw: () => this._redrawGlitchCanvas(),
		});
		return this._glitchController;
	}

	_syncGlitchTexture() {
		if (this._textTexture) {
			this._textTexture.needsUpdate = true;
		}
	}

	_drawDecorativeLine(context, normalizedFontSize) {
		if (!this.decorativeTopLine) {
			return;
		}

		const lineY = normalizedFontSize * 0.12;
		const lineWidthPx = this.canvasWidth * this.decorativeLineWidthVw;
		context.strokeStyle = "rgba(69, 216, 255, 0.38)";
		context.lineWidth = Math.max(1, normalizedFontSize * 0.018);
		context.beginPath();
		context.moveTo(1, lineY);
		context.lineTo(lineWidthPx, lineY);
		context.stroke();
	}

	_layoutTextLines(context, text, normalizedLineHeight, normalizedFontSize, letterSpacingPx) {
		const textTopInset = this.decorativeTopLine ? normalizedLineHeight * 0.72 : 0;
		this.textsPositionsX = [];
		this.textsPositionsY = [];

		text.forEach((line, index) => {
			const trimmedLine = line.trim();
			const textLineWidth = measureTextWithSpacing(context, trimmedLine, letterSpacingPx) / this.canvasWidth;
			this.textsPositionsX.push(textLineWidth + this.offsetX);

			const startTextPositionY = 1 + this.offsetY;
			const lineHeightNorm = this.lineHeight / this.height;
			this.textsPositionsY.push(startTextPositionY - lineHeightNorm + lineHeightNorm / 2 - index * lineHeightNorm);
		});

		return textTopInset;
	}

	_drawGlitchLines(context, text, normalizedLineHeight, normalizedFontSize, letterSpacingPx, textTopInset) {
		const glitch = this._ensureGlitchController();
		const glitchStyle = {
			fontSize: normalizedFontSize,
			fontWeight: this.fontWeight,
			fontFamily: this.fontFamily,
			letterSpacing: this.letterSpacing,
			color: this.fontColor,
			replacementGlowStrength: heroTextGlitchConfig.replacementGlowStrength,
		};

		const lineCount = Math.max(text.length, glitch.primaryGroups.length, glitch.secondaryGroups?.length ?? 0);

		for (let index = 0; index < lineCount; index += 1) {
			const y = textTopInset + index * normalizedLineHeight;
			const primaryGroup = glitch.primaryGroups[index];
			const secondaryGroup = glitch.secondaryGroups?.[index];

			if (primaryGroup) {
				drawHeroGlitchLine(context, primaryGroup.slots, 1, y, glitchStyle);
			}
			if (secondaryGroup) {
				drawHeroGlitchLine(context, secondaryGroup.slots, 1, y, glitchStyle);
			}
		}
	}

	_redrawGlitchCanvas() {
		if (!this.canvas || !this.useGlitchSnake) {
			return;
		}

		const context = this.canvas.getContext("2d", { alpha: true });
		if (!context) {
			return;
		}

		const normalizedFontSize = this.reverseNormalizeItem(this.fontSize);
		const normalizedLineHeight = this.reverseNormalizeItem(this.lineHeight);
		const letterSpacingPx = this.letterSpacing * normalizedFontSize;

		context.clearRect(0, 0, this.canvas.width, this.canvas.height);
		context.font = `${this.fontWeight} ${normalizedFontSize}px ${this.fontFamily}`;
		context.textAlign = "left";
		context.textBaseline = "top";
		context.imageSmoothingEnabled = true;
		context.imageSmoothingQuality = "high";

		this._drawDecorativeLine(context, normalizedFontSize);
		this._layoutTextLines(context, this.text, normalizedLineHeight, normalizedFontSize, letterSpacingPx);
		const textTopInset = this.decorativeTopLine ? normalizedLineHeight * 0.72 : 0;
		this._drawGlitchLines(context, this.text, normalizedLineHeight, normalizedFontSize, letterSpacingPx, textTopInset);
		this._syncGlitchTexture();
	}

	_loadFontAndRun(callback) {
		return document.fonts
			.load(`${this.fontWeight} ${this.fontSize}px ${this.fontFamily}`)
			.then(callback)
			.catch((error) => {
				console.error("[HeroTextMesh] font load failed", error);
				this._failTextRebuild(error);
			});
	}

	createText() {
		this.width = window.innerWidth;
		this.height = window.innerHeight;
		this.aspectRatio = this.width / this.height;

		this.canvas = document.createElement("canvas");
		const text = this.text;

		this.canvasHeight = this.canvasWidth / this.aspectRatio;
		this.canvas.width = this.canvasWidth;
		this.canvas.height = this.canvasHeight;

		this._loadFontAndRun(() => {
			const context = this.canvas.getContext("2d", { alpha: true });
			const text = this.text;
			const normalizedFontSize = this.reverseNormalizeItem(this.fontSize);
			context.font = `${this.fontWeight} ${normalizedFontSize}px ${this.fontFamily}`;
			context.fillStyle = this.fontColor;
			context.textAlign = "left";
			context.textBaseline = "top";
			context.imageSmoothingEnabled = true;
			context.imageSmoothingQuality = "high";

			const normalizedLineHeight = this.reverseNormalizeItem(this.lineHeight);
			const letterSpacingPx = this.letterSpacing * normalizedFontSize;

			this._drawDecorativeLine(context, normalizedFontSize);

			if (this.useGlitchSnake) {
				this._ensureGlitchController().setText(text);
			}

			const textTopInset = this.decorativeTopLine ? normalizedLineHeight * 0.72 : 0;

			if (this.useGlitchSnake) {
				this._layoutTextLines(context, text, normalizedLineHeight, normalizedFontSize, letterSpacingPx);
				this._drawGlitchLines(context, text, normalizedLineHeight, normalizedFontSize, letterSpacingPx, textTopInset);
			} else {
				this.textsPositionsX = [];
				this.textsPositionsY = [];

				text.forEach((line, index) => {
					const trimmedLine = line.trim();
					fillTextWithSpacing(context, trimmedLine, 1, textTopInset + index * normalizedLineHeight, letterSpacingPx);
					const textLineWidth = measureTextWithSpacing(context, trimmedLine, letterSpacingPx) / this.canvasWidth;
					this.textsPositionsX.push(textLineWidth + this.offsetX);

					const startTextPositionY = 1 + this.offsetY;
					const lineHeightNorm = this.lineHeight / this.height;
					this.textsPositionsY.push(startTextPositionY - lineHeightNorm + lineHeightNorm / 2 - index * lineHeightNorm);
				});
			}

			this.startPointsNormalized = this.textsPositionsX.map((value) => this.reverseNormalizeItem(value));

			const textTexture = new THREE.CanvasTexture(this.canvas);
			this._textTexture = textTexture;
			textTexture.needsUpdate = true;
			textTexture.minFilter = THREE.LinearMipmapLinearFilter;
			textTexture.magFilter = THREE.LinearFilter;
			textTexture.wrapS = THREE.ClampToEdgeWrapping;
			textTexture.wrapT = THREE.ClampToEdgeWrapping;
			textTexture.generateMipmaps = true;
			textTexture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());

			const cursorCount = Math.min(3, text.length);
			const lastIndex = Math.max(0, text.length - 1);
			const cursorX = (index) => (this.textsPositionsX[index] ?? this.textsPositionsX[lastIndex]) / this.canvasWidth;
			const cursorY = (index) => this.textsPositionsY[index] ?? this.textsPositionsY[lastIndex];

			this.uVirtualCursor1 = new THREE.Vector2(cursorX(0), cursorY(0));
			this.uVirtualCursor2 = new THREE.Vector2(cursorX(1), cursorY(1));
			this.uVirtualCursor3 = new THREE.Vector2(cursorX(2), cursorY(2));
			this._virtualCursorCount = cursorCount;

			if (this.useInstancedLetters) {
				this._buildInstancedMesh(context, text, normalizedLineHeight, normalizedFontSize, textTexture);
			} else {
				this._buildPlaneMesh(textTexture);
			}
		});
	}

	_buildInstancedMesh(context, text, normalizedLineHeight, normalizedFontSize, textTexture) {
		const lineHeightNorm = normalizedLineHeight / this.canvasHeight;
		const letterSpacingPx = this.letterSpacing * normalizedFontSize;
		const cursorYs = text.map((_, row) => 1.0 - (row + 0.5) * lineHeightNorm);
		this.uVirtualCursorYs = cursorYs;
		this.uVirtualCursor1.set(this.uVirtualCursor1.x, cursorYs[0] ?? cursorYs[cursorYs.length - 1]);
		this.uVirtualCursor2.set(this.uVirtualCursor2.x, cursorYs[1] ?? cursorYs[cursorYs.length - 1]);
		this.uVirtualCursor3.set(this.uVirtualCursor3.x, cursorYs[2] ?? cursorYs[cursorYs.length - 1]);

		const chars = [];
		let order = 0;
		let sumPrevLines = 0;

		for (let row = 0; row < text.length; row++) {
			const line = text[row].trim();
			let x = 1;
			const infos = [];
			for (let i = 0; i < line.length; i++) {
				const w = context.measureText(line[i]).width;
				infos.push({ startX: x, width: w });
				x += w + (i < line.length - 1 ? letterSpacingPx : 0);
			}
			for (let i = infos.length - 1; i >= 0; i--) {
				const startX = infos[i].startX / this.canvasWidth;
				const endX = (infos[i].startX + infos[i].width) / this.canvasWidth;
				const startY = 1.0 - (row + 1) * lineHeightNorm;
				const endY = 1.0 - row * lineHeightNorm;
				chars.push({ startX, endX, startY, endY, order, orderAppear: sumPrevLines + i });
				order++;
			}
			sumPrevLines += infos.length;
		}

		const charCount = order;
		let sumDu = 0;
		let sumDv = 0;
		for (const c of chars) {
			sumDu += c.endX - c.startX;
			sumDv += c.endY - c.startY;
		}

		const quadGeom = new THREE.BufferGeometry();
		quadGeom.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]), 3));
		quadGeom.setAttribute("uv", new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
		quadGeom.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1));

		const uvOffsetArr = new Float32Array(charCount * 2);
		const uvScaleArr = new Float32Array(charCount * 2);
		const posArr = new Float32Array(charCount * 3);
		const scaleArr = new Float32Array(charCount * 2);
		const orderArr = new Float32Array(charCount);
		const orderAppearArr = new Float32Array(charCount);

		for (let i = 0; i < charCount; i++) {
			const c = chars[i];
			const du = c.endX - c.startX;
			const dv = c.endY - c.startY;
			uvOffsetArr[i * 2] = c.startX;
			uvOffsetArr[i * 2 + 1] = c.startY;
			uvScaleArr[i * 2] = du;
			uvScaleArr[i * 2 + 1] = dv;
			posArr[i * 3] = -1 + 2 * c.startX;
			posArr[i * 3 + 1] = -1 + 2 * c.startY;
			posArr[i * 3 + 2] = 0;
			scaleArr[i * 2] = 2 * du;
			scaleArr[i * 2 + 1] = 2 * dv;
			orderArr[i] = c.order;
			orderAppearArr[i] = c.orderAppear;
		}

		quadGeom.setAttribute("instancePosition", new THREE.InstancedBufferAttribute(posArr, 3));
		quadGeom.setAttribute("instanceScale", new THREE.InstancedBufferAttribute(scaleArr, 2));
		quadGeom.setAttribute("instanceUvOffset", new THREE.InstancedBufferAttribute(uvOffsetArr, 2));
		quadGeom.setAttribute("instanceUvScale", new THREE.InstancedBufferAttribute(uvScaleArr, 2));
		quadGeom.setAttribute("instanceOrder", new THREE.InstancedBufferAttribute(orderArr, 1));
		quadGeom.setAttribute("instanceOrderAppear", new THREE.InstancedBufferAttribute(orderAppearArr, 1));

		if (this.splitBloomLayers) {
			this._buildSplitInstancedMeshes(quadGeom, textTexture, charCount, sumDu, sumDv);
		} else {
			this._buildSingleInstancedMesh(quadGeom, textTexture, charCount, sumDu, sumDv, 0, THREE.AdditiveBlending);
		}

		this._flushPendingProgressAnim();
		this._bindRevealMaterials();
	}

	_createInstancedUniforms(textTexture, charCount, sumDu, sumDv, renderPass) {
		return {
			uPlaneSize: { value: new THREE.Vector2(2, 2) },
			uTime: { value: this.time },
			uProgress: { value: 1 },
			uTexture: { value: textTexture },
			uPositionOffset: { value: new THREE.Vector2(this.offsetX, this.offsetY) },
			uResolution: { value: new THREE.Vector2(this.width, this.height) },
			uMouse: { value: new THREE.Vector2(this.mouse.x, this.mouse.y) },
			uVirtualCursor1: { value: this.uVirtualCursor1 },
			uVirtualCursor2: { value: this.uVirtualCursor2 },
			uVirtualCursor3: { value: this.uVirtualCursor3 },
			uInfluenceRadiusNDC: { value: 0.07 },
			uCharCount: { value: charCount },
			uCharWidthNDC: { value: (2 * sumDu) / charCount },
			uCharHeightNDC: { value: (2 * sumDv) / charCount },
			uIsAppearing: { value: 1 },
			...createHeroTextRevealUniforms(this.reveal.revealSeed),
			...this._getShaderUniformExtras(),
			uRenderPass: { value: renderPass },
		};
	}

	_buildSingleInstancedMesh(quadGeom, textTexture, charCount, sumDu, sumDv, renderPass, blending) {
		this.textMaterial = new THREE.ShaderMaterial({
			uniforms: this._createInstancedUniforms(textTexture, charCount, sumDu, sumDv, renderPass),
			vertexShader: heroTextVertexInstancedShader,
			fragmentShader: this.fragmentShader,
			transparent: true,
			depthTest: false,
			depthWrite: false,
			blending,
		});
		applyHeroTitleShaderUniforms(this.textMaterial.uniforms);

		this.textMesh = new THREE.InstancedMesh(quadGeom, this.textMaterial, charCount);
		this.textMesh.frustumCulled = false;
		this.textMesh.renderOrder = 20;
		this.scene.add(this.textMesh);
	}

	_buildSplitInstancedMeshes(quadGeom, textTexture, charCount, sumDu, sumDv) {
		this.textMaterial = new THREE.ShaderMaterial({
			uniforms: this._createInstancedUniforms(textTexture, charCount, sumDu, sumDv, 1),
			vertexShader: heroTextVertexInstancedShader,
			fragmentShader: this.fragmentShader,
			transparent: true,
			depthTest: false,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
		});
		applyHeroTitleShaderUniforms(this.textMaterial.uniforms);

		this.fillMaterial = new THREE.ShaderMaterial({
			uniforms: this._createInstancedUniforms(textTexture, charCount, sumDu, sumDv, 0),
			vertexShader: heroTextVertexInstancedShader,
			fragmentShader: this.fragmentShader,
			transparent: true,
			depthTest: false,
			depthWrite: false,
			blending: THREE.NormalBlending,
		});
		applyHeroTitleShaderUniforms(this.fillMaterial.uniforms);

		this.textMesh = new THREE.InstancedMesh(quadGeom, this.textMaterial, charCount);
		this.textMesh.frustumCulled = false;
		this.textMesh.renderOrder = 21;
		this.scene.add(this.textMesh);

		this.fillMesh = new THREE.InstancedMesh(quadGeom, this.fillMaterial, charCount);
		this.fillMesh.frustumCulled = false;
		this.fillMesh.renderOrder = 20;
		this.scene.add(this.fillMesh);
		this._flushPendingProgressAnim();
		this._bindRevealMaterials();
		this._completeTextRebuild();
	}

	_flushPendingProgressAnim() {
		if (!this._pendingProgressAnim) {
			return;
		}
		const pending = this._pendingProgressAnim;
		this._pendingProgressAnim = null;
		this.animateProgress(pending.targetValue, pending.durationMs);
	}

	_buildPlaneMesh(textTexture) {
		const textGeometry = new THREE.PlaneGeometry(2, 2);
		this.textMaterial = new THREE.ShaderMaterial({
			uniforms: {
				uPlaneSize: { value: new THREE.Vector2(textGeometry.parameters.width, textGeometry.parameters.height) },
				uTime: { value: this.time },
				uProgress: { value: 1 },
				uTexture: { value: textTexture },
				uPositionOffset: { value: new THREE.Vector2(this.offsetX, this.offsetY) },
				uResolution: { value: new THREE.Vector2(this.width, this.height) },
				uMouse: { value: new THREE.Vector2(this.mouse.x, this.mouse.y) },
				uVirtualCursor1: { value: this.uVirtualCursor1 },
				uVirtualCursor2: { value: this.uVirtualCursor2 },
				uVirtualCursor3: { value: this.uVirtualCursor3 },
				influenceRadius: { value: this.reverseNormalizeItem(this.influenceRadius) },
				uNumCols: { value: this.numCols },
				uNumRows: { value: this.numRows },
				uLineHeightNorm: { value: this.lineHeight / this.canvasHeight },
				...createHeroTextRevealUniforms(this.reveal.revealSeed),
				...this._getShaderUniformExtras(),
			},
			vertexShader: heroTextVertexShader,
			fragmentShader: this.fragmentShader,
			transparent: true,
			depthTest: false,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
		});
		applyHeroTitleShaderUniforms(this.textMaterial.uniforms);

		this.textMesh = new THREE.Mesh(textGeometry, this.textMaterial);
		this.textMesh.frustumCulled = false;
		this.textMesh.renderOrder = 21;
		this.scene.add(this.textMesh);
		this._flushPendingProgressAnim();
		this._bindRevealMaterials();
		this._completeTextRebuild();
	}

	animateVirtualCursors(deltaTime) {
		if (!this.useInstancedLetters || !this.textMaterial || !this.startPointsNormalized?.length) {
			return;
		}

		this.time += deltaTime * 0.005;
		const lineCount = this._virtualCursorCount ?? this.startPointsNormalized.length;
		if (lineCount <= 0) {
			return;
		}

		const speed = 0.002;
		const totalDuration = 0.6;
		const overlap = 0.1;
		const overshootLeft = 0.1;
		const fullCycle = totalDuration * lineCount - overlap * Math.max(0, lineCount - 1);
		const phase = (this.time * speed) % fullCycle;

		const calculateValue = (localPhase, index, startPoint) => {
			const startTime = index * (totalDuration - overlap);
			const endTime = startTime + totalDuration;
			if (localPhase >= startTime && localPhase < endTime) {
				const localT = (localPhase - startTime) / totalDuration;
				return startPoint - localT * (startPoint + overshootLeft);
			}
			return startPoint;
		};

		const cursors = [this.textMaterial.uniforms.uVirtualCursor1, this.textMaterial.uniforms.uVirtualCursor2, this.textMaterial.uniforms.uVirtualCursor3];
		const fillCursors = this.fillMaterial
			? [this.fillMaterial.uniforms.uVirtualCursor1, this.fillMaterial.uniforms.uVirtualCursor2, this.fillMaterial.uniforms.uVirtualCursor3]
			: null;
		const cursorSources = [this.uVirtualCursor1, this.uVirtualCursor2, this.uVirtualCursor3];

		for (let i = 0; i < 3; i++) {
			const startPoint = this.startPointsNormalized[Math.min(i, lineCount - 1)];
			const value = i < lineCount ? calculateValue(phase, i, startPoint) : startPoint;
			cursors[i].value.set(value, cursorSources[i].y);
			fillCursors?.[i]?.value.set(value, cursorSources[i].y);
		}

		this._syncFrameUniforms();
	}

	_syncFrameUniforms() {
		for (const material of this._getMaterials()) {
			material.uniforms.uMouse.value.set(this.mouse.x, this.mouse.y);
			material.uniforms.uTime.value = this.time * 0.005;
			material.uniforms.uPositionOffset.value.set(this.offsetX, this.offsetY);
			material.uniforms.uResolution.value.set(this.width, this.height);
		}
	}

	update(deltaTime) {
		this._tickProgressAnim();
		this.reveal.update(deltaTime);
		if (!this.textMaterial) {
			return;
		}

		if (this.useInstancedLetters) {
			this.animateVirtualCursors(deltaTime);
		} else {
			this._syncFrameUniforms();
		}
	}

	_disposeMesh(mesh, material, scene, { disposeGeometry = true, disposeTexture = false } = {}) {
		if (!mesh) {
			return;
		}

		scene.remove(mesh);
		if (disposeGeometry) {
			mesh.geometry.dispose();
		}
		material?.dispose();
		if (disposeTexture) {
			material?.uniforms?.uTexture?.value?.dispose?.();
		}
	}

	_teardownTextMeshes() {
		const sharedGeometry = this.textMesh?.geometry;
		this._disposeMesh(this.textMesh, this.textMaterial, this.scene, { disposeGeometry: false });
		this._disposeMesh(this.fillMesh, this.fillMaterial, this.scene, { disposeGeometry: false });
		sharedGeometry?.dispose();
		this.textMaterial?.uniforms?.uTexture?.value?.dispose?.();
		this.textMesh = null;
		this.textMaterial = null;
		this.fillMesh = null;
		this.fillMaterial = null;
	}

	_completeTextRebuild() {
		const resolve = this._textRebuildResolve;
		this._textRebuildResolve = null;
		this._textRebuildReject = null;
		resolve?.();
	}

	_failTextRebuild(error) {
		const reject = this._textRebuildReject;
		this._textRebuildResolve = null;
		this._textRebuildReject = null;
		reject?.(error);
	}

	/** Пересборка canvas-текстуры с новым содержимым. */
	setText(text, { fontFamily } = {}) {
		if (fontFamily) {
			this.fontFamily = fontFamily;
		}

		this.text = Array.isArray(text) ? [...text] : [String(text)];
		this._progressAnim = null;

		return new Promise((resolve, reject) => {
			this._textRebuildResolve = resolve;
			this._textRebuildReject = reject;

			if (!this.textMesh) {
				this.createText();
				return;
			}

			this._teardownTextMeshes();
			this.createText();
		});
	}

	/** Смена языка змейкой (subtitle / stack). */
	switchLocaleWithSnake(nextLines, { fontFamily } = {}) {
		if (!this.useGlitchSnake) {
			return this.switchLocaleText(nextLines, { fontFamily });
		}

		if (fontFamily) {
			this.fontFamily = fontFamily;
		}

		const nextText = Array.isArray(nextLines) ? [...nextLines] : [String(nextLines)];

		return this._loadFontAndRun(() =>
			this._ensureGlitchController()
				.runLanguageSwitch(nextText, getHeroGlitchSnakeRunOptions())
				.then(() => {
					this.text = nextText;
					this._redrawGlitchCanvas();
				}),
		);
	}

	/**
	 * Смена языка: reveal exit → новый текст на canvas → reveal enter.
	 * @param {string[]} nextLines
	 * @param {{ fontFamily?: string, exitMs?: number, enterMs?: number, glitch?: boolean }} [options]
	 */
	switchLocaleText(nextLines, options = {}) {
		const cfg = heroTextRevealConfig;
		const exitMs = options.exitMs ?? cfg.localeSwitchExitMs ?? cfg.exitDurationMs;
		const enterMs = options.enterMs ?? cfg.localeSwitchEnterMs ?? cfg.enterDurationMs;
		const glitch = options.glitch ?? cfg.localeSwitchGlitch;
		const glitchOptions = { glitch };

		if (options.fontFamily) {
			this.fontFamily = options.fontFamily;
		}

		return this.playRevealExit(exitMs, glitchOptions)
			.then(() => this.setText(nextLines))
			.then(() => this.playRevealEnter(enterMs, glitchOptions));
	}

	/** Сдвиг без пересборки текстуры (live-tune позиции). */
	setPosition(offsetX, offsetY) {
		if (offsetX !== undefined) {
			this.offsetX = offsetX;
		}
		if (offsetY !== undefined) {
			this.offsetY = offsetY;
		}
		this._syncFrameUniforms();
	}

	resize(nextOffsetX) {
		if (nextOffsetX !== undefined) {
			this.offsetX = nextOffsetX;
		}

		if (!this.textMaterial || !this.textMesh) {
			return;
		}

		this._teardownTextMeshes();
		this.createText();
	}

	dispose() {
		window.removeEventListener("mousemove", this._onMouseMove);
		this._glitchController?.dispose();
		this._glitchController = null;
		const sharedGeometry = this.textMesh?.geometry;
		this._disposeMesh(this.textMesh, this.textMaterial, this.scene, { disposeGeometry: false });
		this._disposeMesh(this.fillMesh, this.fillMaterial, this.scene, { disposeGeometry: false });
		sharedGeometry?.dispose();
		this.textMaterial?.uniforms?.uTexture?.value?.dispose?.();
		this.textMesh = null;
		this.textMaterial = null;
		this.fillMesh = null;
		this.fillMaterial = null;
	}
}
