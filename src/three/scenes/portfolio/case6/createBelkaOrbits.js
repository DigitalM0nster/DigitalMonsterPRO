import { createBelkaHaloField } from "./createBelkaHaloField.js";

export { createBelkaHaloField } from "./createBelkaHaloField.js";

/** Alias — maps old ring params into the halo field. */
export async function createBelkaOrbits(opts = {}) {
	return createBelkaHaloField({
		radius: ((opts.radiusA ?? 2) + (opts.radiusB ?? 2.4) + (opts.radiusC ?? 2.8)) / 3,
		radiusInner: opts.radiusA ?? 2,
		radiusOuter: opts.radiusC ?? 2.8,
		intensity: opts.neonIntensity ?? 2.8,
		shardScale: opts.beadScale ?? 1,
		shardCount: opts.sphereCount ?? 16,
	});
}
