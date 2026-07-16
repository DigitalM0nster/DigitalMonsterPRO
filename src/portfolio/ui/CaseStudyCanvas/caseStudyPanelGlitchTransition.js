import {
	CASE_STUDY_LEFT_SOUND_PAN,
	fadeOutSound,
	playSound,
} from "@/sounds/soundDesign.js";
import {
	preloadCaseStudyTextTransitionSound,
	resetCaseStudyTextTransitionSound,
	suppressCaseStudyTextTransitionSound,
	updateCaseStudyTextTransitionSound,
} from "@/sounds/caseStudyTextTransitionSound.js";

export const CASE_STUDY_PANEL_GLITCH_MS = 720;
const STRIP_COUNT = 22;

function clamp01(value) {
	return Math.max(0, Math.min(1, value));
}

function easeInOut(t) {
	return t * t * (3 - 2 * t);
}

function noise(seed) {
	return Math.sin(seed * 12.9898) * 43758.5453 % 1;
}

function traceHexagon(ctx, cx, cy, radius) {
	ctx.beginPath();
	for (let index = 0; index < 6; index += 1) {
		const angle = Math.PI / 3 * index;
		const x = cx + Math.cos(angle) * radius;
		const y = cy + Math.sin(angle) * radius;
		if (index === 0) {
			ctx.moveTo(x, y);
		} else {
			ctx.lineTo(x, y);
		}
	}
	ctx.closePath();
}

export function drawCaseStudyPanelHexExit(canvas, sourceCanvas, bounds, progress) {
	if (!canvas || !sourceCanvas || !bounds) {
		return;
	}

	const p = clamp01(progress);
	const ctx = canvas.getContext("2d");
	if (!ctx) {
		return;
	}

	const x0 = Math.max(0, Math.floor(bounds.x));
	const y0 = Math.max(0, Math.floor(bounds.y));
	const width = Math.min(canvas.width - x0, Math.ceil(bounds.width));
	const height = Math.min(canvas.height - y0, Math.ceil(bounds.height));
	const radius = Math.max(18, Math.min(42, width / 12));
	const stepX = radius * 1.5;
	const stepY = radius * Math.sqrt(3);

	ctx.save();
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.clearRect(0, 0, canvas.width, canvas.height);

	for (let row = -1; row <= Math.ceil(height / stepY) + 1; row += 1) {
		const cy = y0 + row * stepY;
		const rowOffset = row % 2 === 0 ? 0 : stepX * 0.5;
		for (let column = -1; column <= Math.ceil(width / stepX) + 1; column += 1) {
			const cx = x0 + column * stepX + rowOffset;
			const normalizedY = clamp01((cy - y0) / Math.max(1, height));
			const jitter = Math.abs(noise(row * 91.7 + column * 37.1)) * 0.16;
			const threshold = normalizedY * 0.65 + jitter * 0.6;
			const localProgress = clamp01((p - threshold) / 0.25);
			const alpha = 1 - localProgress;
			if (alpha <= 0.001) {
				continue;
			}

			const scale = 1 + localProgress * 0.7;
			const shiftX = noise(row * 17.9 + column * 53.3) * radius * localProgress;
			const shiftY = -radius * localProgress * (0.35 + jitter);

			ctx.save();
			traceHexagon(ctx, cx, cy, radius * 0.98);
			ctx.clip();
			ctx.globalAlpha = alpha;
			ctx.translate(cx + shiftX, cy + shiftY);
			ctx.scale(scale, scale);
			ctx.translate(-cx, -cy);
			ctx.drawImage(sourceCanvas, 0, 0);
			ctx.restore();
		}
	}
	ctx.restore();
}

