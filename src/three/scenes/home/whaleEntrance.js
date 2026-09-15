import { Vector3 } from "three";

const smoother = t => t * t * t * (t * (t * 6 - 15) + 10);

/** A large silhouette emerges from darkness and approaches in its settled orientation. */
export class WhaleEntrance {
	constructor() {
		this.offset = new Vector3();
		this.reveal = 0;
		this.swimRate = 1;
		this.sway = 1;
	}

	sample(progress, config = {}) {
		const t = Math.max(0, Math.min(1, progress));
		// Both ends have zero velocity and acceleration: no launch or late braking kick.
		const u = smoother(t);
		const remaining = 1 - u;
		this.offset.set((config.distance ?? 1.2) * remaining, -(config.rise ?? .6) * remaining,
			-(config.depth ?? 14) * remaining);
		// Light reveals a still-large whale before the slow approach has finished.
		this.reveal = smoother(Math.max(0, Math.min(1, (t - .04) / .72)));
		this.swimRate = .8 + .2 * u;
		this.sway = u;
		return this;
	}
}
