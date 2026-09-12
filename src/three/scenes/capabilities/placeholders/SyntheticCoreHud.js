import * as THREE from "three";
import { SceneTextLocale } from "../typography/sceneTextLocale.js";
import { advanceHudSnake } from "../../../objects/sceneHud/sceneHudShaders.js";
import { createHudQuad } from "./syntheticCoreHudMaterials.js";
import { createHudAtlas } from "./syntheticCoreHudAtlas.js";
import { coreNarrativeLayout } from "../typography/capabilityNarrativeContent.js";

/** Left-side signal terminal; resources stay inside the scene through hex mixes. */
export class SyntheticCoreHud {
	static async prepare() { await document.fonts?.load('500 16px ManifoldExtended'); }

	constructor(parent, lens, inputElement) {
		this.lens = lens;
		this.localeMotion = new SceneTextLocale();
		this.inputElement = inputElement;
		this.pixelRatio = Math.max(1, Math.min(2, inputElement.width / Math.max(1, inputElement.clientWidth)));
		this.viewport = new THREE.Vector2(inputElement.clientWidth, inputElement.clientHeight);
		this.atlas = createHudAtlas(this.pixelRatio);
		this.texture = this.atlas.texture;
		this.modelsParent = parent;
		this.overlayScene = new THREE.Scene();
		this.composeMode = "models";
		this.uniforms = {
			uTime: { value: 0 }, uHover: { value: 0 }, uDetails: { value: 0 }, uReveal: { value: 0 },
			uOpen: { value: 0 }, uLocale: { value: 0 }, uProbe: { value: 0 }, uCoreHover: { value: 0 },
			uLabels: { value: this.texture }, uViewport: { value: new THREE.Vector2(1, 1) },
			uOrigin: { value: new THREE.Vector2() }, uEnd: { value: new THREE.Vector2() },
			uLink: { value: 0 }, uPulse: { value: -1 },
			uSnake: { value: 0 }, uLetterOrder: { value: this.atlas.orderTexture },
			uGlyphs: { value: this.atlas.glyphTexture }, uGlyphCount: { value: this.atlas.glyphCount },
		};
		this.panel = createHudQuad(this.uniforms);
		this.link = createHudQuad(this.uniforms, true);
		this.panel.onBeforeRender = (renderer, _scene, camera) => {
			renderer.getSize(this.viewport);
			this.layout(camera);
		};
		this.link.onBeforeRender = this.panel.onBeforeRender;
		parent.add(this.panel, this.link);
		this.hitSphere = new THREE.Sphere(lens.getWorldPosition(new THREE.Vector3()), 0.69);
		this.scale = new THREE.Vector3();
		this.projected = new THREE.Vector3();
		this.contact = new THREE.Vector3();
		this.hovered = false;
		this.sphereHovered = false;
		this.probeAge = 10;
	}