function drawGlitchLayer(ctx, source, progress, mode, frame, destinationX = 0, destinationY = 0) {
	const p = easeInOut(clamp01(progress));
	const alpha = mode === "appear" ? p : 1 - p;
	const glitch = Math.sin(p * Math.PI);
	const width = source.width;
	const height = source.height;

	if (alpha > 0.001) {
		ctx.save();
		ctx.globalAlpha = alpha;
		ctx.drawImage(source, destinationX, destinationY);
		ctx.restore();
	}

	if (glitch <= 0.01) {
		return;
	}

	const stripH = Math.max(1, Math.ceil(height / STRIP_COUNT));
	for (let index = 0; index < STRIP_COUNT; index += 1) {
		const chance = Math.abs(noise(index * 17.3 + frame * 0.07));
		if (chance < 0.48) {
			continue;
		}

		const y = index * stripH;
		const offset = noise(index * 31.7 + frame * 0.11) * 18 * glitch;
		ctx.save();
		ctx.globalAlpha = Math.min(1, alpha + 0.3) * glitch;
		ctx.shadowColor = `rgba(0, 217, 214, ${0.65 * glitch})`;
		ctx.shadowBlur = 4 * glitch;
		ctx.drawImage(
			source,
			0,
			y,
			width,
			stripH,
			destinationX + offset,
			destinationY + y,
			width,
			stripH,
		);
		ctx.restore();
	}
}

export function applyCaseStudyPanelStageGlitch(canvas, scratchCanvas, bounds, progress, config = {}) {
	if (!canvas || !scratchCanvas || !bounds) {
		return;
	}

	const mosaicProgress = clamp01(progress);
	if (mosaicProgress <= 0.001) {
		return;
	}

	const sx = Math.max(0, Math.floor(bounds.x));
	const sy = Math.max(0, Math.floor(bounds.y));
	const sw = Math.min(canvas.width - sx, Math.max(1, Math.ceil(bounds.width)));
	const sh = Math.min(canvas.height - sy, Math.max(1, Math.ceil(bounds.height)));
	if (sw <= 0 || sh <= 0) {
		return;
	}

	if (scratchCanvas.width !== sw || scratchCanvas.height !== sh) {
		scratchCanvas.width = sw;
		scratchCanvas.height = sh;
	}

	const scratchCtx = scratchCanvas.getContext("2d");
	const ctx = canvas.getContext("2d");
	if (!scratchCtx || !ctx) {
		return;
	}

	scratchCtx.setTransform(1, 0, 0, 1, 0, 0);
	scratchCtx.clearRect(0, 0, sw, sh);
	scratchCtx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);

	ctx.save();
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.clearRect(sx, sy, sw, sh);
	ctx.globalAlpha = 1 - mosaicProgress;

	const columns = Math.max(1, Math.round(config.mosaicColumns ?? 10));
	const rows = Math.max(1, Math.round(config.mosaicRows ?? 18));
	const liftStrength = Math.max(0, config.mosaicLiftStrength ?? 1);
	const randomLift = Math.max(0, config.mosaicRandomLift ?? 120);
	const scatterX = Math.max(0, config.mosaicScatterX ?? 28);
	const maxDelay = clamp01(config.mosaicDelay ?? 0.32);
	const tileW = Math.ceil(sw / columns);
	const tileH = Math.ceil(sh / rows);

	for (let row = 0; row < rows; row += 1) {
		for (let column = 0; column < columns; column += 1) {
			const tileX = column * tileW;
			const tileY = row * tileH;
			const width = Math.min(tileW, sw - tileX);
			const height = Math.min(tileH, sh - tileY);
			if (width <= 0 || height <= 0) {
				continue;
			}

			const seed = row * columns + column;
			const randomA = Math.abs(noise(seed * 7.13 + 3.7));
			const randomB = noise(seed * 11.91 + 9.2);
			const randomC = Math.abs(noise(seed * 19.37 + 5.4));
			const delay = randomA * maxDelay;
			const localProgress = easeInOut(clamp01((mosaicProgress - delay) / (1 - delay)));
			const travelY = (sh + tileH) * liftStrength + randomC * randomLift;
			const offsetY = -travelY * localProgress;
			const offsetX = randomB * scatterX * localProgress;

			ctx.drawImage(
				scratchCanvas,
				tileX,
				tileY,
				width,
				height,
				sx + tileX + offsetX,
				sy + tileY + offsetY,
				width,
				height,
			);
		}
	}
	ctx.restore();
}

