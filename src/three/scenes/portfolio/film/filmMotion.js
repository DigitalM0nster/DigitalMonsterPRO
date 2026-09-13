import { applyLocalSegmentTargetRest, chaseSegmentValue, getAbsChaseSmoothMul } from "../../../render/transition/segmentScrollSpring.js";
import { fitFilmPresentation } from "./filmResponsiveFit.js";
import { resolveFilmPresentation } from "@/pages/portfolio/filmPresentationLayout.js";

export const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

/** Project controls animate one prepared pair at a time; scrolling belongs to site navigation. */
export class FilmMotion {
	constructor(count) {
		this.count = count;
		this.index = 0;
		this.destination = 0;
		this.progress = 0;
		this.target = 0;
		this.requestedIndex = null;
		this.requestedDirection = 0;
		this.info = false;
		this.destinationInfo = false;
		this.requestedInfo = null;
	}
	get busy() { return this.target !== 0 || this.progress !== 0; }
	get selectionIndex() { return this.requestedIndex ?? this.index; }
	get selectionInfo() { return this.requestedInfo ?? this.info; }
	showInfo(open) {
		this.requestedIndex = this.selectionIndex;
		this.requestedInfo = !!open;
		this.requestedDirection = open ? 1 : -1;
		if (!this.busy) this.continueSelection();
	}
	select(index, direction = 0) {
		if (!Number.isInteger(index) || index < 0 || index >= this.count) return false;
		this.requestedIndex = index;
		this.requestedInfo = this.selectionInfo;
		this.requestedDirection = Math.sign(direction);
		if (!this.busy) this.continueSelection();
		return true;
	}
	step(direction) {
		const base = this.requestedIndex ?? (this.busy ? this.destination : this.index);
		return this.select((base + Math.sign(direction) + this.count) % this.count, direction);
	}
	continueSelection() {
		if (this.requestedIndex === null) return;
		if (this.requestedIndex === this.index && this.requestedInfo === this.info) {
			this.requestedIndex = null;
			this.requestedInfo = null;
			this.requestedDirection = 0;
			return;
		}
		// Only retarget at rest: the two textures of a running mix remain unchanged.
		this.destination = this.requestedIndex;
		this.destinationInfo = this.requestedInfo;
		this.target = this.requestedDirection || Math.sign(this.destination - this.index) || (this.destinationInfo ? 1 : -1);
	}
	update(delta) {
		const dt = Math.min(delta, 0.05);
		this.target = applyLocalSegmentTargetRest(this.target, dt);
		this.progress = chaseSegmentValue(this.progress, this.target, dt, { smooth: 7, chaseMul: getAbsChaseSmoothMul(Math.abs(this.progress)) });
		if (Math.abs(this.progress) > 0.9995 && Math.abs(this.target) > 0.9995) {
			this.index = this.destination;
			this.info = this.destinationInfo;
			this.progress = this.target = 0;
		} else if (this.target === 0 && Math.abs(this.progress) < 0.00005) {
			this.progress = 0;
			this.destination = this.index;
			this.destinationInfo = this.info;
		}
		if (!this.busy) this.continueSelection();
	}
}

export function getFilmLayout(aspect, viewportWidth = 1920, viewportHeight = 1080) {
	const viewHeight = 2 * Math.tan(20 * Math.PI / 180) * 10;
	const viewWidth = viewHeight * aspect;
	const presentation = resolveFilmPresentation(viewportWidth, viewportHeight);
	const mobile = Boolean(presentation);
	if (mobile) {
		const box = presentation.screen;
		const width = viewHeight * (box.right - box.left) / viewportHeight;
		const layout = { mobile, landscape: presentation.landscape, compact: true, compositionScale: .96, viewWidth,
			width, height: width / 2.05, x: viewWidth * ((box.left + box.right) / 2 / viewportWidth - .5) / .96,
			y: viewHeight * (.5 - (box.top + box.bottom) / 2 / viewportHeight) / .96 };
		return fitFilmPresentation(layout, viewportWidth, viewportHeight, box);
	}
	const compact = aspect < 1.15;
	const width = compact ? Math.max(1.5, viewWidth - 0.65) : Math.min(9.4, viewWidth - 4.55);
	const layout = { mobile, compact, compositionScale: compact ? .96 : .92, viewWidth, width, height: width / 2.05, x: compact ? 0 : 0.10, y: compact ? 0.8 : 0.1 };
	return viewportHeight <= 600 ? fitFilmPresentation(layout, viewportWidth, viewportHeight,
		{ left: 120, right: viewportWidth - 96, top: 64, bottom: viewportHeight - 30 }) : layout;
}
