import { loadAudioBuffer } from "./audioAssetCache.js";
import { SOUND_CATALOG } from "./soundCatalog.js";
import { connectGainWithPanToMasterBus, getMasterAudioContext, resumeMasterAudioContext } from "./masterAudioBus.js";
import { isPageSoundAllowed, registerPageVisibilitySoundHandlers } from "./pageVisibilitySound.js";
import { isSoundAudible, isSiteSoundMuteFading, registerSiteSoundMuteHandler } from "./siteSoundToggle.js";
import { LightTrailSoundMotion } from "./lightTrailSoundMotion.js";
import { getLetterSnakeVolume, LETTER_SNAKE_SOUND } from "./letterSnakeSound.js";

let preparedBuffers = null;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const FLIGHT_AIR_VOLUME = 0.011;
const LINE_IDLE_VOLUME = 0.02;
const LINE_GLIDE_VOLUME = 0.075;
const LINE_SWEEP_VOLUME = 0.07125;
const TEXT_MOSAIC_VOLUME = 0.8;

function createTitleRevealBuffer(ctx, logo, glitch) {
	// Match the home title: logo_reveal + glitch_button start together at their
	// original relative gain. Map only the recording's duration to the visible wipe;
	// padding it with silence made the audible part finish before the animation.
	const length = Math.ceil(Math.max(logo.duration, glitch.duration) * ctx.sampleRate);
	const reveal = ctx.createBuffer(2, length, ctx.sampleRate);
	for (const buffer of [logo, glitch]) {
		for (let channel = 0; channel < reveal.numberOfChannels; channel++) {
			const source = buffer.getChannelData(Math.min(channel, buffer.numberOfChannels - 1));
			const output = reveal.getChannelData(channel);
			const count = Math.min(output.length, Math.floor(buffer.duration * ctx.sampleRate));
			for (let i = 0; i < count; i++) {
				const position = i * buffer.sampleRate / ctx.sampleRate;
				const index = Math.min(source.length - 1, Math.floor(position));
				const next = Math.min(source.length - 1, index + 1);
				output[i] += source[index] + (source[next] - source[index]) * (position - index);
			}
		}
	}
	return reveal;
}

async function prepareBuffers() {
	const ctx = getMasterAudioContext();
	if (!ctx) return null;
	// Cached recording used by the opened sphere's information streams.
	const letterFlow = await loadAudioBuffer(SOUND_CATALOG[LETTER_SNAKE_SOUND.soundId], ctx);
	await new Promise(resolve => requestAnimationFrame(resolve));
	const glitch = await loadAudioBuffer(SOUND_CATALOG.glitch_button, ctx);
	await new Promise(resolve => requestAnimationFrame(resolve));
	const logo = await loadAudioBuffer(SOUND_CATALOG.logo_reveal, ctx);
	await new Promise(resolve => requestAnimationFrame(resolve));
	const titleReveal = createTitleRevealBuffer(ctx, logo, glitch);
	await new Promise(resolve => requestAnimationFrame(resolve));
	const flight = await loadAudioBuffer(SOUND_CATALOG.capability_flight_air, ctx);
	await new Promise(resolve => requestAnimationFrame(resolve));
	const movement = await loadAudioBuffer(SOUND_CATALOG.capability_line_energy, ctx);
	await new Promise(resolve => requestAnimationFrame(resolve));
	const glide = await loadAudioBuffer(SOUND_CATALOG.capability_line_sweep, ctx);
	return { letterFlow, mosaicAppear: titleReveal, mosaicDisappear: titleReveal, flight, movement, glide };
}

/** Local capability mix: painted text scrubs + an airy flight bed and moving light. */
export class CapabilitySceneSound {
	constructor() {
		this.buffers = null;
		this.voices = new Map();
		this.entries = new Set();
		this.progress = new Map();
		this.letterFlowVolume = 0;
		this.flightMotion = new LightTrailSoundMotion();
		this.movementOffset = 0;
		this.glideOffset = 0;
		this.disposed = false;
		this.unbindMute = registerSiteSoundMuteHandler({ onFadeStart: () => this.stop(), onMuteComplete: () => this.stop() });
		this.unbindVisibility = registerPageVisibilitySoundHandlers({ suspend: () => this.stop() });
	}

	async prepare() {
		if (!preparedBuffers) preparedBuffers = prepareBuffers().catch(() => { preparedBuffers = null; return null; });
		const buffers = await preparedBuffers;
		if (!this.disposed) this.buffers = buffers;
	}

