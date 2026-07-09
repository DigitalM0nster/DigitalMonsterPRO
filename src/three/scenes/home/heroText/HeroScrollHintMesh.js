import * as THREE from "three";
import { subscribe } from "valtio";
import { store } from "@/store.jsx";
import { HERO_SCROLL_HINT_COPY } from "@/i18n/siteCopy.js";
import { normalizeSiteLocale } from "@/utils/siteLocale.js";
import { resolveHeroScrollHintPosition } from "./heroTextLayout.js";
import { heroTextPositionConfig } from "./heroTextPositionConfig.js";
import { HeroTextGlitchController } from "./HeroTextGlitchController.js";
import { drawHeroGlitchLine } from "./drawHeroGlitchText.js";
import {
	heroTextGlitchConfig,
	resolveHeroReplacementDisplayChar,
	resolveHeroReplacementMetrics,
} from "./heroTextGlitchConfig.js";
import {
	createHeroTextRevealUniforms,
	HeroTextRevealController,
} from "./heroTextReveal.js";
import { heroTextRevealConfig } from "./heroTextRevealConfig.js";

const CONTENT_WIDTH = 250;
// Strong bloom and the ×3 horizontal glitch need substantially more room than
// the visible glyph bounds; otherwise the offscreen texture clips the left halo.
const HORIZONTAL_EFFECT_PADDING = 72;
const CSS_WIDTH = CONTENT_WIDTH + HORIZONTAL_EFFECT_PADDING * 2;
const CSS_HEIGHT = 166;
const ANIMATION_FPS = 30;
const CYCLE_SECONDS = 2.35;
const SCROLL_HINT_REPLACEMENT_SCALE = 0.72;
const scrollHintSnakeProfile = {
	replacementFontFamily: heroTextGlitchConfig.replacementFontFamily,
	replacementFontWeight: heroTextGlitchConfig.replacementFontWeight,
	replacementColor: heroTextGlitchConfig.replacementBloomColor,
	replacementShadowColor: heroTextGlitchConfig.replacementBloomColor,
	replacementGlowStrength: heroTextGlitchConfig.replacementGlowStrength,
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

const fragmentShader = /* glsl */ `
uniform sampler2D uTexture;
uniform float uOpacity;
uniform float uRevealProgress;
uniform float uRevealLinear;
uniform float uRevealGlitchProgress;
uniform float uRevealGlitchTime;
uniform float uRevealGlitchIntensity;
uniform float uRevealSweepSpread;
uniform float uReplacementBloomBoost;
uniform vec3 uReplacementBloomTint;
varying vec2 vUv;

void main() {
	// Fragmented reveal instead of a hard left-to-right clip. A linear edge cuts
	// the mouse bloom in half; cell noise reveals pieces across the whole shape.
	vec2 revealCell = floor(vUv * vec2(28.0, 16.0));
	float revealNoise = fract(sin(dot(revealCell, vec2(12.9898, 78.233))) * 43758.5453);
	float revealMask = smoothstep(revealNoise - 0.16, revealNoise + 0.10, uRevealLinear) * uRevealProgress;
	float slice = floor(vUv.y * 40.0);
	float glitchNoise = fract(sin(slice * 91.73 + uRevealGlitchTime * 37.0) * 43758.5453) - 0.5;
	vec2 sampleUv = vUv + vec2(glitchNoise * uRevealGlitchIntensity * 3.0 * uRevealGlitchProgress, 0.0);
	vec4 color = texture2D(uTexture, sampleUv);
	float cyanDominance = min(color.b - color.r, color.g - color.r);
	float lowRedMask = 1.0 - smoothstep(0.08, 0.35, color.r);
	float replacementMask = smoothstep(0.08, 0.32, cyanDominance) * lowRedMask * color.a;
	vec3 hdrReplacement = uReplacementBloomTint * uReplacementBloomBoost * color.a;
	vec3 outputColor = mix(color.rgb, hdrReplacement, replacementMask);
	gl_FragColor = vec4(outputColor, color.a * uOpacity * revealMask);
}
`;

function easeInOut(t) {
	return t < 0.5 ? 2.0 * t * t : 1.0 - (-2.0 * t + 2.0) ** 2.0 * 0.5;
}

function drawGlowLine(context, x1, y1, x2, y2, color, width, blur, glowColor = color) {
	context.save();
	context.strokeStyle = color;
	context.lineWidth = width;
	context.shadowColor = glowColor;
	context.shadowBlur = blur;
	context.beginPath();
	context.moveTo(x1, y1);
	context.lineTo(x2, y2);
	context.stroke();
	context.restore();
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
		this.dpr = Math.min(2, window.devicePixelRatio || 1);

		this.canvas = document.createElement("canvas");
		this.canvas.width = Math.round(CSS_WIDTH * this.dpr);
		this.canvas.height = Math.round(CSS_HEIGHT * this.dpr);
		this.context = this.canvas.getContext("2d", { alpha: true });
		this.context.scale(this.dpr, this.dpr);

		this.texture = new THREE.CanvasTexture(this.canvas);
		this.texture.minFilter = THREE.LinearFilter;
		this.texture.magFilter = THREE.LinearFilter;
		this.texture.generateMipmaps = false;

		this.geometry = new THREE.BufferGeometry();
		this.geometry.setAttribute(
			"position",
			new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], 3),
		);
		this.geometry.setAttribute(
			"uv",
			new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2),
		);
		this.geometry.setIndex([0, 1, 2, 0, 2, 3]);

		this.material = new THREE.ShaderMaterial({
			uniforms: {
				uTexture: { value: this.texture },
				uOpacity: { value: 0 },
				uReplacementBloomBoost: { value: heroTextGlitchConfig.replacementBloomBoost },
				uReplacementBloomTint: { value: new THREE.Color(heroTextGlitchConfig.replacementBloomColor) },
				uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
				uTopLeft: { value: new THREE.Vector2() },
				uSize: { value: new THREE.Vector2(CSS_WIDTH, CSS_HEIGHT) },
				...createHeroTextRevealUniforms(heroTextRevealConfig.subtitleRevealSeed + 0.23),
			},
			vertexShader,
			fragmentShader,
			transparent: true,
			depthTest: false,
			depthWrite: false,
			blending: THREE.NormalBlending,
		});

		this.mesh = new THREE.Mesh(this.geometry, this.material);
		this.mesh.frustumCulled = false;
		this.mesh.renderOrder = 22;
		this.mesh.visible = false;
		this.scene.add(this.mesh);
		this.reveal = new HeroTextRevealController([this.material], {
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
		this.material.uniforms.uOpacity.value = 1;
		return this.reveal.playEnter(durationMs);
	}

	reset() {
		this.reveal.prepareHidden();
		this.material.uniforms.uOpacity.value = 0;
		this.mesh.visible = false;
	}

	_drawLabel(context) {
		const style = {
			fontSize: 11,
			fontWeight: 400,
			fontFamily: '"Jura", sans-serif',
			letterSpacing: 0.28,
			color: "rgba(200, 235, 255, 0.85)",
			replacementGlowStrength: heroTextGlitchConfig.replacementGlowStrength,
			replacementFullOpacity: true,
			snakeProfile: scrollHintSnakeProfile,
		};

		for (const group of this.glitchController.primaryGroups) {
			drawHeroGlitchLine(context, group.slots, 44 + HORIZONTAL_EFFECT_PADDING, 19.5, style);
		}
		for (const group of this.glitchController.secondaryGroups ?? []) {
			drawHeroGlitchLine(context, group.slots, 44 + HORIZONTAL_EFFECT_PADDING, 19.5, style);
		}
	}

	applyPosition() {
		const { leftPx, topPx } = resolveHeroScrollHintPosition(heroTextPositionConfig);
		this.material.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
		// Preserve the visible content position while extending the transparent
		// canvas beyond both sides for bloom blur and horizontal glitch slices.
		this.material.uniforms.uTopLeft.value.set(leftPx - HORIZONTAL_EFFECT_PADDING, topPx);
	}

	_draw() {
		const context = this.context;
		if (!context) return;

		context.clearRect(0, 0, CSS_WIDTH, CSS_HEIGHT);
		const phase = (this.elapsed % CYCLE_SECONDS) / CYCLE_SECONDS;
		const wheelTravel = phase < 0.7 ? easeInOut(phase / 0.7) * 9 : 9 * (1 - (phase - 0.7) / 0.3);
		const wheelAlpha = phase < 0.35 ? 0.25 + phase / 0.35 * 0.75 : Math.max(0.15, 1 - (phase - 0.35) / 0.35 * 0.85);

		const mouseX = 14 + HORIZONTAL_EFFECT_PADDING;
		const mouseY = 4;
		const glow = context.createRadialGradient(mouseX, mouseY + 20, 1, mouseX, mouseY + 20, 22);
		glow.addColorStop(0, "rgba(29, 163, 247, 0.24)");
		glow.addColorStop(1, "rgba(29, 163, 247, 0)");
		context.fillStyle = glow;
		context.fillRect(-8, -4, 44, 50);

		context.strokeStyle = "rgba(29, 163, 247, 0.55)";
		context.lineWidth = 1;
		context.beginPath();
		context.roundRect(mouseX - 11, mouseY + 4, 22, 34, 11);
		context.stroke();

		context.globalAlpha = wheelAlpha;
		drawGlowLine(context, mouseX, mouseY + 12 + wheelTravel, mouseX, mouseY + 19 + wheelTravel, "#38d4ff", 2, 5);
		context.globalAlpha = 1;

		const lineTop = 54;
		const lineBottom = 154;
		context.strokeStyle = "rgba(29, 163, 247, 0.28)";
		context.lineWidth = 1;
		context.beginPath();
		context.moveTo(mouseX, lineTop);
		context.lineTo(mouseX, lineBottom);
		context.stroke();

		const pulsePhase = ((this.elapsed - 0.5) % CYCLE_SECONDS + CYCLE_SECONDS) % CYCLE_SECONDS / CYCLE_SECONDS;
		const pulseHeight = 40;
		const pulseY = lineTop - pulseHeight + pulsePhase * (lineBottom - lineTop + pulseHeight);
		const pulseAlpha = Math.sin(Math.PI * pulsePhase);
		const gradient = context.createLinearGradient(mouseX, pulseY, mouseX, pulseY + pulseHeight);
		gradient.addColorStop(0, "rgba(56, 212, 255, 0)");
		gradient.addColorStop(0.58, `rgba(0, 102, 255, ${pulseAlpha * 0.22})`);
		gradient.addColorStop(0.86, `rgba(0, 210, 255, ${pulseAlpha * 0.82})`);
		gradient.addColorStop(1, `rgba(239, 255, 255, ${pulseAlpha})`);
		context.save();
		context.beginPath();
		context.rect(mouseX - 14, lineTop, 28, lineBottom - lineTop);
		context.clip();
		const flicker = 0.88 + Math.sin(this.elapsed * 47) * 0.08 + Math.sin(this.elapsed * 83) * 0.04;
		context.globalAlpha = flicker;
		drawGlowLine(context, mouseX, pulseY, mouseX, pulseY + pulseHeight, gradient, 3, 11, "#0077ff");
		drawGlowLine(context, mouseX, pulseY, mouseX, pulseY + pulseHeight, gradient, 1, 3, "#8cecff");

		const headY = pulseY + pulseHeight;
		const headGlow = context.createRadialGradient(mouseX, headY, 0, mouseX, headY, 9);
		headGlow.addColorStop(0, `rgba(255, 255, 255, ${pulseAlpha})`);
		headGlow.addColorStop(0.12, `rgba(157, 244, 255, ${pulseAlpha})`);
		headGlow.addColorStop(0.38, `rgba(0, 157, 255, ${pulseAlpha * 0.7})`);
		headGlow.addColorStop(1, "rgba(0, 84, 255, 0)");
		context.fillStyle = headGlow;
		context.fillRect(mouseX - 9, headY - 9, 18, 18);
		context.fillStyle = `rgba(255, 255, 255, ${pulseAlpha})`;
		context.fillRect(mouseX - 0.75, headY - 1.5, 1.5, 3);
		context.restore();

		context.font = '400 11px "Jura", sans-serif';
		context.textBaseline = "middle";
		context.fillStyle = "rgba(200, 235, 255, 0.85)";
		context.shadowColor = "rgba(29, 163, 247, 0.4)";
		context.shadowBlur = 8;
		this._drawLabel(context);
		this.texture.needsUpdate = true;
	}

	update(delta) {
		this.elapsed += delta;
		this.reveal.update(delta);

		if (!this.mesh.visible) return;
		this.drawAccumulator += delta;
		if (this.drawAccumulator >= 1 / ANIMATION_FPS) {
			this.drawAccumulator %= 1 / ANIMATION_FPS;
			this._draw();
		}
	}

	resize() {
		const nextDpr = Math.min(2, window.devicePixelRatio || 1);
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
		this.geometry.dispose();
		this.material.dispose();
		this.texture.dispose();
	}
}
