import * as THREE from "three";
import { getScenePixelRatio } from "@/three/renderer/renderResolution.js";
import { getGraphicsTier } from "@/functions/getGraphicsTier.js";
import { getHomeTextVisualSettings } from "../../mediumHomeVisualConfig.js";
import { createHeroGlyphAtlas } from "./createHeroGlyphAtlas.js";
import { loadHeroStackMsdf } from "./heroStackMsdf.js";
import { HeroGpuSnakeMotion } from "./heroGpuSnakeTiming.js";
import { heroGpuTextFragment, heroGpuTextVertex } from "./heroGpuTextShaders.js";
import { createHeroTextRevealUniforms, HeroTextRevealController } from "../heroTextReveal.js";
import { applyHeroTitleShaderUniforms, heroTextShaderConfig } from "../heroTextShaderConfig.js";
import { applyHeroGlitchShaderUniforms, getHeroGlitchSnakeRunOptions, heroTextGlitchConfig } from "../heroTextGlitchConfig.js";
import { getHeroLocale, getHeroStackFontFamily, getHeroSubtitleFontFamily, HERO_COPY } from "../heroTitleConfig.js";
import { resolveReplacementGlowMetrics } from "@/components/GlitchText/drawGlitchText.js";
import { playGlitchTextSound } from "@/sounds/soundDesign.js";

