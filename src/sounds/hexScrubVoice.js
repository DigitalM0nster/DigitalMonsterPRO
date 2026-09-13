const SEEK_FADE_SECONDS = 0.005;

/** Prepared PCM scrub voice; only short-lived buffer sources are created during motion. */
export class HexScrubVoice {
	constructor(context, buffer, output) {
		this.context = context;
		this.buffer = buffer;
		this.duration = buffer.duration;
		this._offset = 0;
		this._rate = 1;
		this._startedAt = 0;
		this._paused = true;
		this._ended = false;
		this._disposed = false;
		this._active = null;
		this._nextSlot = 0;
		// Two retained gain slots permit a short seek crossfade without growing the graph.
		this._slots = [0, 1].map(() => {
			const gain = context.createGain();
			gain.gain.value = 0;
			gain.connect(output);
			return { gain, source: null };
		});
	}

	get currentTime() {
		if (this._paused) return this._offset;
		const offset = this._offset + Math.max(0, this.context.currentTime - this._startedAt) * this._rate;
		if (offset >= this.duration) {
			this._offset = this.duration;
			this._paused = true;
			this._ended = true;
			return this.duration;
		}
		return offset;
	}

	set currentTime(value) {
		if (this._disposed || !Number.isFinite(value)) return;
		const offset = Math.max(0, Math.min(this.duration, value));
		const playing = !this.paused;
		this._offset = offset;
		this._startedAt = this.context.currentTime;
		this._ended = offset >= this.duration;
		if (playing && !this._ended) this._startSource(offset);
		else if (playing) this.pause();
	}

	get playbackRate() { return this._rate; }
	set playbackRate(value) {
		if (!(value > 0) || !Number.isFinite(value)) throw new RangeError("PCM playback rate must be positive");
		if (this._disposed || value === this._rate) return;
		// Rebase before changing rate, so drift is measured against the actual audio clock.
		this._offset = this.currentTime;
		this._startedAt = this.context.currentTime;
		this._rate = value;
		if (!this._paused && this._active?.source) this._active.source.playbackRate.value = value;
	}

	get paused() { void this.currentTime; return this._paused; }
	get ended() { void this.currentTime; return this._ended; }

	play() {
		if (!this._disposed && this.paused && !this.ended && this.context.state === "running") {
			this._startSource(this._offset);
		}
		// Unlike HTML media, finishing a PCM clip never implicitly rewinds it.
		return Promise.resolve();
	}

	pause() {
		if (this._disposed) return;
		this._offset = this.currentTime;
		this._paused = true;
		const active = this._active;
		this._active = null;
		if (active) this._retire(active, SEEK_FADE_SECONDS);
	}

	_retire(slot, fadeSeconds) {
		const source = slot.source;
		if (!source) return;
		const now = this.context.currentTime;
		slot.gain.gain.cancelScheduledValues(now);
		if (fadeSeconds > 0) {
			slot.gain.gain.setValueAtTime(slot.gain.gain.value, now);
			slot.gain.gain.linearRampToValueAtTime(0, now + fadeSeconds);
		} else {
			slot.gain.gain.setValueAtTime(0, now);
		}
		try { source.stop(now + fadeSeconds); } catch { /* already ended */ }
		if (fadeSeconds === 0) {
			source.disconnect();
			if (slot.source === source) slot.source = null;
		}
	}

	_startSource(offset) {
		const now = this.context.currentTime;
		const previous = this._active;
		const slot = this._slots[this._nextSlot];
		this._nextSlot = 1 - this._nextSlot;
		// A second seek within5ms reuses the oldest slot; overlap stays bounded at two.
		this._retire(slot, 0);
		const source = this.context.createBufferSource();
		source.buffer = this.buffer;
		source.playbackRate.value = this._rate;
		source.connect(slot.gain);
		slot.source = source;
		this._active = slot;
		this._offset = offset;
		this._startedAt = now;
		this._paused = false;
		this._ended = false;
		source.onended = () => {
			source.disconnect();
			if (slot.source !== source) return;
			slot.source = null;
			if (this._active === slot) {
				this._offset = this.duration;
				this._paused = true;
				this._ended = true;
				this._active = null;
			}
		};
		slot.gain.gain.cancelScheduledValues(now);
		slot.gain.gain.setValueAtTime(0, now);
		slot.gain.gain.linearRampToValueAtTime(1, now + SEEK_FADE_SECONDS);
		source.start(now, offset);
		if (previous && previous !== slot) this._retire(previous, SEEK_FADE_SECONDS);
	}

	dispose() {
		if (this._disposed) return;
		this._disposed = true;
		this._active = null;
		this._paused = true;
		for (const slot of this._slots) {
			this._retire(slot, 0);
			slot.gain.disconnect();
		}
		this.buffer = null;
	}
}
