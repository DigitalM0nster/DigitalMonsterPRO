import * as THREE from "three";
import { store } from "@/app/store.jsx";
import { sceneOwnsHexHitAtClientY } from "@/three/render/overlay/hexHitOwnership.js";
import { registerSceneCanvasInput } from "../../interaction/sceneCanvasInput.js";

const vertexShader = `uniform vec2 viewport;uniform vec4 rect;varying vec2 vUv;varying vec2 pixel;
void main(){vUv=uv;pixel=rect.xy+vec2(uv.x,1.-uv.y)*rect.zw;
gl_Position=vec4(pixel.x/viewport.x*2.-1.,1.-pixel.y/viewport.y*2.,0.,1.);}`;
const fragmentShader = `uniform sampler2D map;uniform float textured;uniform vec3 color;uniform float opacity;uniform vec4 clip;uniform vec4 rect;uniform float focused;
varying vec2 vUv;varying vec2 pixel;
void main(){if(pixel.x<clip.x||pixel.y<clip.y||pixel.x>clip.z||pixel.y>clip.w)discard;
vec4 c=textured>.5?texture2D(map,vUv):vec4(1.);
vec2 edge=min(pixel-rect.xy,rect.xy+rect.zw-pixel);float ring=focused*(1.-smoothstep(1.,2.,min(edge.x,edge.y)));
gl_FragColor=vec4(mix(c.rgb*color,vec3(0.,.66,1.),ring),max(c.a*opacity,ring));}`;

/** Prepared, element-sized UI. Pixels change only on content/viewport changes;
 * movement, scrolling, selection and hover use existing textures and uniforms. */
