/** Alternate prepared scene draws, never the final hex/compositor frame.
 * Records describe the physical RTs, so a reversed/interrupted pair can reuse
 * its last source without assuming that logical source always lives in A. */
import { expandHexBandForDraw, hexBandContains } from "../render/overlay/hexVisibleBands.js";
const FULL_BAND = Object.freeze({ min: 0, max: 1 });

export class MobileHexLayers {
	constructor(draw, getState) {
		this.draw = draw;
		this.getState = getState;
		this.records = new Map();
		this.frame = 0;
		this.sourceId = null;
		this.targetId = null;
		this.drawSourceNext = false;
	}

	reset() {
		this.records.clear();
		this.sourceId = this.targetId = null;
	}

	invalidate(target) { this.records.delete(target); }

	_find(sceneId, targets, required) {
		let found = null;
		for (const target of targets) {
			const record = this.records.get(target);
			if (record?.sceneId === sceneId && record.width === target.width && record.height === target.height
				&& record.state === this.getState(sceneId) && record.frame >= this.frame - 2
				&& hexBandContains(record.band, required)
				&& (!found || record.frame > found.frame)) found = record;
		}
		return found;
	}

	_draw(sceneId, target, required = FULL_BAND) {
		const band = expandHexBandForDraw(required);
		const texture = this.draw(sceneId, target, band);
		const record = { sceneId, target, texture, width: target.width, height: target.height,
			state: this.getState(sceneId), frame: this.frame, band };
		if (texture) this.records.set(target, record);
		else this.records.delete(target);
		return record;
	}

	render(sourceId, targetId, layerTargets, skipTarget, bands) {
		this.frame++;
		const targets = [layerTargets.a, layerTargets.b];
		for (const target of this.records.keys()) if (!targets.includes(target)) this.records.delete(target);
		if (skipTarget || sourceId === targetId) {
			const source = this._draw(sourceId, targets[0]);
			this.sourceId = this.targetId = null;
			return { sourceId, targetId, sourceModels: source.texture, targetModels: source.texture };
		}

		const changed = sourceId !== this.sourceId || targetId !== this.targetId;
		const sourceBand = bands?.source ?? FULL_BAND, targetBand = bands?.target ?? FULL_BAND;
		let source = this._find(sourceId, targets, sourceBand);
		let target = this._find(targetId, targets, targetBand);
		// Preserve a valid physical source on pair changes (it may live in B).
		const sourceTarget = source?.target ?? (target?.target === targets[0] ? targets[1] : targets[0]);
		const targetTarget = sourceTarget === targets[0] ? targets[1] : targets[0];
		if (target?.target !== targetTarget) target = null;
		let drewSource = false, drewTarget = false;
		if (!source) { source = this._draw(sourceId, sourceTarget, sourceBand); drewSource = true; }
		// The first visible incoming layer must be current, not an old idle RT.
		if (!target || changed) { target = this._draw(targetId, targetTarget, targetBand); drewTarget = true; }
		if (!drewSource && !drewTarget) {
			if (this.drawSourceNext) { source = this._draw(sourceId, sourceTarget, sourceBand); drewSource = true; }
			else { target = this._draw(targetId, targetTarget, targetBand); drewTarget = true; }
		}
		this.drawSourceNext = !drewSource || drewTarget;
		this.sourceId = sourceId;
		this.targetId = targetId;
		return { sourceId, targetId, sourceModels: source.texture, targetModels: target.texture };
	}
}
