import * as THREE from "three";
import { getGraphicsTier } from "@/functions/getGraphicsTier.js";
import { getHomeTextVisualSettings } from "../../mediumHomeVisualConfig.js";
import { subscribe } from "valtio/vanilla";
import { store } from "@/app/store.jsx";
import { HERO_SCROLL_HINT_TRANSLATIONS } from "@/app/localization/interfaceTranslations.js";
import { normalizeSiteLocale } from "@/functions/siteLocale.js";
import { shouldAnimateSiteLocaleForRingScene } from "@/functions/siteLocaleSwitch.js";
import { HeroGpuTextMesh } from "./HeroGpuTextMesh.js";
import { heroScrollCueVertex, heroScrollCueFragment } from "./heroScrollCueShaders.js";
import { resolveHeroScrollHintPosition } from "../heroTextLayout.js";
import { heroTextPositionConfig } from "../heroTextPositionConfig.js";
import { heroTextRevealConfig } from "../heroTextRevealConfig.js";
import { heroScrollHintConfig as cfg, rgbaFromHex } from "../heroScrollHintConfig.js";
import { getHeroSubtitleFontFamily } from "../heroTitleConfig.js";
import { heroTextGlitchConfig, resolveHeroReplacementDisplayChar, resolveHeroReplacementMetrics } from "../heroTextGlitchConfig.js";

