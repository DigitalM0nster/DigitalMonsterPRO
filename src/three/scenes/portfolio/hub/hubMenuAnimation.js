/**
 * Анимация хаба: сетка → карточка (30% сетки) → логотип (30% карточки).
 * Per-project состояние для прерываний и retarget.
 */

export function clamp01(value) {
	return Math.max(0, Math.min(1, value));
}

export function easeInOutCubic(t) {
	const x = clamp01(t);
	return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

function createChannel(value = 0) {
	return {
		value,
		mode: "idle",
		startedAt: 0,
		fromValue: 0,
		fromPartLinear: 0,
		pausedAt: 0,
		pausedLinear: 0,
		partLinear: 0,
	};
}

export function createHubAnimState() {
	return {
		targetIndex: -1,
		gridY: 0,
		gridZ: 0,
		gridFromY: 0,
		gridFromZ: 0,
		gridToY: 0,
		gridToZ: 0,
		gridStartedAt: 0,
		projects: new Map(),
		/** Кэш последнего кадра per-project (после tick). */
		_lastTick: new Map(),
	};
}

function getProjectState(state, projectIndex) {
	if (!state.projects.has(projectIndex)) {
		state.projects.set(projectIndex, {
			plate: createChannel(0),
			logoAppear: createChannel(0),
			logoExit: createChannel(0),
		});
	}
	return state.projects.get(projectIndex);
}

function getGridLinear(state, now, timing) {
	const duration = Math.max(timing.gridSlideDuration ?? 0.75, 0.001);
	return clamp01((now - state.gridStartedAt) / duration);
}

function getPlateLinear(channel, now, timing) {
	if (channel.mode === "idle") {
		return channel.value;
	}
	const duration = Math.max(timing.plateSlideDuration ?? 0.5, 0.001);
	const t = clamp01((now - channel.startedAt) / duration);
	if (channel.mode === "open") {
		return channel.fromValue + (1 - channel.fromValue) * easeInOutCubic(t);
	}
	if (channel.mode === "close") {
		return channel.fromValue * (1 - easeInOutCubic(t));
	}
	return channel.value;
}

function getPlateAnimLinear(channel, now, timing) {
	if (channel.mode === "idle") {
		return channel.value >= 1 ? 1 : 0;
	}
	return clamp01((now - channel.startedAt) / Math.max(timing.plateSlideDuration ?? 0.5, 0.001));
}

function getLogoAppearDuration(timing) {
	return Math.max(timing.logoAppearDuration ?? timing.logoFadeDuration ?? 0.5, 0.001);
}

function getLogoAppearLinear(channel, now, timing) {
	if (channel.mode === "idle") {
		return channel.value;
	}
	if (channel.mode === "paused") {
		return channel.pausedAt;
	}
	const duration = getLogoAppearDuration(timing);
	const t = clamp01((now - channel.startedAt) / duration);
	return channel.fromValue + (1 - channel.fromValue) * easeInOutCubic(t);
}

function getLogoExitLinear(channel, now, timing) {
	if (channel.mode === "idle") {
		return channel.value;
	}
	const duration = Math.max(timing.logoFadeDuration ?? 0.5, 0.001);
	const t = clamp01((now - channel.startedAt) / duration);
	if (channel.mode === "exit") {
		return channel.fromValue + (1 - channel.fromValue) * easeInOutCubic(t);
	}
	if (channel.mode === "reverse") {
		return channel.fromValue * (1 - easeInOutCubic(t));
	}
	return channel.value;
}

function settleChannel(channel, value) {
	channel.value = value;
	channel.mode = "idle";
	channel.fromValue = value;
	channel.pausedAt = value;
	channel.fromPartLinear = value >= 0.999 ? 1 : 0;
	channel.pausedLinear = channel.fromPartLinear;
	channel.partLinear = channel.fromPartLinear;
	channel.startedAt = 0;
}

/** Сброс логотипа проекта — до завершения appear сцены. */
function forceLogoHidden(ps) {
	settleChannel(ps.logoAppear, 0);
	settleChannel(ps.logoExit, 0);
}

function getPartRawLinear(logoAppear, now, timing) {
	if (logoAppear.mode === "paused") {
		return logoAppear.pausedLinear;
	}
	if (logoAppear.mode === "open") {
		const duration = getLogoAppearDuration(timing);
		const t = clamp01((now - logoAppear.startedAt) / duration);
		const fromPart = logoAppear.fromPartLinear ?? 0;
		return fromPart + (1 - fromPart) * t;
	}
	if (logoAppear.mode === "idle") {
		return logoAppear.partLinear ?? (logoAppear.value >= 0.999 ? 1 : 0);
	}
	return logoAppear.partLinear ?? logoAppear.pausedLinear ?? 0;
}

/** Замороженный progress кубиков: при exit/pause не меняется. */
function getFrozenPartLinear(logoAppear, logoExit, now, timing) {
	if (logoExit.mode !== "idle") {
		if (logoAppear.mode === "paused") {
			return logoAppear.pausedLinear;
		}
		return (
			logoAppear.partLinear ??
			logoAppear.pausedLinear ??
			(logoAppear.value >= 0.999 ? 1 : getPartRawLinear(logoAppear, now, timing))
		);
	}
	return getPartRawLinear(logoAppear, now, timing);
}

function startPlateOpen(plate, now, fromValue) {
	plate.mode = "open";
	plate.startedAt = now;
	plate.fromValue = fromValue;
}

function startPlateClose(plate, now, fromValue) {
	plate.mode = "close";
	plate.startedAt = now;
	plate.fromValue = fromValue;
}

/** @returns {boolean} true — свежий старт appear с нуля (не resume после паузы). */
function startLogoAppear(logo, now, fromValue, fromPartLinear = null) {
	logo.mode = "open";
	logo.startedAt = now;
	logo.fromValue = fromValue;
	logo.fromPartLinear =
		fromPartLinear ?? (fromValue >= 0.999 ? 1 : fromValue <= 0.001 ? 0 : fromValue);
	logo.pausedAt = fromValue;
	logo.pausedLinear = logo.fromPartLinear;
	return fromValue <= 0.001;
}

function pauseLogoAppear(logo, easedValue, partRawLinear) {
	logo.mode = "paused";
	logo.pausedAt = easedValue;
	logo.pausedLinear = partRawLinear;
	logo.partLinear = partRawLinear;
	logo.value = easedValue;
}

/** Пауза appear + старт exit при уходе с проекта. @returns {boolean} appear был прерван с mode "open". */
function interruptProjectLogo(ps, now, timing) {
	const { logoAppear, logoExit } = ps;

	if (logoExit.mode !== "idle") {
		return false;
	}

	if (logoAppear.mode === "open") {
		const duration = getLogoAppearDuration(timing);
		const elapsedT = clamp01((now - logoAppear.startedAt) / duration);
		const eased =
			logoAppear.fromValue +
			(1 - logoAppear.fromValue) * easeInOutCubic(elapsedT);
		const fromPart = logoAppear.fromPartLinear ?? 0;
		const partRaw = fromPart + (1 - fromPart) * elapsedT;
		pauseLogoAppear(logoAppear, eased, partRaw);
		startLogoExit(logoExit, now, logoExit.value);
		return true;
	}

	if (logoAppear.mode === "paused" && logoAppear.pausedAt > 0.001) {
		startLogoExit(logoExit, now, 0);
		return false;
	}

	// Appear полностью завершён (idle + value ≈ 1) — тоже нужен exit, не мгновенное скрытие.
	if (logoAppear.mode === "idle" && logoAppear.value > 0.001) {
		startLogoExit(logoExit, now, 0);
	}

	return false;
}

function startLogoExit(exit, now, fromValue = 0) {
	exit.mode = "exit";
	exit.startedAt = now;
	exit.fromValue = fromValue;
}

function startLogoExitReverse(exit, now, fromValue) {
	exit.mode = "reverse";
	exit.startedAt = now;
	exit.fromValue = fromValue;
}

function retargetGrid(state, gridTo, now) {
	state.gridFromY = state.gridY;
	state.gridFromZ = state.gridZ;
	state.gridToY = gridTo.y;
	state.gridToZ = gridTo.z;
	state.gridStartedAt = now;
}

function updateGridPosition(state, now, timing) {
	const linear = getGridLinear(state, now, timing);
	const eased = easeInOutCubic(linear);
	state.gridY = state.gridFromY + (state.gridToY - state.gridFromY) * eased;
	state.gridZ = state.gridFromZ + (state.gridToZ - state.gridFromZ) * eased;
	return linear;
}

function finalizePlate(plate, now, timing) {
	if (plate.mode === "open") {
		const t = clamp01((now - plate.startedAt) / Math.max(timing.plateSlideDuration, 0.001));
		if (t >= 1) {
			settleChannel(plate, 1);
		}
	} else if (plate.mode === "close") {
		const t = clamp01((now - plate.startedAt) / Math.max(timing.plateSlideDuration, 0.001));
		if (t >= 1) {
			settleChannel(plate, 0);
		}
	}
}

function finalizeLogoAppear(logo, exit, now, timing, projectIndex, targetIndex) {
	if (logo.mode !== "open") {
		return;
	}
	// Не завершать appear, если фокус уже на другом проекте или идёт exit.
	if (projectIndex !== targetIndex || exit.mode !== "idle") {
		return;
	}
	const t = clamp01((now - logo.startedAt) / getLogoAppearDuration(timing));
	if (t >= 1) {
		settleChannel(logo, 1);
	}
}

function finalizeLogoExit(exit, logoAppear, now, timing) {
	if (exit.mode === "exit") {
		const t = clamp01((now - exit.startedAt) / Math.max(timing.logoFadeDuration, 0.001));
		if (t >= 1) {
			settleChannel(exit, 0);
			settleChannel(logoAppear, 0);
		}
	} else if (exit.mode === "reverse") {
		const t = clamp01((now - exit.startedAt) / Math.max(timing.logoFadeDuration, 0.001));
		if (t >= 1) {
			settleChannel(exit, 0);
			if (logoAppear.mode === "paused") {
				startLogoAppear(
					logoAppear,
					now,
					logoAppear.pausedAt,
					logoAppear.pausedLinear,
				);
			}
		}
	}
}

/** @returns {{ logoRevealJustPaused: boolean, plateMovementJustStarted: boolean }} */
function handleTargetChange(state, prevTarget, nextTarget, now, timing) {
	if (prevTarget === nextTarget) {
		return { logoRevealJustPaused: false, plateMovementJustStarted: false };
	}

	let logoRevealJustPaused = false;
	let plateMovementJustStarted = false;

	if (prevTarget >= 0) {
		const prev = getProjectState(state, prevTarget);
		if (interruptProjectLogo(prev, now, timing)) {
			logoRevealJustPaused = true;
		}

		const plateNow = getPlateLinear(prev.plate, now, timing);
		if (prev.plate.mode === "open" || plateNow > 0.001) {
			startPlateClose(prev.plate, now, plateNow);
			plateMovementJustStarted = true;
		}
	}

	if (nextTarget >= 0) {
		const next = getProjectState(state, nextTarget);

		if (next.logoExit.mode === "exit" && next.logoExit.value > 0.001) {
			startLogoExitReverse(
				next.logoExit,
				now,
				getLogoExitLinear(next.logoExit, now, timing),
			);
		}
	}

	return { logoRevealJustPaused, plateMovementJustStarted };
}

function tickProject(state, projectIndex, targetIndex, gridLinear, now, timing, allowLogos = true) {
	const ps = getProjectState(state, projectIndex);
	const plateGate = timing.gridStartPlateFraction ?? 0.3;
	const logoGate = timing.plateStartLogoFraction ?? 0.3;
	let logoRevealJustStarted = false;
	let logoRevealJustPaused = false;
	let plateMovementJustStarted = false;

	// Если фокус ушёл, а appear ещё идёт — пауза до finalize (на случай пропуска handleTargetChange).
	if (projectIndex !== targetIndex) {
		if (interruptProjectLogo(ps, now, timing)) {
			logoRevealJustPaused = true;
		}
	}

	finalizePlate(ps.plate, now, timing);

	if (!allowLogos) {
		forceLogoHidden(ps);
	} else {
		finalizeLogoAppear(
			ps.logoAppear,
			ps.logoExit,
			now,
			timing,
			projectIndex,
			targetIndex,
		);
		finalizeLogoExit(ps.logoExit, ps.logoAppear, now, timing);
	}

	const plateValue = getPlateLinear(ps.plate, now, timing);
	const plateAnimLinear = getPlateAnimLinear(ps.plate, now, timing);
	ps.plate.value = plateValue;

	const appearLinear = allowLogos ? getLogoAppearLinear(ps.logoAppear, now, timing) : 0;
	const exitLinear = allowLogos ? getLogoExitLinear(ps.logoExit, now, timing) : 0;
	ps.logoAppear.value = appearLinear;
	ps.logoExit.value = exitLinear;

	const isTarget = projectIndex === targetIndex;
	const gridReady = gridLinear >= plateGate;

	if (isTarget && targetIndex >= 0 && gridReady) {
		if (ps.plate.mode === "idle" && ps.plate.value <= 0.001) {
			startPlateOpen(ps.plate, now, 0);
			plateMovementJustStarted = true;
		} else if (ps.plate.mode === "close") {
			startPlateOpen(ps.plate, now, plateValue);
			plateMovementJustStarted = true;
		}

		if (allowLogos) {
			const plateReady =
				(ps.plate.mode === "open" && plateAnimLinear >= logoGate) ||
				(ps.plate.mode === "idle" && ps.plate.value >= 0.999);

			if (
				plateReady &&
				ps.logoAppear.mode === "idle" &&
				ps.logoExit.value <= 0.001 &&
				ps.logoAppear.value <= 0.001
			) {
				logoRevealJustStarted = startLogoAppear(ps.logoAppear, now, 0);
			}

			if (
				plateReady &&
				ps.logoAppear.mode === "paused" &&
				ps.logoExit.value <= 0.001
			) {
				startLogoAppear(
					ps.logoAppear,
					now,
					ps.logoAppear.pausedAt,
					ps.logoAppear.pausedLinear,
				);
			}
		}
	}

	const tick = {
		plateProgress: plateValue,
		logoAppear: appearLinear,
		logoExit: exitLinear,
		logoVisible: Math.max(0, appearLinear * (1 - exitLinear)),
		plateMode: ps.plate.mode,
		logoAppearMode: ps.logoAppear.mode,
		logoExitMode: ps.logoExit.mode,
		logoRevealJustStarted,
		logoRevealJustPaused,
		plateMovementJustStarted,
	};

	state._lastTick.set(projectIndex, tick);
	return tick;
}

function pickLogoProject(state, targetIndex) {
	let bestIndex = -1;
	let bestScore = -1;

	for (const [projectIndex, tick] of state._lastTick.entries()) {
		const ps = getProjectState(state, projectIndex);
		const visible = tick.logoVisible;
		const active =
			ps.logoAppear.mode !== "idle" ||
			ps.logoExit.mode !== "idle" ||
			visible > 0.001;

		if (!active) {
			continue;
		}

		const score =
			(ps.logoExit.mode !== "idle" ? 100 : 0) +
			(projectIndex === targetIndex ? 50 : 0) +
			visible;

		if (score > bestScore) {
			bestScore = score;
			bestIndex = projectIndex;
		}
	}

	if (bestIndex >= 0) {
		return bestIndex;
	}
	return targetIndex >= 0 ? targetIndex : -1;
}

function pickActivePlateIndex(state, targetIndex) {
	if (targetIndex >= 0) {
		const tick = state._lastTick.get(targetIndex);
		if (tick && tick.plateProgress > 0.001) {
			return targetIndex;
		}
	}

	for (const [projectIndex, tick] of state._lastTick.entries()) {
		if (tick.plateProgress > 0.001) {
			return projectIndex;
		}
	}

	return targetIndex >= 0 ? targetIndex : -1;
}

/**
 * @param {ReturnType<typeof createHubAnimState>} state
 * @param {number} targetIndex
 * @param {number} now секунды
 * @param {object} timing portfolioHubPlatesConfig.interaction
 * @param {(index: number) => { y: number, z: number }} getGridSlide
 * @param {boolean} [allowLogos] — false до завершения appear сцены
 */
export function advanceHubMenuAnim(state, targetIndex, now, timing, getGridSlide, allowLogos = true) {
	const prevTarget = state.targetIndex;
	const gridTargetJustChanged = prevTarget !== targetIndex;

	let logoRevealJustPaused = false;
	let logoRevealJustStarted = false;
	let plateMovementJustStarted = false;

	if (gridTargetJustChanged) {
		const targetChange = handleTargetChange(state, prevTarget, targetIndex, now, timing);
		if (targetChange.logoRevealJustPaused) {
			logoRevealJustPaused = true;
		}
		if (targetChange.plateMovementJustStarted) {
			plateMovementJustStarted = true;
		}
		state.targetIndex = targetIndex;

		const slide = targetIndex >= 0 ? getGridSlide(targetIndex) : { y: 0, z: 0 };
		retargetGrid(state, slide, now);
	}

	const gridLinear = updateGridPosition(state, now, timing);

	const indicesToTick = new Set(state.projects.keys());
	if (targetIndex >= 0) {
		indicesToTick.add(targetIndex);
	}
	if (prevTarget >= 0 && prevTarget !== targetIndex) {
		indicesToTick.add(prevTarget);
	}

	for (const projectIndex of indicesToTick) {
		const tick = tickProject(
			state,
			projectIndex,
			targetIndex,
			gridLinear,
			now,
			timing,
			allowLogos,
		);
		if (tick.logoRevealJustStarted) {
			logoRevealJustStarted = true;
		}
		if (tick.logoRevealJustPaused) {
			logoRevealJustPaused = true;
		}
		if (tick.plateMovementJustStarted) {
			plateMovementJustStarted = true;
		}
	}

	const logoProjectIndex = pickLogoProject(state, targetIndex);
	const cardIndex = pickActivePlateIndex(state, targetIndex);

	let logoProgress = 0;
	let logoPartLinear = 0;
	let logoEntering = false;

	if (logoProjectIndex >= 0) {
		const ps = getProjectState(state, logoProjectIndex);
		const tick = state._lastTick.get(logoProjectIndex);
		logoProgress = tick?.logoVisible ?? 0;
		logoPartLinear = getFrozenPartLinear(
			ps.logoAppear,
			ps.logoExit,
			now,
			timing,
		);
		// Reverse продолжает текущий fade и обязан использовать logoProgress.
		// Иначе shader берёт frozen partLinear (часто уже 1) и alpha скачет к 1.
		logoEntering =
			ps.logoExit.mode === "idle" &&
			(ps.logoAppear.mode === "open" || ps.logoAppear.mode === "paused");
	}

	const plateProgressByProject = new Map();
	for (const [projectIndex, tick] of state._lastTick.entries()) {
		plateProgressByProject.set(projectIndex, tick.plateProgress);
	}

	return {
		gridY: state.gridY,
		gridZ: state.gridZ,
		gridLinear,
		targetIndex,
		cardIndex,
		logoProjectIndex,
		plateProgressByProject,
		plateProgress: plateProgressByProject.get(cardIndex) ?? 0,
		logoProgress,
		logoPartLinear,
		logoEntering,
		logoRevealJustStarted,
		logoRevealJustPaused,
		plateMovementJustStarted,
		gridTargetJustChanged,
	};
}

export function getPlateProgressForProject(visuals, projectIndex) {
	return visuals.plateProgressByProject.get(projectIndex) ?? 0;
}
