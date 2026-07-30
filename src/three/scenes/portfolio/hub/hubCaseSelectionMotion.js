function clamp01(value) {
	return Math.max(0, Math.min(1, value));
}

function smootherStep(value) {
	const t = clamp01(value);
	return t * t * t * (t * (t * 6 - 15) + 10);
}

function getSignedCircularOffset(projectIndex, activeIndex, count) {
	const forward = (projectIndex - activeIndex + count) % count;
	const half = Math.floor(count / 2);
	return forward > half ? forward - count : forward;
}

export function createHubCaseSelectionState() {
	return {
		active: false,
		activeIndex: -1,
		startedAt: 0,
		progress: 0,
		entries: [],
	};
}

/**
 * Capture the currently painted plate transforms once, at the selection boundary.
 * The animation then reuses the already-warmed meshes and only changes transforms.
 */
export function beginHubCaseSelection(
	state,
	plates,
	activeIndex,
	nowSeconds,
	config = {},
	resolveTargetPosition = null,
) {
	const projectPlates = plates
		.filter((plate) => plate.projectIndex >= 0 && plate.mesh)
		.sort((a, b) => a.projectIndex - b.projectIndex);
	const activePlate = projectPlates.find((plate) => plate.projectIndex === activeIndex);

	if (!activePlate || projectPlates.length === 0) {
		return false;
	}

	const anchor = activePlate.mesh.position;
	const spacing = config.plateSpacing ?? 2.25;
	const siblingScale = config.siblingScale ?? 0.74;
	const activeScale = config.activeScale ?? siblingScale;
	const aspectRatio = Math.max(config.aspectRatio ?? 1, 0.001);
	const count = projectPlates.length;

	state.active = true;
	state.activeIndex = activeIndex;
	state.startedAt = nowSeconds;
	state.progress = 0;
	state.entries = projectPlates.map((plate) => {
		const offset = getSignedCircularOffset(plate.projectIndex, activeIndex, count);
		const resolvedTarget = resolveTargetPosition?.(plate, offset) ?? null;
		return {
			plate,
			offset,
			fromX: plate.mesh.position.x,
			fromY: plate.mesh.position.y,
			fromZ: plate.mesh.position.z,
			fromScaleX: plate.mesh.scale.x,
			fromScaleY: plate.mesh.scale.y,
			fromScaleZ: plate.mesh.scale.z,
			toX: resolvedTarget?.x ?? anchor.x + offset * spacing,
			toY: resolvedTarget?.y ?? anchor.y,
			toZ: resolvedTarget?.z ?? anchor.z,
			toScale: offset === 0 ? activeScale : siblingScale,
			toScaleX: (offset === 0 ? activeScale : siblingScale) * aspectRatio,
		};
	});

	return true;
}

export function advanceHubCaseSelection(state, nowSeconds, config = {}) {
	if (!state.active) {
		return { active: false, changed: false, linearProgress: 0, progress: 0, finished: false };
	}

	const duration = Math.max((config.durationMs ?? 1350) / 1000, 0.001);
	const stagger = Math.max((config.staggerMs ?? 45) / 1000, 0);
	const aspectStartFraction = clamp01(config.contentExitFraction ?? 0.32);
	const elapsed = Math.max(0, nowSeconds - state.startedAt);
	let allFinished = true;

	for (const entry of state.entries) {
		const delay = Math.abs(entry.offset) * stagger;
		const localDuration = Math.max(duration - delay, duration * 0.55);
		const linear = clamp01((elapsed - delay) / localDuration);
		const eased = smootherStep(linear);
		const aspectLinear = clamp01((linear - aspectStartFraction) / Math.max(1 - aspectStartFraction, 0.001));
		const aspectProgress = smootherStep(aspectLinear);
		const mesh = entry.plate.mesh;
		const uniformScaleX = entry.fromScaleX + (entry.toScale - entry.fromScaleX) * eased;

		mesh.position.set(
			entry.fromX + (entry.toX - entry.fromX) * eased,
			entry.fromY + (entry.toY - entry.fromY) * eased,
			entry.fromZ + (entry.toZ - entry.fromZ) * eased,
		);
		mesh.scale.set(
			uniformScaleX + (entry.toScaleX - entry.toScale) * aspectProgress,
			entry.fromScaleY + (entry.toScale - entry.fromScaleY) * eased,
			entry.fromScaleZ + (entry.toScale - entry.fromScaleZ) * eased,
		);
		if (linear < 1) {
			allFinished = false;
		}
	}

	state.progress = clamp01(elapsed / duration);
	return {
		active: true,
		changed: !allFinished,
		linearProgress: state.progress,
		progress: smootherStep(state.progress),
		finished: allFinished,
	};
}

export function resetHubCaseSelection(state) {
	state.active = false;
	state.activeIndex = -1;
	state.startedAt = 0;
	state.progress = 0;
	state.entries = [];
}
