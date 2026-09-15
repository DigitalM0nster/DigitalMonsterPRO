import { Matrix4, Vector3 } from "three";

const smoother = t => t * t * t * (t * (t * 6 - 15) + 10);

/** The whale emerges from darkness while swimming from the distant upper-right. */
export class WhaleEntrance {
	constructor() {
		this.progress = 0;
		this.timeline = 0;
		this.reveal = .22;
		this.swimRate = 1;
		this.sway = .35;
		this.strokeProgress = 0;
		this.strokeWeight = .65;
		this.maneuver = .35;
		this.cameraWorld = new Matrix4();
		this.inverse = new Matrix4();
		this.destination = new Vector3();
		this.start = new Vector3();
		this.up = new Vector3(0, 1, 0);
	}

	sample(progress) {
		const t = Math.max(0, Math.min(1, progress));
		// Both ends have zero velocity and acceleration: no launch or late braking kick.
		const u = smoother(t);
		this.timeline = t;
		this.progress = u;
		// This drives distance softness rather than alpha: the whale is already
		// present in deep water and becomes crisp as it approaches.
		this.reveal = .22 + .78 * smoother(Math.max(0, Math.min(1, (t - .03) / .86)));
		// The distant animal moves its fins slowly and reaches the authored swim
		// cadence only as it settles near the camera.
		this.swimRate = .55 + .45 * u;
		this.sway = .35 + .65 * u;
		this.strokeProgress = (t * 3) % 1;
		this.strokeWeight = .65 * (1 - smoother(Math.max(0, Math.min(1, (t - .72) / .28))));
		this.maneuver = this.strokeWeight * (.48 + .52 * Math.abs(Math.sin(t * Math.PI * 6)));
		return this;
	}

	/** Mutates the resting local position; scale and material opacity stay untouched. */
	applyPosition(position, parentWorld, cameraPosition, cameraTarget, fov, aspect, config = {}) {
		if (this.progress === 1) return position;
		this.cameraWorld.lookAt(cameraPosition, cameraTarget, this.up).setPosition(cameraPosition);
		this.inverse.copy(this.cameraWorld).invert();
		this.destination.copy(position).applyMatrix4(parentWorld).applyMatrix4(this.inverse);
		const endDepth = Math.max(.1, -this.destination.z);
		const startDepth = endDepth + (config.depth ?? 18);
		const tanHalfFov = Math.tan(fov * Math.PI / 360);
		const startX = config.startX ?? .65;
		const startY = config.startY ?? .32;
		this.start.set(startX * startDepth * tanHalfFov * aspect,
			startY * startDepth * tanHalfFov, -startDepth);
		// Ease apparent approach, compensating perspective so the last metres don't rush past.
		const u = Math.pow(this.progress, config.approachPower ?? 1.35);
		const travel = u * startDepth / (endDepth + u * (startDepth - endDepth));
		const depth = startDepth + (endDepth - startDepth) * travel;
		const destinationX = this.destination.x / (endDepth * tanHalfFov * aspect);
		const destinationY = this.destination.y / (endDepth * tanHalfFov);
		const arc = Math.sin(Math.PI * this.progress);
		const screenX = startX + (destinationX - startX) * this.progress - arc * .055;
		const screenY = startY + (destinationY - startY) * this.progress + arc * .07 * (1 - this.progress * .25);
		this.start.set(screenX * depth * tanHalfFov * aspect, screenY * depth * tanHalfFov, -depth);
		this.inverse.copy(parentWorld).invert();
		return position.copy(this.start)
			.applyMatrix4(this.cameraWorld).applyMatrix4(this.inverse);
	}
}
