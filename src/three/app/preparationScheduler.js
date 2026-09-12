/** Production always warms fully; development can opt into the same gate. */
export function resolveFullWarm({ development = false, search = "" } = {}) {
	return !development || new URLSearchParams(search).get("fullWarm") === "1";
}

/** Cooperative CPU budget. GPU submissions always get their own frame. */
export class PreparationScheduler {
	constructor({ nextFrame, cancelled = () => false, now = () => performance.now(), budgetMs = 3 }) {
		this.nextFrame = nextFrame;
		this.cancelled = cancelled;
		this.now = now;
		this.budgetMs = budgetMs;
		this.spentMs = 0;
		this.lastJobMs = 0;
		this.stats = { jobs: 0, yields: 0, maxJobMs: 0 };
		// Only existing synchronous scene updates are sampled; no extra warm work.
		this.sceneCpuSamples = Object.create(null);
	}

	check() {
		if (this.cancelled()) throw new DOMException("Preparation cancelled", "AbortError");
	}

	async breath() {
		this.check();
		await this.nextFrame();
		// Give the loader an extra paint after expensive, indivisible driver work.
		if (this.lastJobMs > 8) await this.nextFrame();
		this.check();
		this.stats.yields++;
		this.spentMs = 0;
		this.lastJobMs = 0;
	}

	async run(job, { gpu = false, cpuSceneId = null } = {}) {
		this.check();
		if (gpu || this.spentMs >= this.budgetMs) await this.breath();
		const start = this.now();
		let completed = false;
		try {
			const result = job();
			completed = !result || typeof result.then !== "function";
			return result;
		} finally {
			this.lastJobMs = this.now() - start;
			this.spentMs += this.lastJobMs;
			this.stats.jobs++;
			this.stats.maxJobMs = Math.max(this.stats.maxJobMs, this.lastJobMs);
			if (completed && !gpu && cpuSceneId) {
				const sample = this.sceneCpuSamples[cpuSceneId];
				if (!sample) {
					this.sceneCpuSamples[cpuSceneId] = { firstMs: this.lastJobMs, repeatsMs: [], count: 1 };
				} else {
					sample.count++;
					if (sample.repeatsMs.length < 32) sample.repeatsMs.push(this.lastJobMs);
				}
			}
		}
	}
}