	_start(key, buffer, { offset = 0, rate = 1, pan = 0, loop = false, direction = 0 } = {}) {
		const ctx = getMasterAudioContext();
		const source = ctx.createBufferSource(), gain = ctx.createGain();
		const filter = key === "title" ? null : ctx.createBiquadFilter();
		const lowCut = key === "movement" || key === "glide" ? ctx.createBiquadFilter() : null;
		source.buffer = buffer; source.loop = loop; source.playbackRate.value = rate;
		if (filter) { filter.type = "lowpass"; filter.frequency.value = key === "letter-flow" ? LETTER_SNAKE_SOUND.cutoff : 6500; filter.Q.value = key === "letter-flow" ? LETTER_SNAKE_SOUND.q : 0.5; }
		if (lowCut) { lowCut.type = "highpass"; lowCut.frequency.value = 120; lowCut.Q.value = 0.6; }
		gain.gain.value = 0;
		const panner = connectGainWithPanToMasterBus(ctx, gain, 0.001);
		panner?.pan.setValueAtTime(pan, ctx.currentTime);
		if (lowCut) { source.connect(lowCut); lowCut.connect(filter); filter.connect(gain); }
		else if (filter) { source.connect(filter); filter.connect(gain); }
		else source.connect(gain);
		const entry = { key, source, gain, filter, panner, direction, offset, rate, updatedAt: ctx.currentTime, stopping: false };
		this.entries.add(entry); this.voices.set(key, entry);
		source.onended = () => {
			source.disconnect(); lowCut?.disconnect(); filter?.disconnect(); gain.disconnect(); panner?.disconnect();
			this.entries.delete(entry);
			if (this.voices.get(key) === entry) this.voices.delete(key);
		};
		source.start(ctx.currentTime, Math.min(offset, buffer.duration * 0.99));
		source.stop(ctx.currentTime + 0.4);
		return entry;
	}

	_fade(entry) {
		if (!entry || entry.stopping) return;
		entry.stopping = true;
		const now = getMasterAudioContext().currentTime;
		const text = entry.key === "title" || entry.key === "letter-flow";
		entry.gain.gain.cancelScheduledValues(now);
		entry.gain.gain.setTargetAtTime(0, now, text ? 0.025 : 0.065);
		entry.source.stop(now + (text ? 0.12 : 0.3));
		if (this.voices.get(entry.key) === entry) this.voices.delete(entry.key);
	}

	_drive(entry, volume, rate, pan, cutoff = 6500, smoothing = 0.04) {
		const now = getMasterAudioContext().currentTime;
		entry.source.playbackRate.setTargetAtTime(rate, now, smoothing);
		entry.panner?.pan.setTargetAtTime(clamp(pan, -0.85, 0.85), now, 0.08);
		entry.filter?.frequency.setTargetAtTime(cutoff, now, 0.08);
		entry.gain.gain.cancelScheduledValues(now);
		entry.gain.gain.setTargetAtTime(volume, now, smoothing);
		// A dormant scene cannot strand a loop: renewal requires visible animation frames.
		entry.gain.gain.setTargetAtTime(0, now + 0.14, 0.065);
		entry.source.stop(now + 0.4);
	}

	_scrub(key, delta, progress, pan, volume, sampleRange = null) {
		const previous = this.progress.get(key) ?? progress;
		this.progress.set(key, progress);
		const difference = progress - previous, speed = difference / Math.max(0.001, delta);
		let entry = this.voices.get(key);
		if (Math.abs(difference) > 0.5 || Math.abs(speed) < 0.015) { this._fade(entry); return; }
		if (key !== "title") {
			this.letterFlowVolume = Math.max(this.letterFlowVolume, getLetterSnakeVolume(delta, previous, progress, volume));
			return;
		}
		// Both directions keep the home title's original sound, following painted speed.
		const direction = Math.sign(speed);
		const phase = direction > 0 ? progress : 1 - progress;
		// A source may finish a frame before the last visual cell settles. Do not
		// retrigger a few milliseconds of its tail while waiting for that frame.
		if (!entry && phase >= 0.98) return;
		const buffer = direction < 0 ? this.buffers.mosaicDisappear : this.buffers.mosaicAppear;
		// Short reveals can follow the recording's audible body instead of spending
		// their final moving cells on its quiet tail. Other scenes keep the full sample.
		const start = sampleRange ? clamp(sampleRange.start, 0, buffer.duration * 0.98) : 0;
		const end = sampleRange ? clamp(sampleRange.end, start + 0.001, buffer.duration) : buffer.duration;
		const span = end - start;
		const offset = start + phase * span;
		const baseRate = clamp(Math.abs(speed) * span, 0.05, 4);
		const now = getMasterAudioContext().currentTime;
		let predicted = entry ? entry.offset + (now - entry.updatedAt) * entry.source.playbackRate.value : offset;
		if (!entry || entry.direction !== direction || Math.abs(predicted - offset) > 0.12) {
			this._fade(entry);
			entry = this._start(key, buffer, { offset, rate: baseRate, pan, direction });
			predicted = offset;
		}
		// Audio advances on wall time; the scene can slow or pause under load.
		// Correct small drift through rate, reserving seeks for large discontinuities.
		const correction = clamp((offset - predicted) / 0.1, -baseRate * 0.2, baseRate * 0.2);
		const rate = clamp(baseRate + correction, 0.05, 4);
		entry.offset = predicted; entry.updatedAt = now; entry.rate = rate;
		this._drive(entry, volume, rate, pan, 6500, 0.012);
	}