export function createCanvasSnapshot(sourceCanvas) {
	if (!sourceCanvas?.width || !sourceCanvas?.height) {
		return null;
	}

	const snapshot = document.createElement("canvas");
	snapshot.width = sourceCanvas.width;
	snapshot.height = sourceCanvas.height;
	snapshot.getContext("2d")?.drawImage(sourceCanvas, 0, 0);
	return snapshot;
}

export function captureCaseStudyPanelRegion(sourceCanvas, targetCanvas, bounds) {
	if (!sourceCanvas || !targetCanvas || !bounds) {
		return null;
	}

	const sx = Math.max(0, Math.floor(bounds.x));
	const sy = Math.max(0, Math.floor(bounds.y));
	const sw = Math.min(sourceCanvas.width - sx, Math.max(1, Math.ceil(bounds.width)));
	const sh = Math.min(sourceCanvas.height - sy, Math.max(1, Math.ceil(bounds.height)));
	if (sw <= 0 || sh <= 0) {
		return null;
	}

	if (targetCanvas.width !== sw || targetCanvas.height !== sh) {
		targetCanvas.width = sw;
		targetCanvas.height = sh;
	}

	const ctx = targetCanvas.getContext("2d");
	ctx?.setTransform(1, 0, 0, 1, 0, 0);
	ctx?.clearRect(0, 0, sw, sh);
	ctx?.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
	return { x: sx, y: sy, width: sw, height: sh };
}

export function drawCaseStudyPanelMosaicMix(canvas, fromCanvas, toCanvas, bounds, progress, config = {}) {
	if (!canvas || !fromCanvas || !toCanvas || !bounds) {
		return;
	}

	const p = clamp01(progress);
	if (p <= 0.0001) {
		return;
	}

	const columns = Math.max(1, Math.round(config.mosaicColumns ?? 10));
	const rows = Math.max(1, Math.round(config.mosaicRows ?? 18));
	const liftStrength = Math.max(0, config.mosaicLiftStrength ?? 1);
	const scatterX = Math.max(0, config.mosaicScatterX ?? 28);
	const randomLift = Math.max(0, config.mosaicRandomLift ?? 120);
	const maxDelay = clamp01(config.mosaicDelay ?? 0.32);
	const sw = fromCanvas.width;
	const sh = fromCanvas.height;
	const tileW = Math.ceil(sw / columns);
	const tileH = Math.ceil(sh / rows);
	const ctx = canvas.getContext("2d");
	if (!ctx) {
		return;
	}

	ctx.save();
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.clearRect(bounds.x, bounds.y, sw, sh);

	for (let row = 0; row < rows; row += 1) {
		for (let column = 0; column < columns; column += 1) {
			const tileX = column * tileW;
			const tileY = row * tileH;
			const width = Math.min(tileW, sw - tileX);
			const height = Math.min(tileH, sh - tileY);
			if (width <= 0 || height <= 0) {
				continue;
			}

			const seed = row * columns + column;
			const randomA = Math.abs(noise(seed * 7.13 + 3.7));
			const randomB = noise(seed * 11.91 + 9.2);
			const randomC = Math.abs(noise(seed * 19.37 + 5.4));
			const delay = randomA * maxDelay;
			const delayedProgress = clamp01((p - delay) / (1 - delay));
			const localProgress = clamp01(p * 0.15 + delayedProgress * 0.85);
			const remaining = 1 - localProgress;
			const travel = (sh + tileH) * liftStrength + randomC * randomLift;
			const scatter = randomB * scatterX;

			ctx.globalAlpha = 1 - localProgress;
			ctx.drawImage(
				fromCanvas,
				tileX,
				tileY,
				width,
				height,
				bounds.x + tileX + scatter * localProgress,
				bounds.y + tileY - travel * localProgress,
				width,
				height,
			);

			ctx.globalAlpha = localProgress;
			ctx.drawImage(
				toCanvas,
				tileX,
				tileY,
				width,
				height,
				bounds.x + tileX - scatter * remaining,
				bounds.y + tileY + travel * remaining,
				width,
				height,
			);
		}
	}
	ctx.restore();
}

