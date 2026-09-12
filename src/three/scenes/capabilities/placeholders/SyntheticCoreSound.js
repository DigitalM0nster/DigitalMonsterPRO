import { connectGainWithPanToMasterBus, getMasterAudioContext, resumeMasterAudioContext } from "@/sounds/masterAudioBus.js";
import { isPageSoundAllowed, registerPageVisibilitySoundHandlers } from "@/sounds/pageVisibilitySound.js";
import { isSoundAudible, isSiteSoundMuteFading, registerSiteSoundMuteHandler } from "@/sounds/siteSoundToggle.js";
import { prepareCoreAccentBuffers } from "./syntheticCoreAccentBuffers.js";
import { loadAudioBuffer } from "@/sounds/audioAssetCache.js";
import { SOUND_CATALOG } from "@/sounds/soundCatalog.js";

const HOVER_VOLUME = 0.022;
const LIGHT_VOLUME = 0.045;
const SURFACE_VOLUME = LIGHT_VOLUME;
const OPENING_VOLUME = 0.46 * 0.8 * 0.5 / 1.5 * 1.15;
const FLOW_VOLUME = 0.26;
// Same recording, pitch and filter as the approved white-particle appear SFX.
const FLOW_RATE = 0.96;
const FLOW_CUTOFF = 7200;
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const smoothstep = (value, from, to) => { const p = clamp((value - from) / (to - from)); return p * p * (3 - 2 * p); };

/** A quiet contact tone, electrical touch, breathing light and an opening-driven mix. */
export class SyntheticCoreSound {
	constructor() {
		this.buffers = null;
		this.voices = new Map();
		this.entries = new Set();
		this.lastProgress = 0;
		this.lastPointerX = 0; this.lastPointerY = 0;
		this.lastSphereHover = false;
		this.surfaceMotion = 0;
		this.disposed = false;
		this.unbindMute = registerSiteSoundMuteHandler({ onFadeStart: () => this.stop(), onMuteComplete: () => this.stop() });
		this.unbindVisibility = registerPageVisibilitySoundHandlers({ suspend: () => this.stop() });
	}

	async prepare() {
		const ctx = getMasterAudioContext();
		if (!ctx) return;
		try {
			const [buffers, flow] = await Promise.all([
				prepareCoreAccentBuffers(ctx, () => this.disposed),
				loadAudioBuffer(SOUND_CATALOG.about_particles, ctx).catch(() => null),
			]);
			if (!this.disposed && buffers) { buffers.flow = flow; this.buffers = buffers; }
		} catch { /* Audio failure must not block the visual scene's ready gate. */ }
	}

	_start(key, buffer, { offset = 0, rate = 1, loop = true, direction = 0 } = {}) {
		const ctx = getMasterAudioContext();
		const source = ctx.createBufferSource(), gain = ctx.createGain(), filter = ctx.createBiquadFilter();
		source.buffer = buffer; source.loop = loop; source.playbackRate.value = rate;
		if (loop) { source.loopStart = 0; source.loopEnd = buffer.duration; }
		gain.gain.value = 0; filter.type = "lowpass"; filter.frequency.value = 1400; filter.Q.value = 0.4;
		const panner = connectGainWithPanToMasterBus(ctx, gain, 0.18);
		source.connect(filter); filter.connect(gain);
		const entry = { key, source, gain, filter, panner, direction, offset, rate, updatedAt: ctx.currentTime, stopping: false };
		this.entries.add(entry); this.voices.set(key, entry);
		source.onended = () => {
			source.disconnect(); gain.disconnect(); filter.disconnect(); panner?.disconnect();
			this.entries.delete(entry);
			if (this.voices.get(key) === entry) this.voices.delete(key);
		};
		source.start(ctx.currentTime, Math.min(offset, buffer.duration * 0.995));
		source.stop(ctx.currentTime + 0.45);
		return entry;
	}

	_fade(entry) {
		if (!entry || entry.stopping) return;
		entry.stopping = true;
		const now = getMasterAudioContext().currentTime;
		entry.gain.gain.cancelScheduledValues(now);
		entry.gain.gain.setTargetAtTime(0, now, 0.075);
		entry.source.stop(now + 0.3);
		if (this.voices.get(entry.key) === entry) this.voices.delete(entry.key);
	}

	_drive(entry, volume, rate, pan, cutoff) {
		const now = getMasterAudioContext().currentTime;
		entry.gain.gain.cancelScheduledValues(now);
		entry.gain.gain.setTargetAtTime(volume, now, entry.key === "surface" ? 0.12 : 0.07);
		// No audio stranded if the page stops updating, even with a looping source.
		entry.gain.gain.setTargetAtTime(0, now + 0.16, 0.075);
		entry.source.stop(now + 0.45);
		entry.source.playbackRate.setTargetAtTime(rate, now, 0.045);
		entry.panner?.pan.setTargetAtTime(clamp(pan, -0.65, 0.65), now, 0.12);
		entry.filter.frequency.setTargetAtTime(cutoff, now, 0.12);
	}

