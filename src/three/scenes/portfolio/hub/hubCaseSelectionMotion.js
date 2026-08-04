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
		phase: "idle",
		activeIndex: -1,
		startedAt: 0,
		progress: 0,
		returnFromProgress: 1,
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
	const spacing = config.plateColumnSpacing ?? config.plateSpacing ?? 2.25;
	const siblingScale = config.siblingScale ?? 0.74;
	const activeScale = config.activeScale ?? siblingScale;
	const count = projectPlates.length;

	state.active = true;
	state.phase = "entering";
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
			fromAspectProgress: plate.mesh.morphTargetInfluences?.[0] ?? 0,
			toX: resolvedTarget?.x ?? anchor.x,
			toY: resolvedTarget?.y ?? anchor.y - offset * spacing,
			toZ: resolvedTarget?.z ?? anchor.z,
			toScaleX: offset === 0 ? activeScale : siblingScale,
			toScaleY: offset === 0 ? activeScale : siblingScale,
			toScaleZ: offset === 0 ? activeScale : siblingScale,
			toAspectProgress: 1,
		};
	});

	return true;
}

/**
 * Cold case routes must not expose the ordinary portfolio grid for one frame.
 * Keep the warmed meshes, but place every project plate at its already resolved
 * case-column target before the loader curtain opens. The regular selection
 * progress may then be reused purely as an appearance/reveal clock.
 */
export function prepositionHubCaseSelectionAtTarget(state) {
	if (!state.active || state.entries.length === 0) {
		return false;
	}

	for (const entry of state.entries) {
		const mesh = entry.plate.mesh;
		mesh.position.set(entry.toX, entry.toY, entry.toZ);
		mesh.scale.set(entry.toScaleX, entry.toScaleY, entry.toScaleZ);
		if (mesh.morphTargetInfluences) {
			mesh.morphTargetInfluences[0] = entry.toAspectProgress;
		}

		entry.fromX = entry.toX;
		entry.fromY = entry.toY;
		entry.fromZ = entry.toZ;
		entry.fromScaleX = entry.toScaleX;
		entry.fromScaleY = entry.toScaleY;
		entry.fromScaleZ = entry.toScaleZ;
		entry.fromAspectProgress = entry.toAspectProgress;
	}

	state.phase = "entering";
	state.startedAt = 0;
	state.progress = 0;
	return true;
}

/** Re-index an already selected column without rebuilding or replaying its enter. */
export function retargetHubCaseSelection(
	state,
	activeIndex,
	config = {},
	resolveTargetPosition = null,
) {
	if (!state.active || state.phase === "returning" || activeIndex < 0 || state.entries.length === 0) {
		return false;
	}

	const count = state.entries.length;
	const spacing = config.plateColumnSpacing ?? config.plateSpacing ?? 2.25;
	const activeEntry = state.entries.find((entry) => entry.plate.projectIndex === activeIndex);
	if (!activeEntry) {
		return false;
	}
	const anchor = activeEntry.plate.mesh.position;
	state.activeIndex = activeIndex;
	state.phase = "selected";

	for (const entry of state.entries) {
		const offset = getSignedCircularOffset(entry.plate.projectIndex, activeIndex, count);
		const resolvedTarget = resolveTargetPosition?.(entry.plate, offset) ?? null;
		entry.offset = offset;
		entry.toX = resolvedTarget?.x ?? anchor.x;
		entry.toY = resolvedTarget?.y ?? anchor.y - offset * spacing;
		entry.toZ = resolvedTarget?.z ?? anchor.z;
		entry.fromX = entry.toX;
		entry.fromY = entry.toY;
		entry.fromZ = entry.toZ;
		entry.plate.mesh.position.set(entry.toX, entry.toY, entry.toZ);
	}
	return true;
}

/** Drag the prepared vertical column; positive progress brings the next plate up. */
export function applyHubCaseColumnProgress(state, progress, config = {}) {
	if (!state.active || state.phase !== "selected") {
		return false;
	}
	const spacing = config.plateColumnSpacing ?? config.plateSpacing ?? 2.25;
	const shiftY = Math.max(-1.5, Math.min(1.5, Number(progress) || 0)) * spacing;
	for (const entry of state.entries) {
		entry.plate.mesh.position.set(entry.toX, entry.toY + shiftY, entry.toZ);
	}
	return true;
}

/**
 * Reverse the selected-case column into the ordinary focused hub grid. Targets are
 * resolved from the immutable plate layout, so the camera never has to chase a
 * project through world space during the return.
 */