	layout(camera) {
		// Cached renderer size avoids forcing DOM layout in each update / draw.
		const width = Math.max(1, this.viewport.x);
		const height = Math.max(1, this.viewport.y);
		const u = this.uniforms;
		u.uViewport.value.set(width, height);
		const { helperX, helperY } = coreNarrativeLayout(width, height);
		u.uOrigin.value.set(helperX, helperY);
		u.uOrigin.value.multiplyScalar(this.pixelRatio).round().divideScalar(this.pixelRatio);
		this.projected.copy(this.hitSphere.center).project(camera);
		const radius = this.hitSphere.radius / this.hitSphere.center.distanceTo(camera.position)
			* height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)));
		const end = u.uEnd.value.set((this.projected.x + 1) * width / 2, (this.projected.y + 1) * height / 2);
		// Stop outside the physical lens instead of drawing across its face.
		const distance = end.distanceTo(u.uOrigin.value);
		end.lerp(u.uOrigin.value, Math.min(1, (radius + 14) / Math.max(1, distance)));
	}

	hitTest(pointer) {
		const { uViewport, uOrigin, uDetails } = this.uniforms;
		const x = (pointer.x + 1) * uViewport.value.x / 2 - uOrigin.value.x;
		const y = (pointer.y + 1) * uViewport.value.y / 2 - uOrigin.value.y;
		return (x > -35 && x < 244 && y > -28 && y < 34)
			|| (uDetails.value > 0.3 && x > -24 && x < 244 && y > -133 && y <= -28);
	}

	activate() { this.probeAge = 0; }

	update(delta, { time, target, raycaster, pointer, camera, enabled, dragging, locale }) {
		if (!camera) return;
		this.lens.getWorldPosition(this.hitSphere.center);
		this.lens.getWorldScale(this.scale);
		this.hitSphere.radius = 0.69 * this.scale.x;
		this.layout(camera);
		this.probeAge += delta;
		this.hovered = enabled && !dragging && this.hitTest(pointer);
		this.sphereHovered = enabled && !dragging && !this.hovered
			&& Boolean(raycaster.ray.intersectSphere(this.hitSphere, this.contact));
		const u = this.uniforms;
		const scanning = this.probeAge < 3.4;
		const detailsRequested = this.hovered || this.sphereHovered || scanning;
		// A single reversible playhead: quick re-entry continues from the painted position.
		const natural = this.localeMotion.busy ? u.uSnake.value : advanceHudSnake(u.uSnake.value, detailsRequested, delta);
		u.uSnake.value = this.localeMotion.update(delta, locale, natural, detailsRequested);
		u.uTime.value = time;
		u.uHover.value = THREE.MathUtils.damp(u.uHover.value, this.hovered ? 1 : 0, 8, delta);
		u.uCoreHover.value = THREE.MathUtils.damp(u.uCoreHover.value, this.sphereHovered ? 1 : 0, 7, delta);
		u.uDetails.value = THREE.MathUtils.damp(u.uDetails.value, detailsRequested ? 1 : 0, 7, delta);
		u.uReveal.value = THREE.MathUtils.damp(u.uReveal.value, dragging ? 0.3 : 1, 5, delta);
		u.uOpen.value = THREE.MathUtils.damp(u.uOpen.value, target, 7, delta);
		u.uProbe.value = THREE.MathUtils.damp(u.uProbe.value, scanning ? 1 : 0, 7, delta);
		u.uLink.value = THREE.MathUtils.damp(u.uLink.value, !dragging && (this.hovered || scanning) ? 1 : 0, 6, delta);
		u.uPulse.value = scanning ? this.probeAge / 0.8 : -1;
		u.uLocale.value = this.localeMotion.locale;
		const lens = this.lens.material.uniforms;
		lens.uFocus.value = u.uCoreHover.value;
		lens.uProbe.value = Math.exp(-Math.pow((this.probeAge - 0.95) * 3.0, 2));
		if (this.sphereHovered) {
			this.lens.worldToLocal(this.contact);
			lens.uHoverPoint.value.copy(this.contact).normalize();
		}
	}

	setNarrative(narrative) {
		this.narrative = narrative;
		if (narrative) (this.composeMode === "screen" ? this.overlayScene : this.modelsParent).add(narrative.mesh);
	}

	setComposeMode(mode) {
		if (this.composeMode === mode) return;
		this.composeMode = mode;
		(mode === "screen" ? this.overlayScene : this.modelsParent).add(this.panel);
		if (this.narrative) (mode === "screen" ? this.overlayScene : this.modelsParent).add(this.narrative.mesh);
	}

	renderScreenOverlay(renderer, camera) {
		if (this.composeMode !== "screen" || !this.modelsParent.visible) return;
		const autoClear = renderer.autoClear;
		try {
			renderer.autoClear = false;
			renderer.render(this.overlayScene, camera);
		} finally {
			renderer.autoClear = autoClear;
		}
	}

	dispose() {
		// Return the persistent mesh to the owning world's disposal traversal.
		this.setComposeMode("models");
		this.texture.dispose();
		this.atlas.orderTexture.dispose();
		this.atlas.glyphTexture.dispose();
	}
}