export function playCaseStudyPanelMosaicEnter(canvas, sourceCanvas, bounds, config = {}, onComplete) {
	if (!canvas || !sourceCanvas || !bounds) {
		onComplete?.();
		return () => {};
	}

	const sx = Math.max(0, Math.floor(bounds.x));
	const sy = Math.max(0, Math.floor(bounds.y));
	const sw = Math.min(canvas.width - sx, Math.max(1, Math.ceil(bounds.width)));
	const sh = Math.min(canvas.height - sy, Math.max(1, Math.ceil(bounds.height)));
	const columns = Math.max(1, Math.round(config.mosaicColumns ?? 10));
	const rows = Math.max(1, Math.round(config.mosaicRows ?? 18));
	const liftStrength = Math.max(0, config.mosaicLiftStrength ?? 1);
	const scatterX = Math.max(0, config.mosaicScatterX ?? 28);
	const randomLift = Math.max(0, config.mosaicRandomLift ?? 120);
	const maxDelay = clamp01(config.mosaicDelay ?? 0.32);
	const tileW = Math.ceil(sw / columns);
	const tileH = Math.ceil(sh / rows);
	const ctx = canvas.getContext("2d");
	let rafId = 0;
	let cancelled = false;
	const startedAt = performance.now();

	const frame = (now) => {
		if (cancelled || !ctx) {
			return;
		}

		const progress = clamp01((now - startedAt) / CASE_STUDY_PANEL_GLITCH_MS);
		ctx.save();
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		ctx.globalAlpha = progress;

		for (let row = 0; row < rows; row += 1) {
			for (let column = 0; column < columns; column += 1) {
				const tileX = column * tileW;
				const tileY = row * tileH;
				const width = Math.min(tileW, sw - tileX);
				const height = Math.min(tileH, sh - tileY);
				if (width <= 0 || height <= 0) {
					continue;
				}

				const seed = row * columns + column;
				const randomA = Math.abs(noise(seed * 7.13 + 3.7));
				const randomB = noise(seed * 11.91 + 9.2);
				const randomC = Math.abs(noise(seed * 19.37 + 5.4));
				const delay = randomA * maxDelay;
				const localProgress = easeInOut(clamp01((progress - delay) / (1 - delay)));
				const remaining = 1 - localProgress;
				const offsetY = ((sh + tileH) * liftStrength + randomC * randomLift) * remaining;
				const offsetX = randomB * scatterX * remaining;

				ctx.drawImage(
					sourceCanvas,
					sx + tileX,
					sy + tileY,
					width,
					height,
					sx + tileX + offsetX,
					sy + tileY + offsetY,
					width,
					height,
				);
			}
		}
		ctx.restore();

		if (progress < 1) {
			rafId = requestAnimationFrame(frame);
			return;
		}
		onComplete?.();
	};

	rafId = requestAnimationFrame(frame);
	return () => {
		cancelled = true;
		if (rafId) {
			cancelAnimationFrame(rafId);
		}
	};
}

