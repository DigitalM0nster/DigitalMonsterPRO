import { Matrix4, PerspectiveCamera, Raycaster, Ray, Sphere, Vector2, Vector3 } from "three";

/** Thirteen prepared bone ellipsoids, not a per-frame raycast of 20k particles. */
export class WhaleSurfaceHit {
	constructor(points) {
		this.raycaster = new Raycaster(); this.ray = new Ray();
		this.matrix = new Matrix4(); this.hit = new Vector3();
		this.sphere = new Sphere(new Vector3(), 1);
		this.camera = new PerspectiveCamera();
		this.proxies = points.boneBounds.flatMap((box, index) => {
			if (box.isEmpty()) return [];
			const center = box.getCenter(new Vector3()), radius = box.getSize(new Vector3()).multiplyScalar(.5);
			radius.max(new Vector3(.025, .025, .025));
			const shape = new Matrix4().makeScale(radius.x, radius.y, radius.z).setPosition(center);
			return [{ bone: points.skeleton.bones[index],
				local: points.skeleton.boneInverses[index].clone().multiply(points.bindMatrix).multiply(shape) }];
		});
	}
	syncCamera(position, target, fov, aspect) {
		this.camera.position.copy(position); this.camera.lookAt(target);
		this.camera.fov = fov; this.camera.aspect = aspect;
		this.camera.updateProjectionMatrix(); this.camera.updateMatrixWorld();
	}
	contains(pointer) {
		this.raycaster.setFromCamera(pointer, this.camera);
		for (const proxy of this.proxies) {
			this.matrix.copy(proxy.bone.matrixWorld).multiply(proxy.local).invert();
			this.ray.copy(this.raycaster.ray).applyMatrix4(this.matrix);
			if (this.ray.intersectSphere(this.sphere, this.hit)) return true;
		}
		return false;
	}
}

export class WhaleSurfaceInteraction {
	constructor({ eventTarget = window, canInteract, viewport = () => [window.innerWidth, window.innerHeight] }) {
		this.events = eventTarget; this.canInteract = canInteract; this.viewport = viewport;
		this.pointer = new Vector2(); this.lastPointer = new Vector2(); this.sonarPosition = new Vector2();
		this.touchPosition = new Vector2();
		this.reset();
		this.onDown = event => {
			this.down = null;
			if (event.button !== 0 || !this.canInteract(event) || !this.eventHits(event)) return;
			this.down = { id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp };
		};
		this.onMove = event => {
			if (this.down && Math.hypot(event.clientX - this.down.x, event.clientY - this.down.y) > 10) this.down = null;
		};
		this.onUp = event => {
			const down = this.down; this.down = null;
			if (!down || event.pointerId !== down.id || event.timeStamp - down.time > 500
				|| Math.hypot(event.clientX - down.x, event.clientY - down.y) > 10
				|| !this.canInteract(event) || !this.eventHits(event)) return;
			if (this.sonarAge < .65) return;
			this.sonarPosition.copy(this.pointer); this.pendingSonar = true;
		};
		this.cancel = () => { this.down = null; this.pendingSonar = false; };
		for (const [type, listener] of [["pointerdown", this.onDown], ["pointermove", this.onMove],
			["pointerup", this.onUp], ["pointercancel", this.cancel], ["blur", this.cancel], ["wheel", this.cancel]])
			eventTarget.addEventListener(type, listener, { passive: true });
	}
	eventHits(event) {
		const [width, height] = this.viewport();
		this.pointer.set(event.clientX / width * 2 - 1, 1 - event.clientY / height * 2);
		return this.surface?.contains(this.pointer) === true;
	}
	reset() {
		this.down = null; this.pendingSonar = false; this.sonarAge = 3; this.sonarStrength = 0;
		this.touch = 0; this.dwell = 0; this.curiosityTime = 2; this.curiosityWeight = 0;
		this.cooldown = 0; this.wasHovering = false;
	}
	update(delta, frame, ready, hoverPointer, reducedMotion) {
		const dt = Math.min(.1, Math.max(0, delta || 0));
		const owned = ready && frame?.interactionEnabled && !frame.pointerBlocked;
		const hovering = Boolean(owned && (hoverPointer || frame.pointerDown) && this.surface?.contains(frame.pointer));
		const steady = hovering && this.wasHovering && this.lastPointer.distanceTo(frame.pointer) < .025;
		if (hovering) {
			if (!this.wasHovering) this.touchPosition.copy(frame.pointer);
			else this.touchPosition.lerp(frame.pointer, 1 - Math.exp(-12 * dt));
		}
		this.dwell = steady && hoverPointer ? this.dwell + dt : 0;
		this.cooldown = Math.max(0, this.cooldown - dt);
		if (this.dwell > 1.1 && this.cooldown === 0 && !reducedMotion) {
			this.curiosityTime = 0; this.curiosityWeight = 1; this.cooldown = 6; this.dwell = 0;
		}
		this.curiosityTime = Math.min(2, this.curiosityTime + dt);
		if (!owned || reducedMotion) this.curiosityWeight *= Math.exp(-8 * dt);
		if (this.curiosityTime === 2) this.curiosityWeight = 0;
		this.touch += ((hovering && !reducedMotion ? 1 : 0) - this.touch) * (1 - Math.exp(-7 * dt));
		this.sonarAge = Math.min(3, this.sonarAge + dt);
		if (this.pendingSonar && owned) {
			this.sonarAge = 0; this.sonarStrength = reducedMotion ? .25 : 1;
		}
		this.pendingSonar = false;
		if (!owned) { this.down = null; this.sonarStrength *= Math.exp(-8 * dt); }
		this.wasHovering = hovering;
		if (hovering && !steady) this.lastPointer.copy(frame.pointer);
	}
	applyUniforms(uniforms) {
		if (!uniforms?.uTouchStrength) return;
		uniforms.uTouchStrength.value = this.touch;
		uniforms.uTouchPosition.value.copy(this.touchPosition);
		uniforms.uSonarPosition.value.copy(this.sonarPosition);
		uniforms.uSonarAge.value = this.sonarAge;
		uniforms.uSonarStrength.value = this.sonarStrength;
	}
	dispose() {
		for (const [type, listener] of [["pointerdown", this.onDown], ["pointermove", this.onMove],
			["pointerup", this.onUp], ["pointercancel", this.cancel], ["blur", this.cancel], ["wheel", this.cancel]])
			this.events.removeEventListener(type, listener);
		this.surface = null; this.reset();
	}
}
