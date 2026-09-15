import { Matrix4, PerspectiveCamera, Raycaster, Ray, Sphere, Triangle, Vector2, Vector3 } from "three";

/** Thirteen prepared bone ellipsoids, not a per-frame raycast of 20k particles. */
export class WhaleSurfaceHit {
	constructor(points) {
		this.surfaceMesh = points.surfaceMesh;
		this.intersections = [];
		this.triangle = new Triangle(); this.barycentric = new Vector3(); this.vertex = new Vector3();
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

	/** One precise triangle hit per accepted tap. Hover keeps the cheap bone proxies. */
	pick(pointer, position, normal) {
		const mesh = this.surfaceMesh;
		if (!mesh) return false;
		this.raycaster.setFromCamera(pointer, this.camera);
		// Refresh the existing sphere for the current pose; no geometry/material changes.
		mesh.computeBoundingSphere();
		this.intersections.length = 0;
		mesh.raycast(this.raycaster, this.intersections);
		let nearest = null;
		for (const hit of this.intersections) if (!nearest || hit.distance < nearest.distance) nearest = hit;
		if (!nearest) return false;
		const { a, b, c } = nearest.face;
		mesh.getVertexPosition(a, this.triangle.a);
		mesh.getVertexPosition(b, this.triangle.b);
		mesh.getVertexPosition(c, this.triangle.c);
		this.matrix.copy(mesh.matrixWorld).invert();
		this.hit.copy(nearest.point).applyMatrix4(this.matrix);
		this.triangle.getBarycoord(this.hit, this.barycentric);
		// Return bind-pose coordinates: the light pattern then deforms with the same skin.
		position.set(0, 0, 0); normal.set(0, 0, 0);
		const attributes = mesh.geometry.attributes;
		for (const [index, weight] of [[a, this.barycentric.x], [b, this.barycentric.y], [c, this.barycentric.z]]) {
			position.addScaledVector(this.vertex.fromBufferAttribute(attributes.position, index), weight);
			normal.addScaledVector(this.vertex.fromBufferAttribute(attributes.normal, index), weight);
		}
		normal.normalize();
		return true;
	}
}

export class WhaleSurfaceInteraction {
	constructor({ eventTarget = window, canInteract, viewport = () => [window.innerWidth, window.innerHeight] }) {
		this.events = eventTarget; this.canInteract = canInteract; this.viewport = viewport;
		this.pointer = new Vector2(); this.lastPointer = new Vector2();
		this.sonarPosition = new Vector3(); this.sonarNormal = new Vector3(0, 0, 1);
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
			if (!this.surface?.pick(this.pointer, this.sonarPosition, this.sonarNormal)) return;
			this.pendingSonar = true;
			this.pendingResponse = true;
			this.responseDirection.copy(this.pointer);
		};
		this.cancel = () => { this.down = null; this.pendingSonar = false; this.pendingResponse = false; };
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
		this.down = null; this.pendingSonar = false; this.pendingResponse = false;
		this.sonarAge = 3; this.sonarStrength = 0; this.touch = 0;
		this.responseTime = 2.2; this.responseDuration = 2.2;
		this.responseProgress = 1; this.responseWeight = 0; this.responseEnergy = 0;
		this.responseDirection = this.responseDirection ?? new Vector2();
		this.wasHovering = false;
	}
	update(delta, frame, ready, hoverPointer, reducedMotion) {
		const dt = Math.min(.1, Math.max(0, delta || 0));
		const owned = ready && frame?.interactionEnabled && !frame.pointerBlocked;
		const hovering = Boolean(owned && (hoverPointer || frame.pointerDown) && this.surface?.contains(frame.pointer));
		if (hovering) {
			if (!this.wasHovering) this.touchPosition.copy(frame.pointer);
			else this.touchPosition.lerp(frame.pointer, 1 - Math.exp(-12 * dt));
		}
		this.touch += ((hovering && !reducedMotion ? 1 : 0) - this.touch) * (1 - Math.exp(-7 * dt));
		this.sonarAge = Math.min(3, this.sonarAge + dt);
		if (this.pendingSonar && owned) {
			this.sonarAge = 0; this.sonarStrength = reducedMotion ? .25 : 1;
		}
		if (this.pendingResponse && owned) {
			this.responseTime = 0;
			this.responseWeight = reducedMotion ? .16 : 1;
		}
		this.responseTime = Math.min(this.responseDuration, this.responseTime + dt);
		this.responseProgress = this.responseTime / this.responseDuration;
		const responseEnvelope = Math.sin(Math.PI * this.responseProgress);
		this.responseEnergy = this.responseWeight * responseEnvelope * responseEnvelope;
		if (this.responseProgress >= 1) this.responseWeight = this.responseEnergy = 0;
		this.pendingSonar = false;
		this.pendingResponse = false;
		if (!owned) {
			this.down = null;
			this.sonarStrength *= Math.exp(-8 * dt);
			this.responseWeight *= Math.exp(-8 * dt);
			this.responseEnergy *= Math.exp(-8 * dt);
		}
		this.wasHovering = hovering;
		if (hovering) this.lastPointer.copy(frame.pointer);
	}
	applyUniforms(uniforms) {
		if (!uniforms?.uTouchStrength) return;
		uniforms.uTouchStrength.value = this.touch;
		uniforms.uTouchPosition.value.copy(this.touchPosition);
		uniforms.uSonarPosition.value.copy(this.sonarPosition);
		uniforms.uSonarNormal.value.copy(this.sonarNormal);
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