/** Static text atlas + analytic mouse/comet. No Canvas work in update(). */
export class HeroGpuScrollHintMesh extends HeroGpuTextMesh {
	constructor(renderer, scene) {
		const crispCue = getGraphicsTier() !== "high";
		const mediumHomeVisualConfig = getHomeTextVisualSettings(getGraphicsTier());
		const locale = normalizeSiteLocale(store.siteLocale);
		const text = HERO_SCROLL_HINT_TRANSLATIONS[locale] ?? HERO_SCROLL_HINT_TRANSLATIONS.ru;
		super({ renderer, scene, shaderProfile: "hint", canvasWidth: 1920, text: [text],
			fontSize: 11, lineHeight: 14, fontWeight: 400, fontColor: rgbaFromHex(cfg.labelColor, 0.96), letterSpacing: 0.16,
			offsetX: 0, offsetY: 0, revealSeed: heroTextRevealConfig.subtitleRevealSeed + 0.23, splitSymbols: false, clipMinX: -1,
			copies: ["ru", "en", "zh"].map(key => ({ key, text: [HERO_SCROLL_HINT_TRANSLATIONS[key]], fontFamily: getHeroSubtitleFontFamily(key) })),
			glyphStyle: { pad: 14, mainGlow: crispCue ? null : { color: cfg.labelGlowColor,
				strength: cfg.labelGlowStrength, blur: cfg.labelGlowBlur },
				replacementGlowStrength: cfg.snakeGlowStrength, replacementShadowBlur: cfg.labelGlowBlur, replacementFullOpacity: true,
				snakeProfile: { replacementFontFamily: heroTextGlitchConfig.replacementFontFamily,
					replacementFontWeight: heroTextGlitchConfig.replacementFontWeight, replacementFlipAxes: false,
					replacementColor: cfg.snakeLetterColor, replacementShadowColor: cfg.snakeGlowColor,
					resolveReplacementDisplayChar: resolveHeroReplacementDisplayChar,
					resolveReplacementMetrics(char) { const m = resolveHeroReplacementMetrics(char); return m.isCjk ? m : { ...m, scaleX: 1, scaleY: 1, offsetYEm: 0 }; } } } });
		this.elapsed = 0;
		this.crispCue = crispCue;
		this.desiredLocale = locale; this.displayedLocale = locale;
		this.cueUniforms = { ...this.uniforms, uCueTime: { value: 0 }, uBloomBoost: { value: crispCue ? 1 : cfg.bloomBoost },
			uLocalGlow: { value: crispCue ? 1 : 0 },
			uGlowStrength: { value: mediumHomeVisualConfig.mouseGlow }, uGlowWidth: { value: mediumHomeVisualConfig.mouseGlowWidth },
			uTrackAlpha: { value: cfg.trackAlpha }, uCueMain: { value: new THREE.Color(crispCue ? mediumHomeVisualConfig.mouseColor : cfg.mainColor) },
			uCueBright: { value: new THREE.Color(crispCue ? mediumHomeVisualConfig.mouseColor : cfg.brightColor) }, uCueOrigin: { value: new THREE.Vector2() } };
		this.material = new THREE.ShaderMaterial({ uniforms: this.cueUniforms,
			vertexShader: heroScrollCueVertex, fragmentShader: heroScrollCueFragment,
			transparent: true, depthWrite: false, depthTest: false, toneMapped: false });
		this.geometry = new THREE.PlaneGeometry(1, 1); this.geometry.translate(0.5, 0.5, 0);
		this.mesh = new THREE.Mesh(this.geometry, this.material);
		this.mesh.onBeforeRender = renderer => this.syncRenderPixelRatio(renderer);
		this.mesh.frustumCulled = false; this.mesh.renderOrder = 22; this.mesh.visible = false; scene.add(this.mesh);
		this.setComposeMode(this.composeMode);
		this.unsubscribe = subscribe(store, () => {
			const next = normalizeSiteLocale(store.siteLocale);
			if (next !== this.desiredLocale) { this.desiredLocale = next; void this._syncLocale(); }
		});
		this.readyPromise = this.readyPromise.then(() => { this.labelMesh = this.screenMesh; this.applyPosition(); });
		this.applyPosition();
	}
	async _syncLocale(animate = shouldAnimateSiteLocaleForRingScene("home")) {
		if (this.disposed) return;
		if (!animate) this.finishLocaleSwitch();
		if (this.switching) {
			await this.switchPromise;
			if (!animate) return this._syncLocale(false);
			return;
		}
		if (this.desiredLocale === this.displayedLocale) return;
		this.switching = true;
		const target = this.desiredLocale;
		try {
			this.switchPromise = this.switchLocaleWithSnake([HERO_SCROLL_HINT_TRANSLATIONS[target]], { animate });
			await this.switchPromise;
			this.displayedLocale = target;
		} finally {
			this.switching = false;
			if (!this.disposed && this.desiredLocale !== this.displayedLocale) void this._syncLocale();
		}
	}
	syncLocaleForActivation() { this.desiredLocale = normalizeSiteLocale(store.siteLocale); return this._syncLocale(false); }
	applyPosition() {
		const { leftPx, topPx } = resolveHeroScrollHintPosition(heroTextPositionConfig);
		this.width = window.innerWidth; this.height = window.innerHeight;
		this.setPosition((Math.round(leftPx - 72) + 105) / this.width, (Math.round(topPx) + 14) / this.width);
		this.uniforms.uBlockSize.value.set(394, 158);
		this.uniforms.uBlockPad.value.set(105, 14);
		this.cueUniforms?.uCueOrigin.value.set(Math.round(leftPx - 72), Math.round(topPx));
	}
	playRevealEnter(ms = heroTextRevealConfig.enterDurationMs, options) { this.mesh.visible = true; return super.playRevealEnter(ms, options); }
	reset() { this.finishLocaleSwitch(); this.reveal.prepareHidden(); if (this.mesh) this.mesh.visible = false; this._syncPass(); }
	update(delta) {
		super.update(delta);
		if (!this.mesh.visible && !this.screenMesh?.visible) return;
		this.elapsed += delta;
		this.cueUniforms.uCueTime.value = this.elapsed;
		this.cueUniforms.uBloomBoost.value = this.crispCue ? 1 : cfg.bloomBoost;
		this.cueUniforms.uTrackAlpha.value = cfg.trackAlpha;
		const visual = getHomeTextVisualSettings(getGraphicsTier());
		const mainColor = this.crispCue ? visual.mouseColor : cfg.mainColor;
		const brightColor = this.crispCue ? visual.mouseColor : cfg.brightColor;
		if (this.lastMainColor !== mainColor) {
			this.lastMainColor = mainColor; this.cueUniforms.uCueMain.value.set(mainColor);
		}
		if (this.lastBrightColor !== brightColor) {
			this.lastBrightColor = brightColor; this.cueUniforms.uCueBright.value.set(brightColor);
		}
	}
	resize() { this.applyPosition(); }
	setComposeMode(mode) {
		super.setComposeMode(mode);
		if (!this.crispCue || !this.mesh) return;
		const parent = this.composeMode === "screen" ? this.overlayScene : this.scene;
		if (this.mesh.parent !== parent) parent.add(this.mesh);
	}
	getWarmupModelMeshes() { return [this.mesh]; }
	dispose() {
		if (this.disposed) return;
		this.unsubscribe?.(); super.dispose(); this.mesh.removeFromParent(); this.material.dispose(); this.geometry.dispose();
	}
}