export function beginHubCaseReturn(
	state,
	plates,
	nowSeconds,
	resolveTargetPosition = null,
) {
	if (!state.active || state.activeIndex < 0 || state.phase === "returning") {
		return false;
	}

	const projectPlates = plates
		.filter((plate) => plate.projectIndex >= 0 && plate.mesh)
		.sort((a, b) => a.projectIndex - b.projectIndex);
	if (projectPlates.length === 0) {
		return false;
	}

	const count = projectPlates.length;
	state.phase = "returning";
	state.startedAt = nowSeconds;
	state.returnFromProgress = clamp01(state.progress);
	state.entries = projectPlates.map((plate) => {
		const mesh = plate.mesh;
		const offset = getSignedCircularOffset(plate.projectIndex, state.activeIndex, count);
		const resolvedTarget = resolveTargetPosition?.(plate, offset) ?? null;
		const fallback = plate.basePosition ?? [mesh.position.x, mesh.position.y, mesh.position.z];
		return {
			plate,
			offset,
			fromX: mesh.position.x,
			fromY: mesh.position.y,
			fromZ: mesh.position.z,
			fromScaleX: mesh.scale.x,
			fromScaleY: mesh.scale.y,
			fromScaleZ: mesh.scale.z,
			fromAspectProgress: mesh.morphTargetInfluences?.[0] ?? 1,
			toX: resolvedTarget?.x ?? fallback[0],
			toY: resolvedTarget?.y ?? fallback[1],
			toZ: resolvedTarget?.z ?? fallback[2],
			toScaleX: 1,
			toScaleY: 1,
			toScaleZ: 1,
			toAspectProgress: 0,
		};
	});

	return true;
}

export function advanceHubCaseSelection(state, nowSeconds, config = {}) {
	if (!state.active) {
		return { active: false, changed: false, linearProgress: 0, progress: 0, finished: false };
	}

	const returning = state.phase === "returning";
	const durationMs = returning ? (config.returnDurationMs ?? config.durationMs) : config.durationMs;
	const staggerMs = returning ? (config.returnStaggerMs ?? config.staggerMs) : config.staggerMs;
	const duration = Math.max((durationMs ?? 1350) / 1000, 0.001);
	const stagger = Math.max((staggerMs ?? 45) / 1000, 0);
	const aspectStartFraction = clamp01(config.contentExitFraction ?? 0.32);
	const aspectEndFraction = Math.max(
		aspectStartFraction + 0.001,
		clamp01(config.aspectEndFraction ?? 1),
	);
	const elapsed = Math.max(0, nowSeconds - state.startedAt);
	let allFinished = true;

	for (const entry of state.entries) {
		const delay = Math.abs(entry.offset) * stagger;
		const localDuration = Math.max(duration - delay, duration * 0.55);
		const linear = clamp01((elapsed - delay) / localDuration);
		const eased = smootherStep(linear);
		const aspectLinear = clamp01((linear - aspectStartFraction) / (aspectEndFraction - aspectStartFraction));
		const aspectProgress = smootherStep(aspectLinear);
		const mesh = entry.plate.mesh;

		mesh.position.set(
			entry.fromX + (entry.toX - entry.fromX) * eased,
			entry.fromY + (entry.toY - entry.fromY) * eased,
			entry.fromZ + (entry.toZ - entry.fromZ) * eased,
		);
		mesh.scale.set(
			entry.fromScaleX + (entry.toScaleX - entry.fromScaleX) * eased,
			entry.fromScaleY + (entry.toScaleY - entry.fromScaleY) * eased,
			entry.fromScaleZ + (entry.toScaleZ - entry.fromScaleZ) * eased,
		);
		if (mesh.morphTargetInfluences) {
			mesh.morphTargetInfluences[0] = entry.fromAspectProgress +
				(entry.toAspectProgress - entry.fromAspectProgress) * aspectProgress;
		}
		if (linear < 1) {
			allFinished = false;
		}
	}

	const transitionProgress = clamp01(elapsed / duration);
	state.progress = returning
		? state.returnFromProgress * (1 - smootherStep(transitionProgress))
		: transitionProgress;
	if (allFinished && !returning) {
		state.phase = "selected";
	}
	return {
		active: true,
		returning,
		changed: !allFinished,
		linearProgress: state.progress,
		progress: smootherStep(state.progress),
		transitionProgress: smootherStep(transitionProgress),
		finished: allFinished,
	};
}

export function resetHubCaseSelection(state) {
	state.active = false;
	state.phase = "idle";
	state.activeIndex = -1;
	state.startedAt = 0;
	state.progress = 0;
	state.returnFromProgress = 1;
	state.entries = [];
}
