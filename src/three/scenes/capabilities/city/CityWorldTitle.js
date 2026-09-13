import * as THREE from "three";
import { releaseStaticCanvasAfterUpload } from "../../../assets/releaseStaticCanvasAfterUpload.js";
import { advanceCityTitle, cityTitleReveal, CITY_TITLE_REVEAL_DURATION } from "./cityTitleMotion.js";
import { SceneTextLocale } from "../typography/sceneTextLocale.js";
import { TITLE_MOSAIC_GLSL } from "../typography/titleMosaic.js";

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
	uniform bool uScreen;
	uniform vec2 uViewport,uOrigin,uSize;
	varying vec2 vUv;
	void main() {
		vUv = uv;
		if (uScreen) {
			vec2 pixel = uOrigin + vec2(uv.x,1.0-uv.y)*uSize;
			gl_Position=vec4(pixel/uViewport*vec2(2.0,-2.0)+vec2(-1.0,1.0),0.0,1.0);
		} else gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
	}
`;
const FRAGMENT = /* glsl */ `
	uniform sampler2D uText;
	uniform float uReveal, uLocale, uCompact;
	varying vec2 vUv;
	vec4 textInk(vec2 uv) {
		uv = clamp(uv, vec2(0.001), vec2(0.999));
		return texture2D(uText, vec2(uv.x, (5.0 - uLocale - uCompact * 3.0 + uv.y) / 6.0));
	}
	${TITLE_MOSAIC_GLSL}
	void main() {
		gl_FragColor = titleMosaic(vUv, uReveal, 1.0, 1.0);
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
		this.localeMotion = new SceneTextLocale(CITY_TITLE_REVEAL_DURATION, CITY_TITLE_REVEAL_DURATION);
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
			let right = paintLine(ctx, COPY[locale][0], 12, 124, compact ? 112 : 76, "#d5e5ed");
			right = Math.max(right, paintLine(ctx, COPY[locale][1], 12, 229, compact ? 112 : 76, "#d5e5ed"));
			if (compact) {
				right = Math.max(right, paintLine(ctx, COMPACT_BODY[locale][0], 12, 301, 70, "#98bdce", 1));
				right = Math.max(right, paintLine(ctx, COMPACT_BODY[locale][1], 12, 365, 70, "#98bdce", 1));
			} else {
				right = Math.max(right, paintLine(ctx, COPY[locale][2], 12, 296, 29, "#98bdce", 1));
			}
			this.soundBounds[state] = right / WIDTH;
			ctx.restore();
		}
		this.texture = new THREE.CanvasTexture(canvas);
		releaseStaticCanvasAfterUpload(this.texture);
		this.texture.name = "city-world-title-all-locales";
		// World-space type is minified obliquely: static mipmaps prevent shimmering.
		this.texture.minFilter = THREE.LinearMipmapLinearFilter;
		this.texture.magFilter = THREE.LinearFilter;
		this.texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
		this.uniforms = {
			uScreen: { value: false }, uViewport: { value: this.viewport }, uOrigin: { value: new THREE.Vector2() }, uSize: { value: new THREE.Vector2() },
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
		const compact = this.viewport.x <= 1024;
		this.uniforms.uScreen.value = compact;
		this.mesh.material.depthTest = !compact;
		if (compact) {
			const landscape = this.viewport.y <= 480 && this.viewport.x > this.viewport.y;
			const width = landscape ? Math.min(380, this.viewport.x * .48 - 24) : Math.min(560, this.viewport.x - 24);
			this.uniforms.uOrigin.value.set(12, this.viewport.y <= 480 ? 66 : 84);
			this.uniforms.uSize.value.set(width, width * HEIGHT / WIDTH);
		}
		if (Math.abs(aspect - this.lastAspect) < 0.001 && this.uniforms.uCompact.value === (compact ? 1 : 0)) return;
		this.lastAspect = aspect;
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
		const current = frame?.activeSceneId === "capabilities:spatialMatrix";
		const transitioning = store?.sceneCarouselClickTransitionActive === true || Math.abs(store?.hexShaderProgress ?? 0) > 0.0001;
		if (!this.localeMotion.busy) this.elapsed = advanceCityTitle(this.elapsed, delta, {
			started: store?.appStarted === true,
			current, transitioning,
		});
		this.uniforms.uReveal.value = this.localeMotion.update(
			store?.appStarted === true && (current || transitioning) ? delta : 0, locale, cityTitleReveal(this.elapsed),
		);
		this.uniforms.uLocale.value = this.localeMotion.locale;
	}

	getSoundReveal() {
		const u = this.uniforms;
		const right = this.soundBounds[u.uLocale.value + u.uCompact.value * 3];
		const start = (1 - right) * 0.72;
		const end = (1 - 12 / WIDTH) * 0.72 + 0.1 + 0.18;
		return THREE.MathUtils.clamp((u.uReveal.value - start) / (end - start), 0, 1);
	}

	reset() { this.elapsed = 0; this.uniforms.uReveal.value = 0; this.localeMotion.reset(); }
	beginWarmupDraw() { this.warming = true; this.uniforms.uReveal.value = 0.5; }
	endWarmupDraw() { this.warming = false; this.reset(); }
	dispose() {
		this.mesh.removeFromParent();
		this.mesh.geometry.dispose();
		this.mesh.material.dispose();
		this.texture.dispose();
	}
}
