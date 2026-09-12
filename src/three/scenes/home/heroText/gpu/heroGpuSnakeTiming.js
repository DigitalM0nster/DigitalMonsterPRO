// GPU counterpart of glitchSnakeEngine's per-line wave timing.
export function resolveHeroGpuSnakeTiming(lines, options = {}) {
	const letters = Math.max(0, options.delayBetweenLetters ?? 40);
	const symbols = Math.max(1, options.delayBetweenSymbols ?? 40);
	const slow = options.slowMotion > 0 ? options.slowMotion : 1;
	const scales = lines.map(({ lastWave, lastIndex, lastCount }) => {
		const natural = lastWave * lastCount * symbols + lastIndex * letters + lastCount * symbols;
		const budgetScale = options.timeBudgetMs > 0 && natural > options.timeBudgetMs ? options.timeBudgetMs / natural : 1;
		return { scale: budgetScale * slow, duration: Math.round(natural * budgetScale * slow) };
	});
	return { letters, symbols, scales, fade: Math.max(0, options.mainLetterFadeMs ?? 10) };
}

/** One finite playhead, driven by the scene; no per-letter timers or rAF. */
export class HeroGpuSnakeMotion {
	constructor(uniforms, variants, options) {
		this.uniforms = uniforms;
		this.variants = variants;
		this.options = options;
		this.current = 0;
		this.pending = null;
	}
	set(index) {
		this.current = index;
		this.uniforms.uLocaleFrom.value = index;
		this.uniforms.uLocaleTo.value = index;
		this.uniforms.uSnakeTime.value = -1;
		const resolve = this.pending?.resolve;
		this.pending = null;
		resolve?.();
	}
	finish() { this.set(this.pending?.to ?? this.current); }
	start(to, options = this.options()) {
		this.finish();
		if (to === this.current) return { promise: Promise.resolve(), duration: 0 };
		const allLines = this.variants.flatMap(v => v.lines);
		const timing = resolveHeroGpuSnakeTiming(allLines, options);
		const durationFor = index => Math.max(0, ...this.variants[index].lines.map(line => timing.scales[line.id].duration));
		const delay = Math.round(durationFor(this.current) * Math.max(0, Math.min(1, options.appearOverlapRatio ?? 0.9)));
		const duration = Math.max(durationFor(this.current), delay + durationFor(to));
		this.uniforms.uSnakeTiming.value.set(timing.letters, timing.symbols, timing.fade, delay);
		timing.scales.forEach((line, i) => { this.uniforms.uLineScales.value[i] = line.scale; });
		this.uniforms.uLocaleFrom.value = this.current;
		this.uniforms.uLocaleTo.value = to;
		this.uniforms.uSnakeTime.value = 0;
		const promise = new Promise(resolve => { this.pending = { to, duration, elapsed: 0, resolve }; });
		return { promise, duration };
	}
	update(delta) {
		if (!this.pending) return;
		this.pending.elapsed += Math.max(0, Math.min(delta, 0.1)) * 1000;
		this.uniforms.uSnakeTime.value = this.pending.elapsed;
		if (this.pending.elapsed >= this.pending.duration) this.finish();
	}
}
