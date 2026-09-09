import * as THREE from "three";
import { advanceCityTitle, cityTitleReveal } from "./cityTitleMotion.js";

const COPY = [
	["СОЗДАЁМ МИРЫ,", "КОТОРЫЕ ПОМНЯТ", "На экране — на мгновение. В памяти — надолго."],
	["WE CREATE WORLDS", "THAT STAY WITH YOU", "A moment on screen. A lasting impression."],
	["创造令人难忘的世界", "让体验留在心中", "屏幕上的片刻，记忆中的长久。"],
];
const WIDTH = 1536;
const HEIGHT = 384;
const COMPACT_BODY = [
	["На экране — на мгновение.", "В памяти — надолго."],
	["A moment on screen.", "A lasting impression."],
	["屏幕上的片刻，", "记忆中的长久。"],
];

function paintLine(ctx, text, x, y, size, color, tracking = 2) {
	ctx.font = `500 ${size}px ManifoldExtended, sans-serif`;
	const characters = Array.from(text);
	const measure = () => characters.reduce((width, char) => width + (char === " " ? size * 0.55 : ctx.measureText(char).width + tracking), 0);
	const width = measure();
	if (width > WIDTH - x - 24) {
		size *= (WIDTH - x - 24) / width;
		ctx.font = `500 ${size}px ManifoldExtended, sans-serif`;
	}
	ctx.fillStyle = color;
	for (const char of characters) {
		if (char === " ") { x += size * 0.55; continue; }
		ctx.fillText(char, x, y);
		x += ctx.measureText(char).width + tracking;
	}
	return x;
}

const VERTEX = /* glsl */ `
	varying vec2 vUv;
	void main() {
		vUv = uv;
		gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
	}
`;
const FRAGMENT = /* glsl */ `
	uniform sampler2D uText;
	uniform float uReveal, uLocale, uCompact;
	varying vec2 vUv;
	void main() {
		if (uReveal <= 0.0) discard;
		vec4 ink = texture2D(uText, vec2(vUv.x, (5.0 - uLocale - uCompact * 3.0 + vUv.y) / 6.0));
		if (ink.a < 0.002) discard;
		// A quiet, staggered scan through prepared glyphs; the settled path is one sample.
		if (uReveal < 1.0) {
			vec2 cell = floor(vUv * vec2(96.0, 24.0));
			float stagger = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
			float edge = vUv.x * 0.72 + stagger * 0.10;
			float phase = smoothstep(edge, edge + 0.18, uReveal);
			ink.rgb = mix(vec3(0.08, 0.68, 0.90), ink.rgb, phase);
			ink.a *= phase;
		}
		gl_FragColor = ink;
	}
`;

/** A depth-tested inscription in the city, not a viewport HUD or a dynamic canvas. */
export class CityWorldTitle {
	static async prepare() {
		await Promise.all(COPY.map(lines => document.fonts?.load("500 72px ManifoldExtended", lines.join(" "))));
	}