/** Home-only GPU text: stable glyph instances, one finite locale playhead. */
export class HeroGpuTextMesh {
	constructor(options) {
		Object.assign(this, options);
		this.disposed = false;
		this.width = window.innerWidth; this.height = window.innerHeight;
		this.composeMode = "screen";
		this.splitSymbols = options.splitSymbols !== false;
		this.overlayScene = new THREE.Scene();
		this.overlayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
		this.uniforms = {
			uTexture: { value: null }, uResolution: { value: new THREE.Vector2(this.width, this.height) },
			uAtlasSize: { value: new THREE.Vector2(1, 1) }, uGlyphSharpness: { value: -1 },
			uGlyphBrightness: { value: 1 }, uGlyphDensity: { value: 1 },
			uGlyphInk: { value: new THREE.Color(0xffffff) },
			uOrigin: { value: new THREE.Vector2() }, uBlockSize: { value: new THREE.Vector2() }, uBlockPad: { value: new THREE.Vector2() },
			uLocaleFrom: { value: 0 }, uLocaleTo: { value: 0 }, uSnakeTime: { value: -1 },
			uSnakeTiming: { value: new THREE.Vector4(40, 40, 10, 0) }, uLineScales: { value: new Float32Array(6).fill(1) },
			uDecorationWidth: { value: 0 }, uDecorationThickness: { value: 0 }, uResolutionDpr: { value: this.renderer.getPixelRatio() },
			uLayoutDpr: { value: getScenePixelRatio(this.renderer) },
			uPass: { value: 2 }, uOpacity: { value: 1 },
			uClipMinX: { value: options.clipMinX ?? -10000 },
			uSubtitleBrightness: { value: 1 }, uSubtitleAlpha: { value: 1 }, uSubtitleGamma: { value: 1 },
			uSubtitleTint: { value: new THREE.Color(0xffffff) },
			uReplacementBloomBoost: { value: heroTextGlitchConfig.replacementBloomBoost },
			uReplacementBloomTint: { value: new THREE.Color(heroTextGlitchConfig.replacementBloomColor) },
			...createHeroTextRevealUniforms(options.revealSeed),
		};
		this.reveal = new HeroTextRevealController([{ uniforms: this.uniforms }], { revealSeed: options.revealSeed });
		this.reveal.prepareHidden();
		this.readyPromise = this._prepare();
	}
	async _prepare() {
		const mediumHomeVisualConfig = getHomeTextVisualSettings(getGraphicsTier());
		const copies = this.copies ?? Object.keys(HERO_COPY).map(locale => ({ key: locale,
			text: HERO_COPY[locale][this.shaderProfile === "stack" ? "stack" : "tagline"],
			fontFamily: this.shaderProfile === "stack" ? getHeroStackFontFamily(locale) : getHeroSubtitleFontFamily(locale) }));
		const cssScale = 1920 / this.canvasWidth;
		this.cssFontSize = this.fontSize * cssScale;
		this.cssLineHeight = this.lineHeight * cssScale;
		const nativeSmallGlyphs = getGraphicsTier() !== "high" && ["hint", "stack"].includes(this.shaderProfile);
		this.nativeSmallGlyphs = nativeSmallGlyphs;
		if (nativeSmallGlyphs) {
			this.cssFontSize = this.shaderProfile === "hint" ? 12 : 14;
			this.uniforms.uGlyphSharpness.value = mediumHomeVisualConfig.textSharpness;
			this.uniforms.uGlyphBrightness.value = mediumHomeVisualConfig.textBrightness;
			this.uniforms.uGlyphDensity.value = mediumHomeVisualConfig.textDensity;
			// Alpha already lives in the atlas. Keep ink independent of transparent
			// black texels, which otherwise darken the antialiased edge a second time.
			const ink = (this.fontColor ?? "#ffffff").replace(/^rgba\(([^,]+,[^,]+,[^,]+),[^)]+\)$/, "rgb($1)");
			this.uniforms.uGlyphInk.value.setStyle(ink);
		}
		const style = { name: this.shaderProfile, fontSize: this.cssFontSize, lineHeight: this.cssLineHeight,
			// Paint clean glyphs at their final pixel size with native font hinting.
			// The atlas duplicates these pixels exactly; only snake symbols use 2x.
			nativeSmallGlyphs,
			fontWeight: nativeSmallGlyphs ? (this.shaderProfile === "hint" ? 500 : 600) : this.fontWeight,
			letterSpacing: nativeSmallGlyphs && this.shaderProfile === "stack" ? 0.14 : (this.letterSpacing ?? 0), color: this.fontColor,
			inset: this.decorativeTopLine ? this.cssLineHeight * 0.72 : 0,
			replacementGlowStrength: heroTextGlitchConfig.replacementGlowStrength,
			...(this.glyphStyle ?? {}),
			decoration: this.decorativeTopLine ? { thickness: this.width / this.canvasWidth } : null };
		if (nativeSmallGlyphs && this.shaderProfile === "stack") {
			const msdf = await loadHeroStackMsdf();
			if (this.disposed || this.renderer.getContext().isContextLost()) { msdf.texture.dispose(); return; }
			this.msdf = style.msdf = msdf;
			Object.assign(this.uniforms, {
				uMsdfTexture: { value: msdf.texture },
				uMsdfUnitRange: { value: new THREE.Vector2(msdf.atlas.distanceRange / msdf.atlas.width, msdf.atlas.distanceRange / msdf.atlas.height) },
				uMsdfEnabled: { value: mediumHomeVisualConfig.stackTextRenderer === "msdf" ? 1 : 0 },
				uMsdfWeight: { value: mediumHomeVisualConfig.stackMsdfWeight },
			});
		}
		const atlas = await createHeroGlyphAtlas(this.renderer, copies, style,
			() => this.disposed || this.renderer.getContext().isContextLost());
		if (!atlas) { this.msdf?.texture.dispose(); return; }
		this.atlas = atlas;
		this.uniforms.uAtlasSize.value.set(atlas.width, atlas.height);
		this.uniforms.uTexture.value = atlas.texture;
		this.motion = new HeroGpuSnakeMotion(this.uniforms, atlas.variants, getHeroGlitchSnakeRunOptions);
		this.motion.set(Math.max(0, copies.findIndex(copy => copy.key === getHeroLocale())));
		const makeMaterial = pass => new THREE.ShaderMaterial({
			defines: this.shaderProfile === "hint" ? { HERO_SCROLL_LABEL: 1 } : (this.msdf ? { HERO_STACK_MSDF: 1 } : {}),
			uniforms: { ...this.uniforms, uPass: { value: pass } },
			vertexShader: heroGpuTextVertex, fragmentShader: heroGpuTextFragment,
			transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
			blending: this.shaderProfile === "subtitle" ? THREE.AdditiveBlending : THREE.NormalBlending,
		});
		this.textMaterial = makeMaterial(2);
		this.screenMaterial = makeMaterial(this.splitSymbols ? 1 : 0);
		this.textMesh = new THREE.Mesh(atlas.geometry, this.textMaterial);
		this.screenMesh = new THREE.Mesh(atlas.geometry, this.screenMaterial);
		for (const mesh of [this.textMesh, this.screenMesh]) {
			mesh.frustumCulled = false; mesh.renderOrder = 21;
			mesh.onBeforeRender = renderer => this.syncRenderPixelRatio(renderer);
		}
		this.scene.add(this.textMesh); this.overlayScene.add(this.screenMesh);
		this.applyShaderConfig(); this.setPosition(this.offsetX, this.offsetY); this._syncPass();
	}
	getLineHeightVw() { return this.lineHeight * 1920 / this.width / this.canvasWidth; }
	getBlockHeightVw() { return (this.text.length + (this.decorativeTopLine ? 0.72 : 0)) * this.getLineHeightVw(); }
	getBlockBottomOffsetY() { return this.offsetY + this.getBlockHeightVw(); }
	setPosition(x = this.offsetX, y = this.offsetY) {
		this.offsetX = x; this.offsetY = y;
		this.uniforms.uOrigin.value.set(x * this.width, y * this.width);
		this.uniforms.uResolution.value.set(this.width, this.height);
		this.uniforms.uDecorationWidth.value = (this.decorativeLineWidthVw ?? 0) * this.width;
		this.uniforms.uDecorationThickness.value = Math.max(1, this.fontSize * 1920 / this.width * 0.018) * this.width / this.canvasWidth;
		this.uniforms.uResolutionDpr.value = this.renderer.getPixelRatio();
		this.uniforms.uLayoutDpr.value = getScenePixelRatio(this.renderer);
		const sourceFontSize = this.fontSize * 1920 / this.width;
		const { blur } = resolveReplacementGlowMetrics(sourceFontSize, heroTextGlitchConfig.replacementGlowStrength);
		const pad = Math.ceil(blur * 3.2 + sourceFontSize * 0.85) * this.width / this.canvasWidth;
		this.uniforms.uBlockPad.value.set(pad, pad);
		this.uniforms.uBlockSize.value.set(this.width, this.getBlockHeightVw() * this.width + 2 * pad);
	}
	applyShaderConfig() {
		if (this.shaderProfile !== "hint") {
			applyHeroTitleShaderUniforms(this.uniforms, heroTextShaderConfig, this.shaderProfile);
			applyHeroGlitchShaderUniforms({ uniforms: this.uniforms });
		}
	}
	playRevealEnter(ms, options) { return this.reveal.playEnter(ms, options); }
	playRevealExit(ms, options) { return this.reveal.playExit(ms, options); }
	finishLocaleSwitch() { this.motion?.finish(); }
	switchLocaleWithSnake(lines, { animate = true } = {}) {
		if (this.disposed) return Promise.resolve();
		if (!this.motion) return this.readyPromise.then(() => this.switchLocaleWithSnake(lines, { animate }));
		const index = this.atlas.variants.findIndex(copy => copy.text.join("\n") === lines.join("\n"));
		if (index < 0) return Promise.reject(new Error("Home locale was not prepared"));
		this.text = [...lines]; this.fontFamily = this.atlas.variants[index].fontFamily;
		if (!animate) { this.motion.set(index); return Promise.resolve(); }
		const options = getHeroGlitchSnakeRunOptions();
		const result = this.motion.start(index, options);
		if (result.duration > 0 && options.playSound !== false && this.shaderProfile !== "hint") playGlitchTextSound(result.duration, "hover");
		return result.promise;
	}
	switchLocaleInstant(lines, options) { return this.switchLocaleWithSnake(lines, { ...options, animate: false }); }
	// All locale tiles share one atlas, already uploaded by the curtain draw.
	uploadPreparedTexture() {}
	syncRenderPixelRatio(renderer) {
		this.uniforms.uResolutionDpr.value = renderer.getRenderTarget() ? getScenePixelRatio(renderer) : renderer.getPixelRatio();
	}
	beginScreenWarmupDraw() {
		if (!this.msdf) return;
		// Draw the MSDF branch even if the saved A/B choice is raster. Restore all
		// reveal/locale state before the curtain opens; the toggle is uniform-only.
		const warm = { uMsdfEnabled: 1, uRevealProgress: 1, uRevealLinear: 1,
			uRevealGlitchProgress: 0, uSnakeTime: -1, uLocaleFrom: 0 };
		const saved = Object.keys(warm).map(key => [key, this.uniforms[key].value]);
		for (const [key, value] of Object.entries(warm)) this.uniforms[key].value = value;
		return () => { for (const [key, value] of saved) this.uniforms[key].value = value; };
	}
	_syncPass() {
		if (!this.textMesh) return;
		const visible = this.uniforms.uRevealProgress.value > 0;
		this.textMaterial.uniforms.uPass.value = this.composeMode === "models" ? 0 : 2;
		this.textMesh.visible = visible && (this.composeMode === "models" || this.decorativeTopLine || (this.splitSymbols && !!this.motion.pending));
		this.screenMesh.visible = visible && this.composeMode === "screen";
	}
	setComposeMode(mode) { this.composeMode = mode === "models" ? "models" : "screen"; this._syncPass(); }
	renderScreenOverlay(renderer) {
		if (this.composeMode !== "screen" || !this.screenMesh?.visible) return;
		const clear = renderer.autoClear;
		try { renderer.autoClear = false; renderer.render(this.overlayScene, this.overlayCamera); }
		finally { renderer.autoClear = clear; }
	}
	update(delta) { this.motion?.update(delta); this.reveal.update(delta); this._syncPass(); }
	resize(x = this.offsetX) { this.width = window.innerWidth; this.height = window.innerHeight; this.setPosition(x, this.offsetY); }
	dispose() {
		if (this.disposed) return;
		this.disposed = true; this.motion?.finish();
		this.textMesh?.removeFromParent(); this.screenMesh?.removeFromParent();
		this.textMaterial?.dispose(); this.screenMaterial?.dispose();
		this.atlas?.geometry.dispose(); this.atlas?.texture.dispose();
		this.msdf?.texture.dispose();
	}
}