export function playCaseStudyPanelMosaicTransition(
	canvas,
	fromCanvas,
	toCanvas,
	bounds,
	config = {},
	direction = "forward",
	onComplete,
) {
	if (!canvas || !fromCanvas || !toCanvas || !bounds) {
		onComplete?.();
		return () => {};
	}

	const sx = Math.max(0, Math.floor(bounds.x));
	const sy = Math.max(0, Math.floor(bounds.y));
	const sw = Math.min(canvas.width - sx, Math.max(1, Math.ceil(bounds.width)));
	const sh = Math.min(canvas.height - sy, Math.max(1, Math.ceil(bounds.height)));
	const columns = Math.max(1, Math.round(config.mosaicColumns ?? 10));
	const rows = Math.max(1, Math.round(config.mosaicRows ?? 18));
	const liftStrength = Math.max(0, config.mosaicLiftStrength ?? 1);
	const scatterX = Math.max(0, config.mosaicScatterX ?? 28);
	const randomLift = Math.max(0, config.mosaicRandomLift ?? 120);
	const maxDelay = clamp01(config.mosaicDelay ?? 0.32);
	const tileW = Math.ceil(sw / columns);
	const tileH = Math.ceil(sh / rows);
	const travelSign = direction === "backward" ? 1 : -1;
	const ctx = canvas.getContext("2d");
	let rafId = 0;
	let cancelled = false;
	const startedAt = performance.now();
	let lastSoundTs = startedAt;
	let lastSoundProgress = 0;
	void preloadCaseStudyTextTransitionSound();

	const frame = (now) => {
		if (cancelled || !ctx) {
			return;
		}

		const progress = clamp01((now - startedAt) / CASE_STUDY_PANEL_GLITCH_MS);
		const soundDelta = Math.max(0, (now - lastSoundTs) / 1000);
		updateCaseStudyTextTransitionSound(soundDelta, progress);
		lastSoundTs = now;
		lastSoundProgress = progress;
		ctx.save();
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.clearRect(0, 0, canvas.width, canvas.height);

		for (let row = 0; row < rows; row += 1) {
			for (let column = 0; column < columns; column += 1) {
				const tileX = column * tileW;
				const tileY = row * tileH;
				const width = Math.min(tileW, sw - tileX);
				const height = Math.min(tileH, sh - tileY);
				if (width <= 0 || height <= 0) {
					continue;
				}

				const seed = row * columns + column;
				const randomA = Math.abs(noise(seed * 7.13 + 3.7));
				const randomB = noise(seed * 11.91 + 9.2);
				const randomC = Math.abs(noise(seed * 19.37 + 5.4));
				const delay = randomA * maxDelay;
				const localProgress = easeInOut(clamp01((progress - delay) / (1 - delay)));
				const remaining = 1 - localProgress;
				const travel = (sh + tileH) * liftStrength + randomC * randomLift;
				const scatter = randomB * scatterX;

				ctx.save();
				ctx.globalAlpha = 1 - localProgress;
				ctx.drawImage(
					fromCanvas,
					sx + tileX,
					sy + tileY,
					width,
					height,
					sx + tileX + scatter * localProgress,
					sy + tileY + travelSign * travel * localProgress,
					width,
					height,
				);
				ctx.restore();

				ctx.save();
				ctx.globalAlpha = localProgress;
				ctx.drawImage(
					toCanvas,
					sx + tileX,
					sy + tileY,
					width,
					height,
					sx + tileX - scatter * remaining,
					sy + tileY - travelSign * travel * remaining,
					width,
					height,
				);
				ctx.restore();
			}
		}
		ctx.restore();

		if (progress < 1) {
			rafId = requestAnimationFrame(frame);
			return;
		}
		resetCaseStudyTextTransitionSound();
		onComplete?.();
	};

	rafId = requestAnimationFrame(frame);
	return () => {
		cancelled = true;
		if (rafId) {
			cancelAnimationFrame(rafId);
		}
		if (lastSoundProgress < 0.999) {
			resetCaseStudyTextTransitionSound();
		}
	};
}

export function playCaseStudyPanelGlitch(canvas, fromCanvas, toCanvas, onComplete) {
	if (!canvas || !fromCanvas || !toCanvas) {
		onComplete?.();
		return () => {};
	}

	let rafId = 0;
	let cancelled = false;
	const startedAt = performance.now();
	const ctx = canvas.getContext("2d");
	fadeOutSound("portfolio_leave", 80);
	suppressCaseStudyTextTransitionSound(CASE_STUDY_PANEL_GLITCH_MS + 300);
	playSound("glitch_button", CASE_STUDY_LEFT_SOUND_PAN);

	const frame = (now) => {
		if (cancelled || !ctx) {
			return;
		}

		const t = clamp01((now - startedAt) / CASE_STUDY_PANEL_GLITCH_MS);
		ctx.save();
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		drawGlitchLayer(ctx, fromCanvas, clamp01(t / 0.55), "disappear", now);
		drawGlitchLayer(ctx, toCanvas, clamp01((t - 0.32) / 0.68), "appear", now + 97);
		ctx.restore();

		if (t < 1) {
			rafId = requestAnimationFrame(frame);
			return;
		}

		onComplete?.();
	};

	rafId = requestAnimationFrame(frame);
	return () => {
		cancelled = true;
		if (rafId) {
			cancelAnimationFrame(rafId);
		}
	};
}
