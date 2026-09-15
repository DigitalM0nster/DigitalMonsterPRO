import { Vector2 } from "three";

export const whaleCursorReactionConfig = {
	yaw: 0.11,
	pitch: 0.065,
	turnRate: 4,
	lightRate: 5,
	cursorRate: 9,
};

/** A bounded, critically damped turn layered over the prepared swim. */
function spring(state, key, velocityKey, target, rate, delta) {
	const offset = state[key] - target;
	const impulse = state[velocityKey] + rate * offset;
	const decay = Math.exp(-rate * delta);
	state[key] = target + (offset + impulse * delta) * decay;
	state[velocityKey] = (state[velocityKey] - rate * impulse * delta) * decay;
}

export class WhaleCursorReaction {
	constructor(eventTarget = window, motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)")) {
		this.eventTarget = eventTarget;
		this.motionPreference = motionPreference;
		this.cursor = new Vector2();
		this.hasHoverPointer = false;
		this._onMove = event => { this.hasHoverPointer = event.pointerType === "mouse" || event.pointerType === "pen"; };
		this._onOut = event => { if (event.relatedTarget == null) this.hasHoverPointer = false; };
		this._onBlur = () => { this.hasHoverPointer = false; };
		eventTarget.addEventListener("pointermove", this._onMove, { passive: true });
		eventTarget.addEventListener("pointerout", this._onOut, { passive: true });
		eventTarget.addEventListener("blur", this._onBlur);
		this.reset();
	}

	reset() {
		this.yaw = this.pitch = this.yawVelocity = this.pitchVelocity = this.strength = 0;
		this.wasEnabled = false;
	}

	update(delta, frame, ready) {
		const dt = Number.isFinite(delta) ? Math.max(0, delta) : 0;
		const pointer = frame?.pointer;
		// SceneManager owns both DOM blockers and hex Y-band membership.
		// Never use its ungated visualPointer for this page interaction.
		const enabled = Boolean(ready && this.hasHoverPointer && frame?.interactionEnabled
			&& !frame.pointerBlocked && Number.isFinite(pointer?.x) && Number.isFinite(pointer?.y));
		if (enabled) {
			if (!this.wasEnabled) this.cursor.set(pointer.x, pointer.y);
			else this.cursor.lerp(pointer, 1 - Math.exp(-whaleCursorReactionConfig.cursorRate * dt));
		}
		this.wasEnabled = enabled;
		const moving = enabled && !this.motionPreference.matches;
		const cfg = whaleCursorReactionConfig;
		const x = moving ? Math.max(-1, Math.min(1, pointer.x)) : 0;
		const y = moving ? Math.max(-1, Math.min(1, pointer.y)) : 0;
		// Bound the destination before easing. Clamping the animated position
		// instead makes diagonal reaches hit their limit and stop prematurely.
		const radius = Math.max(1, Math.hypot(x, y));
		spring(this, "yaw", "yawVelocity", x / radius * cfg.yaw, cfg.turnRate, dt);
		spring(this, "pitch", "pitchVelocity", -y / radius * cfg.pitch, cfg.turnRate, dt);
		this.strength += ((enabled ? 1 : 0) - this.strength) * (1 - Math.exp(-cfg.lightRate * dt));
	}

	applyUniforms(uniforms, aspect) {
		if (!uniforms?.uCursorPosition) return;
		uniforms.uCursorPosition.value.copy(this.cursor);
		uniforms.uCursorStrength.value = this.strength;
		uniforms.uCursorAspect.value = aspect;
	}

	dispose() {
		this.eventTarget.removeEventListener("pointermove", this._onMove);
		this.eventTarget.removeEventListener("pointerout", this._onOut);
		this.eventTarget.removeEventListener("blur", this._onBlur);
		this.hasHoverPointer = false;
		this.reset();
	}
}