	_letterFlow() {
		let entry = this.voices.get("letter-flow");
		if (this.letterFlowVolume <= 0) { this._fade(entry); return; }
		if (!entry) entry = this._start("letter-flow", this.buffers.letterFlow, { rate: LETTER_SNAKE_SOUND.rate, loop: true, pan: -0.5 });
		// One layer even when two labels cross; same pitch/filter as the sphere.
		this._drive(entry, this.letterFlowVolume, LETTER_SNAKE_SOUND.rate, -0.5, LETTER_SNAKE_SOUND.cutoff, LETTER_SNAKE_SOUND.attack);
	}

	_flight(delta, world, visibility) {
		const data = world.trailChainData;
		if (!data) return;
		this.flightMotion.update(delta, data);
		const sweep = this.flightMotion.amount;
		const flight = this.voices.get("flight") ?? this._start("flight", this.buffers.flight, { loop: true });
		// Keep air behind the foreground gesture, with no additional audible layer.
		this._drive(flight, FLIGHT_AIR_VOLUME * (1 - sweep * 0.2) * visibility, 0.9, world.cameraBank * 0.35, 900, 0.16);
		// Long, phase-continuous recordings keep their playheads through gestures.
		// Motion opens the sound smoothly; it must never retrigger a short whoosh.
		const expression = sweep ** 0.85;
		this.movementOffset = (this.movementOffset + delta) % this.buffers.movement.duration;
		const motion = this.voices.get("movement") ?? this._start("movement", this.buffers.movement, { loop: true, offset: this.movementOffset });
		const volume = LINE_IDLE_VOLUME + expression * (LINE_GLIDE_VOLUME - LINE_IDLE_VOLUME);
		this._drive(motion, volume * visibility, 1, this.flightMotion.pan * 0.45, 2100 + expression * 450, 0.22);
		const glideRate = 0.96 + expression * 0.08;
		this.glideOffset = (this.glideOffset + delta * glideRate) % this.buffers.glide.duration;
		const glide = this.voices.get("glide") ?? this._start("glide", this.buffers.glide, { loop: true, offset: this.glideOffset });
		this._drive(glide, LINE_SWEEP_VOLUME * expression * visibility, glideRate, this.flightMotion.pan * 0.65, 2200 + expression * 600, 0.24);
	}

	update(delta, { enabled, hoverEnabled = enabled, hudEnabled = enabled, reveal, titleSampleRange = null, hudReveal = 0, hoverReveals = null, hudVolume = 1, hoverVolume = hudVolume, pan = -0.35, flightWorld = null, visibility = 1, hudVisibility = visibility }) {
		if (this.disposed || (!enabled && !hoverEnabled && !hudEnabled) || !this.buffers || !isSoundAudible() || isSiteSoundMuteFading() || !isPageSoundAllowed(true)) {
			this.stop(); this.progress.set("title", reveal); this.progress.set("hud", hudReveal);
			for (let i = 0; i < (hoverReveals?.length ?? 0); i++) this.progress.set(`hover-${i}`, hoverReveals[i]);
			return;
		}
		const ctx = getMasterAudioContext();
		if (ctx?.state !== "running") { resumeMasterAudioContext(); return; }
		this.letterFlowVolume = 0;
		if (enabled) {
			this._scrub("title", delta, reveal, pan, TEXT_MOSAIC_VOLUME * visibility, titleSampleRange);
		} else {
			this._fade(this.voices.get("title"));
			this.progress.set("title", reveal);
		}
		// Interactive HUD text can already be painted inside an incoming hex band.
		if (hudEnabled) this._scrub("hud", delta, hudReveal, -0.5, hudVolume * hudVisibility);
		else this.progress.set("hud", hudReveal);
		// Separate playheads preserve both directions when the pointer crosses between labels.
		for (let i = 0; i < (hoverReveals?.length ?? 0); i++) {
			if (hoverEnabled) this._scrub(`hover-${i}`, delta, hoverReveals[i], -0.5, hoverVolume * visibility);
			else this.progress.set(`hover-${i}`, hoverReveals[i]);
		}
		this._letterFlow();
		if (enabled && flightWorld && visibility > 0.001) this._flight(delta, flightWorld, visibility);
		else { this._fade(this.voices.get("flight")); this._fade(this.voices.get("movement")); this._fade(this.voices.get("glide")); this.flightMotion.reset(); }
	}

	stop() { for (const entry of this.entries) this._fade(entry); this.flightMotion.reset(); }
	dispose() {
		this.disposed = true; this.stop(); this.unbindMute(); this.unbindVisibility(); this.buffers = null;
	}
}
