const TAU = Math.PI * 2;

/** Short, enveloped energy/glass accents, baked once under the preloader curtain. */
export async function prepareCoreAccentBuffers(context) {
	const buffers = {};
	for (const [name, duration] of [["light", 1.8], ["hover", 0.46]]) {
		const buffer = context.createBuffer(1, Math.ceil(duration * context.sampleRate), context.sampleRate);
		const samples = buffer.getChannelData(0);
		let seed = 731, air = 0;
		for (let start = 0; start < samples.length; start += 8192) {
			await new Promise(resolve => requestAnimationFrame(resolve));
			for (let i = start; i < Math.min(start + 8192, samples.length); i++) {
				const t = i / context.sampleRate, phase = i / (samples.length - 1);
				seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
				air += ((seed / 4294967296 * 2 - 1) - air) * 0.18;
				const tail = Math.min(1, (1 - phase) * 6) ** 2;
				if (name === "light") {
					const envelope = (1 - Math.exp(-t / 0.065)) * Math.exp(-t * 1.7) * tail;
					const body = Math.sin(TAU * (175 * t + 45 * t * t)) * 0.5
						+ Math.sin(TAU * (352 * t + 90 * t * t)) * 0.19;
					const shimmer = Math.sin(TAU * (1050 * t - 180 * t * t)) * (0.09 + Math.sin(t * 31) * 0.035);
					samples[i] = (body + shimmer + air * 0.2) * envelope;
				} else {
					const envelope = (1 - Math.exp(-t / 0.009)) * Math.exp(-t * 8) * tail;
					const pitch = 620 * t + 42 * (t - 0.035 * (1 - Math.exp(-t / 0.035)));
					samples[i] = (Math.sin(TAU * pitch) * 0.6 + Math.sin(TAU * 1324 * t) * 0.17 + air * 0.07) * envelope;
				}
			}
		}
		buffers[name] = buffer;
	}
	return buffers;
}
