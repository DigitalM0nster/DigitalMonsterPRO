import * as THREE from "three";
import { subscribe } from "valtio";
import { store } from "@/store.jsx";
import { HERO_SCROLL_HINT_COPY } from "@/i18n/siteCopy.js";
import { normalizeSiteLocale } from "@/utils/siteLocale.js";
import { resolveHeroScrollHintPosition } from "./heroTextLayout.js";
import { heroTextPositionConfig } from "./heroTextPositionConfig.js";
import { HeroTextGlitchController } from "./HeroTextGlitchController.js";
import { drawHeroGlitchLine } from "./drawHeroGlitchText.js";
import { heroTextGlitchConfig, resolveHeroReplacementDisplayChar, resolveHeroReplacementMetrics } from "./heroTextGlitchConfig.js";
import { getGlitchMainDrawAlpha, isGlitchMainHidden } from "@/shared/glitchText/glitchLetterModel.js";
import { createHeroTextRevealUniforms, HeroTextRevealController } from "./heroTextReveal.js";
import { heroTextRevealConfig } from "./heroTextRevealConfig.js";
import { heroScrollHintConfig, rgbaFromHex } from "./heroScrollHintConfig.js";

const CONTENT_WIDTH = 250;
// Horizontal glitch slices need room past the visible glyph bounds.
const HORIZONTAL_EFFECT_PADDING = 72;
const CSS_WIDTH = CONTENT_WIDTH + HORIZONTAL_EFFECT_PADDING * 2;
const CSS_HEIGHT = 158;
const ANIMATION_FPS = 60;
/** Snake pass — short enough that exit→reappear doesn’t feel idle. */
const CYCLE_SECONDS = 2.05;
/** Smooth wheel bob (independent of snake phase — no end-of-cycle snap). */
const WHEEL_CYCLE_SECONDS = 1.35;
const SCROLL_HINT_REPLACEMENT_SCALE = 0.72;

/**
 * CanvasTexture flipY=true → canvas top is high vUv.y.
 * Split must sit between mouse right edge (~0.24) and label left (~0.26).
 * Old 0.28 cut through «Л» → that glyph got models bloomBoost, the rest did not.
 */
const LABEL_ZONE_GLSL = /* glsl */ `
float scrollHintLabelZone(vec2 uv) {
	return step(0.252, uv.x) * step(0.62, uv.y);
}
`;

function mainRgba(alpha) {
	return rgbaFromHex(heroScrollHintConfig.mainColor, alpha);
}

function brightRgba(alpha) {
	return rgbaFromHex(heroScrollHintConfig.brightColor, alpha);
}

function labelRgba(alpha) {
	return rgbaFromHex(heroScrollHintConfig.labelColor ?? heroScrollHintConfig.mainColor, alpha);
}

function resolveHintDpr(renderer) {
	const rendererDpr = renderer?.getPixelRatio?.() ?? window.devicePixelRatio ?? 1;
	return Math.max(1, Math.min(2, rendererDpr));
}

/** Mouse + descending light cue. */
const SCROLL_SNAKE = {
	mouseW: 17,
	mouseH: 27,
	mouseRadius: 8.5,
	wheelLen: 5.5,
	wheelTravel: 2.2,
	trackWidth: 0.3,
	trailLen: 100,
};
const scrollHintSnakeProfile = {
	replacementFontFamily: heroTextGlitchConfig.replacementFontFamily,
	replacementFontWeight: heroTextGlitchConfig.replacementFontWeight,
	get replacementColor() {
		return heroScrollHintConfig.labelColor ?? heroScrollHintConfig.mainColor;
	},
	get replacementShadowColor() {
		return heroScrollHintConfig.labelGlowColor ?? heroScrollHintConfig.labelColor;
	},
	get replacementGlowStrength() {
		return Math.max(0, heroScrollHintConfig.labelGlowStrength ?? 0);
	},
	resolveReplacementDisplayChar: resolveHeroReplacementDisplayChar,
	resolveReplacementMetrics(sourceChar) {
		const metrics = resolveHeroReplacementMetrics(sourceChar);
		return {
			...metrics,
			scaleX: metrics.scaleX * SCROLL_HINT_REPLACEMENT_SCALE,
			scaleY: metrics.scaleY * SCROLL_HINT_REPLACEMENT_SCALE,
			offsetYEm: metrics.offsetYEm * SCROLL_HINT_REPLACEMENT_SCALE,
		};
	},
};