export class SceneCanvasInterface {
	constructor(sceneId, renderer) {
		this.sceneId = sceneId; this.renderer = renderer;
		this.overlayScene = new THREE.Scene(); this.overlayCamera = new THREE.Camera();
		this.geometry = new THREE.PlaneGeometry(1, 1); this.elements = new Map();
		this.composeMode = "models"; this.enabled = false; this.press = null;
		this.width = 0; this.height = 0; this.disposed = false;
		// Semantics only: no HTML pixels are drawn over the WebGL/hex composition.
		this.accessibilityRoot = document.createElement("div");
		this.accessibilityRoot.style.cssText = "position:fixed;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;pointer-events:none";
		document.body.append(this.accessibilityRoot);
		this.unregisterInput = registerSceneCanvasInput(this);
		this.onDown = event => {
			if (event.button !== 0 || !this.owns(event)) return;
			const item = this.hit(event.clientX, event.clientY);
			if (!item) return;
			this.press = { item, id: event.pointerId, x: event.clientX, y: event.clientY, lastY: event.clientY };
			item.drag?.(event.clientX, event.clientY, 0);
			event.preventDefault(); event.stopImmediatePropagation();
		};
		this.onMove = event => {
			const press = this.press;
			if (!press && this.owns(event)) {
				const item = this.hit(event.clientX, event.clientY);
				if (item !== this.hovered) { this.hovered = item; item?.hover?.(); }
			}
			if (press?.id === event.pointerId) {
				if (this.allowSiteSwipe && Math.hypot(event.clientX - press.x, event.clientY - press.y) >= 8) { this.press = null; return; }
				press.item.drag?.(event.clientX, event.clientY, event.clientY - press.lastY);
				press.lastY = event.clientY; event.preventDefault(); event.stopImmediatePropagation();
			}
		};
		this.onUp = event => {
			const press = this.press;
			if (!press || press.id !== event.pointerId) return;
			this.press = null;
			press.item.release?.(event.clientX, event.clientY);
			if (this.owns(event) && this.hit(event.clientX, event.clientY) === press.item
				&& Math.hypot(event.clientX - press.x, event.clientY - press.y) < 10) press.item.action?.();
			event.preventDefault(); event.stopImmediatePropagation();
		};
		this.onCancel = () => { this.press = null; };
		this.onTouch = event => {
			if (this.allowSiteSwipe) return;
			const touch = event.touches[0] ?? event.changedTouches[0];
			if (event.type === "touchstart") this.touchOwned = !!touch && this.owns({ target: event.target, clientY: touch.clientY }) && !!this.hit(touch.clientX, touch.clientY);
			if (!this.touchOwned) return;
			// Pointer events perform the action; keep the same contact out of site-scroll handlers.
			event.stopImmediatePropagation();
			if (event.cancelable) event.preventDefault();
			if (!event.touches.length) this.touchOwned = false;
		};
		this.onWheel = event => {
			if (this.owns(event) && this.scroll?.(event.deltaY, event.clientX, event.clientY)) {
				event.preventDefault(); event.stopImmediatePropagation();
			}
		};
		this.onKey = event => {
			if (this.enabled && store.appStarted && sceneOwnsHexHitAtClientY(this.sceneId, this.height / 2)
				&& this.key?.(event.key)) { event.preventDefault(); event.stopImmediatePropagation(); }
		};
		for (const [type, handler] of this.listeners()) window.addEventListener(type, handler, { capture: true, passive: false });
	}
	listeners() { return [["pointerdown", this.onDown], ["pointermove", this.onMove], ["pointerup", this.onUp], ["pointercancel", this.onCancel], ["touchstart", this.onTouch], ["touchmove", this.onTouch], ["touchend", this.onTouch], ["touchcancel", this.onTouch], ["wheel", this.onWheel], ["keydown", this.onKey]]; }
	owns(event) {
		return this.enabled && store.appStarted && !event.target?.closest?.("button,a,input,select,textarea,nav,[role='dialog']")
			&& sceneOwnsHexHitAtClientY(this.sceneId, event.clientY);
	}
	hit(x, y) {
		let result = null;
		for (const item of this.elements.values()) {
			if (!item.mesh.visible || (!item.action && !item.drag)) continue;
			const r = item.hitRect ?? item.material.uniforms.rect.value;
			if (x >= r.x && x <= r.x + r.z && y >= r.y && y <= r.y + r.w) result = item;
		}
		return result;
	}
	add(id, options = {}) {
		const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, transparent: true,
			depthTest: false, depthWrite: false, toneMapped: false,
			uniforms: { viewport: { value: new THREE.Vector2(1, 1) }, rect: { value: new THREE.Vector4() },
				clip: { value: new THREE.Vector4(-1e5, -1e5, 1e5, 1e5) }, map: { value: null },
				textured: { value: options.paint ? 1 : 0 }, focused: { value: 0 }, color: { value: new THREE.Color(1, 1, 1) }, opacity: { value: 1 } } });
		const mesh = new THREE.Mesh(this.geometry, material); mesh.frustumCulled = false;
		mesh.name = `${this.sceneId}-canvas-${id}`; mesh.renderOrder = this.elements.size;
		const item = { ...options, mesh, material, textures: new Map(), hitRect: null };
		if (options.action) {
			const button = document.createElement("button"); button.type = "button"; button.tabIndex = -1;
			button.addEventListener("click", () => { if (item.mesh.visible && sceneOwnsHexHitAtClientY(this.sceneId, this.height / 2)) item.action?.(); });
			button.addEventListener("focus", () => { item.hover?.(); });
			this.accessibilityRoot.append(button); item.button = button;
		}
		this.elements.set(id, item); this.overlayScene.add(mesh); return item;
	}
	text(id, values, { size = 16, width = 320, height = 40, color = "#e2e9ed", align = "left", ...options } = {}) {
		return this.add(id, { ...options, values, width, height, paint(ctx, value, w, h) {
			ctx.font = `500 ${size}px ManifoldExtended, "Segoe UI", sans-serif`;
			ctx.textAlign = align; ctx.textBaseline = "middle"; ctx.fillStyle = color;
			const lines = String(value).split("\n");
			lines.forEach((line, i) => ctx.fillText(line, align === "center" ? w / 2 : align === "right" ? w - 2 : 2,
				h / 2 + (i - (lines.length - 1) / 2) * size * 1.4));
		} });
	}
	async prepare() {
		await document.fonts.load('500 16px ManifoldExtended');
		for (const item of this.elements.values()) {
			if (!item.paint) continue;
			for (const [key, value] of Object.entries(item.values ?? { default: "" })) {
				if (this.disposed) return this;
				this.paint(item, key, value); this.renderer.initTexture(item.textures.get(key));
				await new Promise(resolve => requestAnimationFrame(resolve));
			}
		}
		this.update(0); return this;
	}
	paint(item, key, value) {
		const ratio = Math.max(2, Math.min(3, window.devicePixelRatio || 1));
		const canvas = document.createElement("canvas");
		canvas.width = Math.ceil(item.width * ratio); canvas.height = Math.ceil(item.height * ratio);
		const ctx = canvas.getContext("2d"); ctx.scale(ratio, ratio); item.paint(ctx, value, item.width, item.height);
		const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.NoColorSpace;
		texture.minFilter = texture.magFilter = THREE.LinearFilter; texture.generateMipmaps = false;
		item.textures.set(key, texture);
		if (!item.material.uniforms.map.value) item.material.uniforms.map.value = texture;
	}
	place(id, x, y, width, height, { key, opacity = 1, color = 0xffffff, action, hitRect } = {}) {
		const item = this.elements.get(id); if (!item) return;
		item.mesh.visible = this.enabled && opacity > .001 && width > 0 && height > 0;
		const u = item.material.uniforms; u.rect.value.set(x, y, width, height); u.viewport.value.set(this.width, this.height);
		u.opacity.value = opacity; u.color.value.setHex(color, THREE.LinearSRGBColorSpace);
		if (key != null) u.map.value = item.textures.get(String(key)) ?? item.textures.values().next().value;
		if (item.button) {
			const label = item.ariaLabel ?? item.values?.[key] ?? item.values?.default ?? id;
			if (item.button.textContent !== String(label)) item.button.textContent = label;
		}
		if (action) item.action = action; item.hitRect = hitRect ?? null;
	}
	hideAll() { for (const item of this.elements.values()) item.mesh.visible = false; }
	reset() {
		this.press = this.hovered = null; this.touchOwned = false;
		this.reading = this.projectsOpen = this.volumeOpen = false;
		this.scrollY = this.sheetScroll = 0;
	}
	update() {
		this.width = window.innerWidth; this.height = window.innerHeight; this.hideAll(); this.layout?.();
		const interactive = store.appStarted && this.enabled && this.composeMode === "screen";
		const modalOrder = (this.reading || this.projectsOpen) ? this.elements.get("shade")?.mesh.renderOrder ?? 0 : -1;
		for (const item of this.elements.values()) if (item.button) {
			const tabIndex = interactive && item.mesh.visible && item.mesh.renderOrder >= modalOrder ? 0 : -1;
			if (item.button.tabIndex !== tabIndex) item.button.tabIndex = tabIndex;
			item.material.uniforms.focused.value = tabIndex === 0 && document.activeElement === item.button ? 1 : 0;
		}
	}
	setComposeMode(mode) { this.composeMode = mode; }
	renderModelsOverlay(renderer) { if (this.enabled && this.composeMode === "models") renderer.render(this.overlayScene, this.overlayCamera); }
	renderScreenOverlay(renderer) { if (this.enabled && this.composeMode === "screen") renderer.render(this.overlayScene, this.overlayCamera); }
	dispose() {
		this.disposed = true;
		for (const [type, handler] of this.listeners()) window.removeEventListener(type, handler, true);
		for (const item of this.elements.values()) { item.material.dispose(); for (const texture of item.textures.values()) texture.dispose(); }
		this.geometry.dispose(); this.elements.clear(); this.overlayScene.clear();
		this.accessibilityRoot.remove();
		this.unregisterInput();
	}
}
