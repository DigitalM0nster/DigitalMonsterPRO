import { loadAudioBuffer } from "@/sounds/audioAssetCache.js";
import { SOUND_CATALOG } from "@/sounds/soundCatalog.js";
import { connectGainWithPanToMasterBus, getMasterAudioContext, resumeMasterAudioContext } from "@/sounds/masterAudioBus.js";
import { isPageSoundAllowed, registerPageVisibilitySoundHandlers } from "@/sounds/pageVisibilitySound.js";
import { isSoundAudible, isSiteSoundMuteFading, registerSiteSoundMuteHandler } from "@/sounds/siteSoundToggle.js";
import { prepareCoreAccentBuffers } from "./syntheticCoreAccentBuffers.js";

const LIGHT_VOLUME = 0.24;
const HOVER_VOLUME = 0.3;
const PROBE_VOLUME = 0.34;

/** Uses the site's prepared samples and master bus; the spring drives the motor. */
export class SyntheticCoreSound {
	constructor() {
		this.buffers = null;
		this.motion = null;
		this.entries = new Set();
		this.lastProgress = 0;
		this.lastBeat = -1;
		this.accentBuffers = null;
		this.accents = new Map();
		this.lastLightCycle = -1;
		this.lastSphereHover = false;
		this.lastHoverTime = -Infinity;
		this.lastProbeAge = Infinity;
		this.disposed = false;
		this.unbindMute = registerSiteSoundMuteHandler({ onFadeStart: () => this.stop(), onMuteComplete: () => this.stop() });
		this.unbindVisibility = registerPageVisibilitySoundHandlers({ suspend: () => this.stop() });
	}

	async prepare() {
		const ctx = getMasterAudioContext();
		if (!ctx) return;
		try {
			const buffers = await Promise.all([
				loadAudioBuffer(SOUND_CATALOG.card_movement, ctx),
				loadAudioBuffer(SOUND_CATALOG.digital_sound, ctx),
			]);
			const accents = await prepareCoreAccentBuffers(ctx);
			if (!this.disposed) { this.buffers = buffers; this.accentBuffers = accents; }
		} catch { /* Audio failure must not block the visual scene's ready gate. */ }
	}