const vertexShader = /* glsl */ `
uniform vec2 uResolution;
uniform vec2 uTopLeft;
uniform vec2 uSize;
varying vec2 vUv;

void main() {
	vUv = uv;
	vec2 pixel = uTopLeft + vec2(position.x, 1.0 - position.y) * uSize;
	vec2 clip = vec2(
		pixel.x / uResolution.x * 2.0 - 1.0,
		1.0 - pixel.y / uResolution.y * 2.0
	);
	gl_Position = vec4(clip, 1.0, 1.0);
}
`;

/** Models RT: mouse + snake only — HDR lift for site bloom. */
const cueFragmentShader = /* glsl */ `
uniform sampler2D uTexture;
uniform float uOpacity;
uniform float uBloomBoost;
uniform float uRevealProgress;
uniform float uRevealLinear;
uniform float uRevealGlitchProgress;
uniform float uRevealGlitchTime;
uniform float uRevealGlitchIntensity;
uniform float uRevealSweepSpread;
varying vec2 vUv;

${LABEL_ZONE_GLSL}

void main() {
	if (scrollHintLabelZone(vUv) > 0.5) {
		discard;
	}
	vec2 revealCell = floor(vUv * vec2(28.0, 16.0));
	float revealNoise = fract(sin(dot(revealCell, vec2(12.9898, 78.233))) * 43758.5453);
	float revealMask = smoothstep(revealNoise - 0.16, revealNoise + 0.10, uRevealLinear) * uRevealProgress;
	float slice = floor(vUv.y * 40.0);
	float glitchNoise = fract(sin(slice * 91.73 + uRevealGlitchTime * 37.0) * 43758.5453) - 0.5;
	vec2 sampleUv = vUv + vec2(glitchNoise * uRevealGlitchIntensity * 3.0 * uRevealGlitchProgress, 0.0);
	vec4 color = texture2D(uTexture, sampleUv);
	float lift = mix(1.0, uBloomBoost, smoothstep(0.08, 0.55, color.a));
	gl_FragColor = vec4(color.rgb * lift, color.a * uOpacity * revealMask);
}
`;

/** After-bloom screen overlay: label only — LDR, sharp glyphs. */
const labelFragmentShader = /* glsl */ `
uniform sampler2D uTexture;
uniform float uOpacity;
uniform float uRevealProgress;
uniform float uRevealLinear;
uniform float uRevealGlitchProgress;
uniform float uRevealGlitchTime;
uniform float uRevealGlitchIntensity;
uniform float uRevealSweepSpread;
varying vec2 vUv;

${LABEL_ZONE_GLSL}

void main() {
	if (scrollHintLabelZone(vUv) < 0.5) {
		discard;
	}
	vec2 revealCell = floor(vUv * vec2(28.0, 16.0));
	float revealNoise = fract(sin(dot(revealCell, vec2(12.9898, 78.233))) * 43758.5453);
	float revealMask = smoothstep(revealNoise - 0.16, revealNoise + 0.10, uRevealLinear) * uRevealProgress;
	float slice = floor(vUv.y * 40.0);
	float glitchNoise = fract(sin(slice * 91.73 + uRevealGlitchTime * 37.0) * 43758.5453) - 0.5;
	vec2 sampleUv = vUv + vec2(glitchNoise * uRevealGlitchIntensity * 3.0 * uRevealGlitchProgress, 0.0);
	vec4 color = texture2D(uTexture, sampleUv);
	if (color.a < 0.04) {
		discard;
	}
	gl_FragColor = vec4(color.rgb, color.a * uOpacity * revealMask);
}
`;

/**
 * Long tapering comet: soft outer fade + thin bright core near the tip.
 */
function drawScrollSnake(context, x, tipY, trailLen, strength) {
	const s = Math.max(0, Math.min(1, strength));
	const top = tipY - trailLen;

	context.save();
	context.lineCap = "round";
	context.lineJoin = "round";
	context.shadowBlur = 0;
	context.shadowColor = "transparent";

	// Soft veil — almost invisible for most of the length, gently gathers near the tip.
	const veil = context.createLinearGradient(x, top, x, tipY);
	veil.addColorStop(0, mainRgba(0));
	veil.addColorStop(0.35, mainRgba(0));
	veil.addColorStop(0.62, mainRgba(0.05 * s));
	veil.addColorStop(0.85, mainRgba(0.14 * s));
	veil.addColorStop(1, brightRgba(0.22 * s));
	context.strokeStyle = veil;
	context.lineWidth = 1.55;
	context.beginPath();
	context.moveTo(x, top);
	context.lineTo(x, tipY);
	context.stroke();

	// Fine core — long transparent lead-in, bright only in the last third.
	const core = context.createLinearGradient(x, top, x, tipY);
	core.addColorStop(0, mainRgba(0));
	core.addColorStop(0.45, mainRgba(0));
	core.addColorStop(0.7, mainRgba(0.08 * s));
	core.addColorStop(0.88, brightRgba(0.42 * s));
	core.addColorStop(1, brightRgba(0.95 * s));
	context.strokeStyle = core;
	context.lineWidth = 0.85;
	context.beginPath();
	context.moveTo(x, top);
	context.lineTo(x, tipY);
	context.stroke();

	context.restore();
}