	constructor(parent, renderer) {
		this.parent = parent;
		this.elapsed = 0;
		this.warming = false;
		this.viewport = new THREE.Vector2();
		this.lastAspect = -1;
		this.anchor = new THREE.Vector3();
		this.inverseParent = new THREE.Matrix4();
		const canvas = document.createElement("canvas");
		// All locales share one texture, uploaded once under the preloader.
		const ratio = Math.min(1, renderer.capabilities.maxTextureSize / (HEIGHT * 6));
		canvas.width = Math.floor(WIDTH * ratio);
		canvas.height = Math.floor(HEIGHT * 6 * ratio);
		const ctx = canvas.getContext("2d");
		ctx.scale(ratio, ratio);
		ctx.textBaseline = "alphabetic";
		this.soundBounds = [];
		for (let state = 0; state < 6; state++) {
			const locale = state % 3, compact = state >= 3;
			ctx.save();
			ctx.translate(0, state * HEIGHT);
			let right = paintLine(ctx, "04", 12, 110, 42, "#25b7e3");
			right = Math.max(right, paintLine(ctx, COPY[locale][0], 124, 124, compact ? 91 : 76, "#d5e5ed"));
			right = Math.max(right, paintLine(ctx, COPY[locale][1], 124, 229, compact ? 91 : 76, "#d5e5ed"));
			if (compact) {
				right = Math.max(right, paintLine(ctx, COMPACT_BODY[locale][0], 128, 301, 54, "#98bdce", 1));
				right = Math.max(right, paintLine(ctx, COMPACT_BODY[locale][1], 128, 365, 54, "#98bdce", 1));
			} else {
				right = Math.max(right, paintLine(ctx, COPY[locale][2], 128, 296, 29, "#98bdce", 1));
			}
			this.soundBounds[state] = right / WIDTH;
			ctx.restore();
		}
		this.texture = new THREE.CanvasTexture(canvas);
		this.texture.name = "city-world-title-all-locales";
		// World-space type is minified obliquely: static mipmaps prevent shimmering.
		this.texture.minFilter = THREE.LinearMipmapLinearFilter;
		this.texture.magFilter = THREE.LinearFilter;
		this.texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
		this.uniforms = {
			uText: { value: this.texture }, uReveal: { value: 0 }, uLocale: { value: 0 }, uCompact: { value: 0 },
		};
		this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.3), new THREE.ShaderMaterial({
			uniforms: this.uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT,
			transparent: true, depthTest: true, depthWrite: false, toneMapped: false,
		}));
		this.mesh.name = "CityWorldTitle";
		this.mesh.position.set(-0.3, 0.7, 0.5);
		this.mesh.rotation.y = Math.PI / 2 - 0.19;
		parent.updateWorldMatrix(true, false);
		parent.attach(this.mesh);
		this.baseScale = this.mesh.scale.clone();
		this.mesh.onBeforeRender = () => {
			renderer.getSize(this.viewport);
			this.layout(this.viewport.x / Math.max(1, this.viewport.y));
		};
		this.layout(renderer.getSize(this.viewport).x / Math.max(1, this.viewport.y));
	}

	layout(aspect) {
		if (Math.abs(aspect - this.lastAspect) < 0.001) return;
		this.lastAspect = aspect;
		const compact = aspect < 1;
		this.uniforms.uCompact.value = compact ? 1 : 0;
		this.anchor.set(compact ? 0.85 : -0.3, compact ? 1.3 : 0.7, compact ? 1 : 0.5);
		this.parent.updateWorldMatrix(true, false);
		this.inverseParent.copy(this.parent.matrixWorld).invert();
		this.mesh.position.copy(this.anchor.applyMatrix4(this.inverseParent));
		this.mesh.rotation.y = compact ? 1.14 : Math.PI / 2;
		this.mesh.scale.copy(this.baseScale).multiplyScalar(Math.min(1, aspect / (compact ? 1.35 : 1.65)));
	}

	update(delta, frame, locale) {
		if (this.warming) return;
		const store = frame?.store;
		this.elapsed = advanceCityTitle(this.elapsed, delta, {
			started: store?.appStarted === true,
			current: frame?.activeSceneId === "capabilities:spatialMatrix",
			transitioning: store?.sceneCarouselClickTransitionActive === true || Math.abs(store?.hexShaderProgress ?? 0) > 0.0001,
		});
		this.uniforms.uReveal.value = cityTitleReveal(this.elapsed);
		this.uniforms.uLocale.value = locale === "en" ? 1 : locale === "zh" ? 2 : 0;
	}

	getSoundReveal() {
		const u = this.uniforms;
		const right = this.soundBounds[u.uLocale.value + u.uCompact.value * 3];
		const start = 12 / WIDTH * 0.72;
		const end = right * 0.72 + 0.1 + 0.18;
		return THREE.MathUtils.clamp((u.uReveal.value - start) / (end - start), 0, 1);
	}

	reset() { this.elapsed = 0; this.uniforms.uReveal.value = 0; }
	beginWarmupDraw() { this.warming = true; this.uniforms.uReveal.value = 1; }
	endWarmupDraw() { this.warming = false; this.reset(); }
	dispose() {
		this.mesh.removeFromParent();
		this.mesh.geometry.dispose();
		this.mesh.material.dispose();
		this.texture.dispose();
	}
}