	_start(buffer, offset, rate, volume, direction = 0, duration = 0.4) {
		const ctx = getMasterAudioContext();
		if (!ctx || ctx.state !== "running") return null;
		const source = ctx.createBufferSource(), gain = ctx.createGain();
		source.buffer = buffer;
		source.playbackRate.value = rate;
		gain.gain.setValueAtTime(0, ctx.currentTime);
		gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.035);
		const panner = connectGainWithPanToMasterBus(ctx, gain, 0.18);
		source.connect(gain);
		const entry = { source, gain, panner, direction, offset, rate, updatedAt: ctx.currentTime, stopping: false };
		this.entries.add(entry);
		source.onended = () => {
			source.disconnect(); gain.disconnect(); panner?.disconnect();
			this.entries.delete(entry);
			if (this.motion === entry) this.motion = null;
			if (this.accents.get(entry.accent) === entry) this.accents.delete(entry.accent);
		};
		source.start(ctx.currentTime, Math.min(offset, buffer.duration * 0.995));
		source.stop(ctx.currentTime + duration);
		return entry;
	}

	_fade(entry) {
		if (!entry || entry.stopping) return;
		entry.stopping = true;
		const now = getMasterAudioContext().currentTime;
		entry.gain.gain.cancelScheduledValues(now);
		entry.gain.gain.setTargetAtTime(0, now, 0.06);
		entry.source.stop(now + 0.24);
		if (this.motion === entry) this.motion = null;
		if (this.accents.get(entry.accent) === entry) this.accents.delete(entry.accent);
	}

	_accent(key, buffer, volume, offset = 0, rate = 1) {
		this._fade(this.accents.get(key));
		const entry = this._start(buffer, offset, rate, volume, 0, (buffer.duration - offset) / rate);
		if (entry) { entry.accent = key; entry.volume = volume; this.accents.set(key, entry); }
	}

	update(delta, progress, elapsed, { enabled, visibility = 1, hud } = {}) {
		const speed = (progress - this.lastProgress) / Math.max(0.001, delta);
		this.lastProgress = progress;
		// Same phase as the lens shader's invitation ripple. Track even while muted
		// so resuming sound never replays a stale hover, probe or illumination event.
		const lightCycle = Math.floor((elapsed + 1) / 5.4), lightPhase = (elapsed + 1) % 5.4;
		const lightStarted = lightCycle !== this.lastLightCycle;
		const sphereHover = Boolean(hud?.sphereHovered);
		const hoverStarted = sphereHover && !this.lastSphereHover;
		const probeAge = hud?.probeAge ?? Infinity;
		const probeArrived = this.lastProbeAge < 0.55 && probeAge >= 0.55;
		this.lastLightCycle = lightCycle; this.lastSphereHover = sphereHover; this.lastProbeAge = probeAge;
		if (this.disposed || !enabled || visibility <= 0.001 || !isSoundAudible() || isSiteSoundMuteFading() || !isPageSoundAllowed(true)) { this.stop(); return; }
		if (!this.buffers) return;
		const ctx = getMasterAudioContext();
		if (ctx.state !== "running") { resumeMasterAudioContext(); return; }
		if (lightStarted && lightPhase < this.accentBuffers.light.duration) {
			this._accent("light", this.accentBuffers.light, LIGHT_VOLUME * (1 - (hud?.uniforms.uCoreHover.value ?? 0) * 0.7), lightPhase);
		}
		if (hoverStarted && elapsed - this.lastHoverTime > 0.22) {
			this.lastHoverTime = elapsed;
			this._accent("hover", this.accentBuffers.hover, HOVER_VOLUME);
		}
		if (!sphereHover) this._fade(this.accents.get("hover"));
		if (probeArrived) this._accent("light", this.accentBuffers.light, PROBE_VOLUME, 0, 1.4);
		for (const entry of this.accents.values()) {
			entry.gain.gain.setTargetAtTime(entry.volume * visibility, ctx.currentTime, 0.045);
		}
		if (Math.abs(speed) > 0.012) {
			const buffer = this.buffers[0], direction = Math.sign(speed);
			const offset = (direction > 0 ? progress : 1 - progress) * buffer.duration * 0.96;
			const rate = Math.max(0.25, Math.min(2.4, Math.abs(speed) * buffer.duration));
			const volume = Math.min(0.28, Math.abs(speed) * 0.22) * visibility;
			let entry = this.motion;
			let predicted = entry ? entry.offset + (ctx.currentTime - entry.updatedAt) * entry.rate : 0;
			if (!entry || entry.direction !== direction || Math.abs(predicted - offset) > 0.14) {
				this._fade(entry);
				entry = this.motion = this._start(buffer, offset, rate, volume, direction);
				predicted = offset;
			}
			if (entry) {
				entry.offset = predicted;
				entry.updatedAt = ctx.currentTime; entry.rate = rate;
				entry.source.playbackRate.setTargetAtTime(rate, ctx.currentTime, 0.025);
				entry.gain.gain.setTargetAtTime(volume, ctx.currentTime, 0.04);
				// A stopped scene cannot leave a motor running: renewal needs live frames.
				entry.source.stop(ctx.currentTime + 0.4);
			}
		} else this._fade(this.motion);
		const beat = Math.floor(elapsed / 2.6);
		if (progress > 0.85 && beat !== this.lastBeat) {
			this.lastBeat = beat;
			const pulse = this._start(this.buffers[1], 0.15 + (beat % 4) * 0.12, 1.15, 0.035 * visibility, 0, 0.22);
			if (pulse) pulse.gain.gain.setTargetAtTime(0, ctx.currentTime + 0.08, 0.04);
		}
	}

	stop() { for (const entry of this.entries) this._fade(entry); }

	dispose() {
		this.disposed = true;
		this.stop();
		this.unbindMute(); this.unbindVisibility();
		this.buffers = null;
		this.accentBuffers = null;
	}
}