function createHintMaterial(texture, fragmentShader, { bloomBoost = false } = {}) {
	const uniforms = {
		uTexture: { value: texture },
		uOpacity: { value: 0 },
		uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
		uTopLeft: { value: new THREE.Vector2() },
		uSize: { value: new THREE.Vector2(CSS_WIDTH, CSS_HEIGHT) },
		...createHeroTextRevealUniforms(heroTextRevealConfig.subtitleRevealSeed + 0.23),
	};
	if (bloomBoost) {
		uniforms.uBloomBoost = { value: heroScrollHintConfig.bloomBoost };
	}
	return new THREE.ShaderMaterial({
		uniforms,
		vertexShader,
		fragmentShader,
		transparent: true,
		depthTest: false,
		depthWrite: false,
		blending: THREE.NormalBlending,
		toneMapped: false,
	});
}

export class HeroScrollHintMesh {
	constructor(renderer, scene) {
		this.renderer = renderer;
		this.scene = scene;
		this.elapsed = 0;
		this.drawAccumulator = 0;
		this.displayedLocale = normalizeSiteLocale(store.siteLocale);
		this.desiredLocale = this.displayedLocale;
		this.localeSwitching = false;
		this.dpr = resolveHintDpr(renderer);

		this.canvas = document.createElement("canvas");
		this.canvas.width = Math.round(CSS_WIDTH * this.dpr);
		this.canvas.height = Math.round(CSS_HEIGHT * this.dpr);
		this.context = this.canvas.getContext("2d", { alpha: true });
		this.context.scale(this.dpr, this.dpr);

		this.texture = new THREE.CanvasTexture(this.canvas);
		this.texture.colorSpace = THREE.SRGBColorSpace;
		// Linear AA for 11px type; Nearest made glyphs look chunky/ugly on overlay.
		this.texture.minFilter = THREE.LinearFilter;
		this.texture.magFilter = THREE.LinearFilter;
		this.texture.generateMipmaps = false;

		this.geometry = new THREE.BufferGeometry();
		this.geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], 3));
		this.geometry.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
		this.geometry.setIndex([0, 1, 2, 0, 2, 3]);

		// Cue (mouse/snake) stays in models RT so bloomBoost still works.
		this.material = createHintMaterial(this.texture, cueFragmentShader, { bloomBoost: true });
		this.mesh = new THREE.Mesh(this.geometry, this.material);
		this.mesh.frustumCulled = false;
		this.mesh.renderOrder = 22;
		this.mesh.visible = false;
		this.scene.add(this.mesh);

		// Label composites after bloom — same pattern as CaseStudyPanelHudMesh screen mode.
		this.overlayScene = new THREE.Scene();
		this.overlayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
		this.labelMaterial = createHintMaterial(this.texture, labelFragmentShader);
		this.labelMesh = new THREE.Mesh(this.geometry, this.labelMaterial);
		this.labelMesh.frustumCulled = false;
		this.labelMesh.renderOrder = 1300;
		this.labelMesh.visible = false;
		this.overlayScene.add(this.labelMesh);

		this.reveal = new HeroTextRevealController([this.material, this.labelMaterial], {
			revealSeed: heroTextRevealConfig.subtitleRevealSeed + 0.23,
		});
		this.reveal.prepareHidden();
		this.glitchController = new HeroTextGlitchController({
			uppercase: false,
			onRedraw: () => this._draw(),
		});
		this.glitchController.setText([HERO_SCROLL_HINT_COPY[this.displayedLocale] ?? HERO_SCROLL_HINT_COPY.ru]);

		this.unsubscribe = subscribe(store, () => {
			const locale = normalizeSiteLocale(store.siteLocale);
			if (locale !== this.desiredLocale) {
				this.desiredLocale = locale;
				this._startLocaleAnimation();
			}
		});

		this.applyPosition();
		this._draw();
	}

	_startLocaleAnimation() {
		if (this.localeSwitching || this.desiredLocale === this.displayedLocale) return;
		this.localeSwitching = true;
		const targetLocale = this.desiredLocale;
		const targetText = HERO_SCROLL_HINT_COPY[targetLocale] ?? HERO_SCROLL_HINT_COPY.ru;

		this.glitchController.runLanguageSwitch([targetText], { playSound: false }).then(() => {
			this.displayedLocale = targetLocale;
			this.localeSwitching = false;
			this._startLocaleAnimation();
		});
	}

	playRevealEnter(durationMs = heroTextRevealConfig.enterDurationMs) {
		this.mesh.visible = true;
		this.labelMesh.visible = true;
		this.material.uniforms.uOpacity.value = 1;
		this.labelMaterial.uniforms.uOpacity.value = 1;
		return this.reveal.playEnter(durationMs);
	}

	reset() {
		this.reveal.prepareHidden();
		this.material.uniforms.uOpacity.value = 0;
		this.labelMaterial.uniforms.uOpacity.value = 0;
		this.mesh.visible = false;
		this.labelMesh.visible = false;
	}

	/** After final blit — sharp LDR label (not in HalfFloat bloom chain). */
	renderScreenOverlay(renderer) {
		if (!this.labelMesh.visible) {
			return;
		}

		const prevAutoClear = renderer.autoClear;
		renderer.autoClear = false;
		renderer.render(this.overlayScene, this.overlayCamera);
		renderer.autoClear = prevAutoClear;
	}

	_drawLabel(context, mouseX, mouseTop) {
		const cfg = heroScrollHintConfig;
		const fontSize = 11;
		const fontWeight = 400;
		const fontFamily = "Jura, sans-serif";
		const letterSpacing = 0.16;
		const letterSpacingPx = fontSize * letterSpacing;
		const mouseCenterY = mouseTop + SCROLL_SNAKE.mouseH * 0.5;
		// Text starts just right of the mouse; vertically centered on the mouse body.
		const labelX = Math.round(mouseX + SCROLL_SNAKE.mouseW * 0.5 + 10);
		const labelTop = mouseCenterY - fontSize * 0.5;
		const glowStrength = Math.max(0, cfg.labelGlowStrength ?? 0);
		const glowBlur = Math.max(0, cfg.labelGlowBlur ?? 0);

		context.save();
		context.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
		context.textBaseline = "top";
		context.textAlign = "left";

		if (glowStrength > 0.001 && glowBlur > 0.001) {
			// Keep glow out of the mouse/cue UV band — otherwise the first glyph
			// bleeds into bloomBoost and looks uniquely bright («Л» only).
			context.save();
			context.beginPath();
			context.rect(labelX - 1, 0, CSS_WIDTH - labelX + 1, CSS_HEIGHT);
			context.clip();

			context.shadowColor = rgbaFromHex(cfg.labelGlowColor ?? cfg.labelColor, 1);
			context.shadowBlur = glowBlur;
			context.fillStyle = labelRgba(1);
			const passes = Math.min(5, Math.max(1, Math.ceil(glowStrength)));
			for (let pass = 0; pass < passes; pass += 1) {
				let cursorX = labelX;
				for (const group of this.glitchController.primaryGroups) {
					for (const slot of group.slots) {
						if (slot.isSpace) {
							cursorX += fontSize * 0.35;
							continue;
						}
						const mainAlpha = getGlitchMainDrawAlpha(slot);
						if (!isGlitchMainHidden(slot) && mainAlpha > 0.001) {
							context.globalAlpha = mainAlpha * Math.min(1, 0.45 + glowStrength * 0.12);
							context.fillText(slot.char, cursorX, labelTop);
						}
						cursorX += context.measureText(slot.char).width + letterSpacingPx;
					}
				}
			}
			context.restore();
			context.shadowBlur = 0;
			context.shadowColor = "transparent";
			context.globalAlpha = 1;
		}

		const style = {
			fontSize,
			fontWeight,
			fontFamily,
			letterSpacing,
			color: labelRgba(0.96),
			replacementGlowStrength: glowStrength,
			replacementShadowBlur: glowBlur,
			replacementFullOpacity: true,
			snakeProfile: scrollHintSnakeProfile,
		};

		for (const group of this.glitchController.primaryGroups) {
			drawHeroGlitchLine(context, group.slots, labelX, labelTop, style);
		}
		for (const group of this.glitchController.secondaryGroups ?? []) {
			drawHeroGlitchLine(context, group.slots, labelX, labelTop, style);
		}
		context.restore();
	}

	applyPosition() {
		const { leftPx, topPx } = resolveHeroScrollHintPosition(heroTextPositionConfig);
		const width = window.innerWidth;
		const height = window.innerHeight;
		const topLeftX = Math.round(leftPx - HORIZONTAL_EFFECT_PADDING);
		const topLeftY = Math.round(topPx);

		for (const material of [this.material, this.labelMaterial]) {
			material.uniforms.uResolution.value.set(width, height);
			material.uniforms.uTopLeft.value.set(topLeftX, topLeftY);
			material.uniforms.uSize.value.set(CSS_WIDTH, CSS_HEIGHT);
		}
	}

	_draw() {
		const context = this.context;
		if (!context) return;

		context.clearRect(0, 0, CSS_WIDTH, CSS_HEIGHT);
		context.shadowBlur = 0;
		context.shadowColor = "transparent";
		context.globalAlpha = 1;

		const phase = (this.elapsed % CYCLE_SECONDS) / CYCLE_SECONDS;
		const snake = SCROLL_SNAKE;

		const mouseX = 14 + HORIZONTAL_EFFECT_PADDING;
		const mouseTop = 6;
		const mouseLeft = mouseX - snake.mouseW * 0.5;

		context.strokeStyle = brightRgba(0.92);
		context.lineWidth = 1.15;
		context.beginPath();
		context.roundRect(mouseLeft, mouseTop, snake.mouseW, snake.mouseH, snake.mouseRadius);
		context.stroke();

		const wheelT = (this.elapsed % WHEEL_CYCLE_SECONDS) / WHEEL_CYCLE_SECONDS;
		const wheelTravel = (0.5 - 0.5 * Math.cos(wheelT * Math.PI * 2)) * snake.wheelTravel;
		context.strokeStyle = brightRgba(0.88);
		context.lineWidth = 1.2;
		context.lineCap = "round";
		context.beginPath();
		context.moveTo(mouseX, mouseTop + 8 + wheelTravel);
		context.lineTo(mouseX, mouseTop + 8 + snake.wheelLen + wheelTravel);
		context.stroke();

		const lineTop = 48;
		const lineBottom = 142;
		const trackH = lineBottom - lineTop;
		const enterOvershoot = 8;
		const exitOvershoot = snake.trailLen;
		const travelStart = lineTop - enterOvershoot;
		const travelEnd = lineBottom + exitOvershoot;
		const tipY = travelStart + phase * (travelEnd - travelStart);
		const strength = 0.95;

		context.strokeStyle = mainRgba(heroScrollHintConfig.trackAlpha);
		context.lineWidth = snake.trackWidth;
		context.lineCap = "round";
		context.beginPath();
		context.moveTo(mouseX, lineTop);
		context.lineTo(mouseX, lineBottom);
		context.stroke();

		context.save();
		context.beginPath();
		context.rect(mouseX - 6, lineTop, 12, trackH);
		context.clip();
		drawScrollSnake(context, mouseX, tipY, snake.trailLen, strength);
		context.restore();

		if (this.material.uniforms.uBloomBoost) {
			this.material.uniforms.uBloomBoost.value = heroScrollHintConfig.bloomBoost;
		}
		this._drawLabel(context, mouseX, mouseTop);
		this.texture.needsUpdate = true;
	}

	update(delta) {
		this.elapsed += delta;
		this.reveal.update(delta);

		if (!this.mesh.visible && !this.labelMesh.visible) return;
		this.drawAccumulator += delta;
		if (this.drawAccumulator >= 1 / ANIMATION_FPS) {
			this.drawAccumulator %= 1 / ANIMATION_FPS;
			this._draw();
		}
	}

	resize() {
		const nextDpr = resolveHintDpr(this.renderer);
		if (nextDpr !== this.dpr) {
			this.dpr = nextDpr;
			this.canvas.width = Math.round(CSS_WIDTH * this.dpr);
			this.canvas.height = Math.round(CSS_HEIGHT * this.dpr);
			this.context = this.canvas.getContext("2d", { alpha: true });
			this.context.scale(this.dpr, this.dpr);
		}
		this.applyPosition();
		this._draw();
	}

	dispose() {
		this.unsubscribe?.();
		this.glitchController.dispose();
		this.scene.remove(this.mesh);
		this.overlayScene.remove(this.labelMesh);
		this.geometry.dispose();
		this.material.dispose();
		this.labelMaterial.dispose();
		this.texture.dispose();
	}
}
