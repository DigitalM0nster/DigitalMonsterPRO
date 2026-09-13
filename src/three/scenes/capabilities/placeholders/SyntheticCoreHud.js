import * as THREE from "three";

/** Sphere contact and narrative composition; the click cue lives in ScrollHintHud. */
export class SyntheticCoreHud {
	constructor(parent, lens, renderer) {
		this.lens = lens;
		this.renderer = renderer;
		this.modelsParent = parent;
		this.overlayScene = new THREE.Scene();
		this.composeMode = "models";
		this.uniforms = {
			uViewport: { value: renderer.getSize(new THREE.Vector2()) },
			uCoreHover: { value: 0 },
		};
		this.hitSphere = new THREE.Sphere(lens.getWorldPosition(new THREE.Vector3()), 0.69);
		this.scale = new THREE.Vector3();
		this.contact = new THREE.Vector3();
		this.sphereHovered = false;
	}

	update(delta, { raycaster, camera, enabled, dragging }) {
		if (!camera) return;
		this.renderer.getSize(this.uniforms.uViewport.value);
		this.lens.getWorldPosition(this.hitSphere.center);
		this.lens.getWorldScale(this.scale);
		this.hitSphere.radius = 0.69 * this.scale.x;
		this.sphereHovered = enabled && !dragging
			&& Boolean(raycaster.ray.intersectSphere(this.hitSphere, this.contact));
		const focus = this.uniforms.uCoreHover;
		focus.value = THREE.MathUtils.damp(focus.value, this.sphereHovered ? 1 : 0, 7, delta);
		const lens = this.lens.material.uniforms;
		lens.uFocus.value = focus.value;
		lens.uProbe.value = 0;
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
		// Return the persistent narrative to the owning world's disposal traversal.
		this.setComposeMode("models");
	}
}
