const TAU = Math.PI * 2;

/** Bake soft, band-limited textures under the curtain; runtime only mixes buffers. */
export async function prepareCoreAccentBuffers(context, cancelled = () => false) {
	const buffers = {};
	for (const [name, duration] of [["hover", 1], ["light", 2], ["opening", 3]]) {
		const buffer = context.createBuffer(1, Math.ceil(duration * context.sampleRate), context.sampleRate);
		for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
			const samples = buffer.getChannelData(channel);
			const fastAlpha = 1 - Math.exp(-TAU * 1400 / context.sampleRate);
			const slowAlpha = 1 - Math.exp(-TAU * 170 / context.sampleRate);
			let seed = 731 + channel * 103, fast = 0, slow = 0;
			for (let start = 0; start < samples.length; start += 16384) {
				await new Promise(resolve => requestAnimationFrame(resolve));
				if (cancelled()) return null;
				for (let i = start; i < Math.min(start + 16384, samples.length); i++) {
					const t = i / context.sampleRate;
					if (name === "hover") {
						// Fixed pitch, no chirp, beat or tremolo on a stationary pointer.
						samples[i] = Math.sin(TAU * 196 * t) * 0.4 + Math.sin(TAU * 392 * t) * 0.045;
					} else if (name === "light") {
						// Same calm 196 Hz voice as hover; the painted glow shapes its volume.
						samples[i] = Math.sin(TAU * 196 * t) * 0.34 + Math.sin(TAU * 392 * t) * 0.038;
					} else if (name === "opening") {
						seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
						const noise = seed / 4294967296 * 2 - 1;
						fast += (noise - fast) * fastAlpha; slow += (noise - slow) * slowAlpha;
						const air = fast - slow;
						const phase = i / (samples.length - 1), envelope = Math.sin(Math.PI * phase) ** 0.7;
						const breath = 0.8 + Math.sin(TAU * phase * 2) * 0.2;
						samples[i] = (air * 1.35 * breath + Math.sin(TAU * 196 * t) * 0.07 + Math.sin(TAU * 294 * t) * 0.025) * envelope;
					}
				}
			}
		}
		buffers[name] = buffer;
	}
	// Reuse the approved glow recording verbatim for pointer movement.
	buffers.surface = buffers.light;
	const opening = buffers.opening;
	buffers.closing = context.createBuffer(1, opening.length, opening.sampleRate);
	const source = opening.getChannelData(0), target = buffers.closing.getChannelData(0);
	for (let start = 0; start < source.length; start += 16384) {
		await new Promise(resolve => requestAnimationFrame(resolve));
		if (cancelled()) return null;
		for (let i = start; i < Math.min(start + 16384, source.length); i++) target[i] = source[source.length - 1 - i];
	}
	return buffers;
}