	_loop(key, volume, pan, cutoff, elapsed, rate = 1) {
		let entry = this.voices.get(key);
		const buffer = this.buffers[key];
		if (!buffer || volume < 0.0008) { this._fade(entry); return; }
		if (!entry) {
			entry = this._start(key, buffer, { offset: key === "flow" ? 0 : elapsed * rate % buffer.duration, rate });
		}
		this._drive(entry, volume, rate, pan, cutoff);
	}

	_opening(delta, progress, speed, visibility) {
		let entry = this.voices.get("opening");
		if (Math.abs(speed) < 0.006 || Math.abs(speed * delta) > 0.35) { this._fade(entry); return; }
		const direction = Math.sign(speed), phase = direction > 0 ? progress : 1 - progress;
		if (!entry && phase > 0.995) return;
		const buffer = direction > 0 ? this.buffers.opening : this.buffers.closing;
		const offset = phase * buffer.duration * 0.995;
		const baseRate = clamp(Math.abs(speed) * buffer.duration, 0.12, 3);
		const now = getMasterAudioContext().currentTime;
		let predicted = entry ? entry.offset + (now - entry.updatedAt) * entry.source.playbackRate.value : offset;
		if (!entry || entry.direction !== direction || Math.abs(predicted - offset) > 0.16) {
			this._fade(entry);
			entry = this._start("opening", buffer, { offset, rate: baseRate, loop: false, direction });
			predicted = offset;
		}
		const rate = clamp(baseRate + (offset - predicted) * 3, 0.12, 3);
		entry.offset = predicted; entry.updatedAt = now;
		this._drive(entry, OPENING_VOLUME * Math.sqrt(clamp(Math.abs(speed) / 0.8)) * visibility, rate, 0.16, 1900);
	}

	update(delta, progress, elapsed, { enabled, visibility = 1, interactionEnabled = enabled, interactionVisibility = visibility, hud, pointer } = {}) {
		const ambientGain = enabled ? visibility : 0;
		const interactionGain = interactionEnabled ? interactionVisibility : 0;
		const dt = Math.max(0.001, delta), speed = (progress - this.lastProgress) / dt;
		const sphereHover = Boolean(interactionEnabled && hud?.sphereHovered && pointer);
		const pointerX = pointer?.x ?? 0, pointerY = pointer?.y ?? 0;
		const viewport = hud?.uniforms.uViewport.value;
		// Pixel speed, not a tiny fraction of the entire viewport: slow strokes on
		// the small lens must remain audible on wide screens too.
		const pointerSpeed = sphereHover && this.lastSphereHover
			? Math.hypot((pointerX - this.lastPointerX) * (viewport?.x ?? 1000) * 0.5,
				(pointerY - this.lastPointerY) * (viewport?.y ?? 800) * 0.5) / dt : 0;
		this.lastProgress = progress; this.lastPointerX = pointerX; this.lastPointerY = pointerY; this.lastSphereHover = sphereHover;
		if (this.disposed || Math.max(ambientGain, interactionGain) <= 0.001 || !this.buffers || !isSoundAudible() || isSiteSoundMuteFading() || !isPageSoundAllowed(true)) { this.stop(); return; }
		const ctx = getMasterAudioContext();
		if (ctx.state !== "running") { this.stop(); resumeMasterAudioContext(); return; }
		const motionTarget = Math.sqrt(clamp((pointerSpeed - 1.5) / 180));
		this.surfaceMotion += (motionTarget - this.surfaceMotion) * (1 - Math.exp(-dt * (motionTarget > this.surfaceMotion ? 16 : 9)));
		const focus = sphereHover ? (hud?.uniforms.uCoreHover.value ?? 0) : 0;
		this._loop("hover", HOVER_VOLUME * (1 - this.surfaceMotion * 0.5) * focus * interactionGain, 0.18, 650, elapsed);
		// Exactly the approved light-pulse timbre and level cap; motion changes
		// only its soft envelope, never pitch or metallic upper harmonics.
		this._loop("surface", SURFACE_VOLUME * this.surfaceMotion * focus * interactionGain, pointerX * 0.5, 650, elapsed);
		// Use the painted light phase, including the stronger pulse arriving from the HUD.
		const lightPhase = (elapsed + 1) % 5.4;
		const invitation = lightPhase < 1.8 ? Math.sin(Math.PI * lightPhase / 1.8) ** 1.5 : 0;
		const probe = hud?.lens.material.uniforms.uProbe.value ?? 0;
		this._loop("light", LIGHT_VOLUME * Math.max(invitation * (1 - focus * 0.7) * ambientGain, probe * 1.15 * interactionGain), 0.18, 650, elapsed);
		const actionGain = Math.max(ambientGain, interactionGain);
		this._opening(dt, progress, speed, actionGain);
		// Internal packets keep visibly moving after assembly stops. Their layer
		// follows exposure, fading away again as the shell closes.
		this._loop("flow", FLOW_VOLUME * smoothstep(progress, 0.55, 0.95) * actionGain, 0.1, FLOW_CUTOFF, elapsed, FLOW_RATE);
	}

	stop() { for (const entry of this.entries) this._fade(entry); this.surfaceMotion = 0; this.lastSphereHover = false; }

	dispose() {
		this.disposed = true; this.stop(); this.unbindMute(); this.unbindVisibility(); this.buffers = null;
	}
}
