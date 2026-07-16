import { SITE_MAIN_COLOR, siteMainRgba } from "@/constants/siteMainColor.js";

/** Constant-speed pass: enter from past the right tip, exit past the left tip. */
const SNAKE_DURATION_MS = 820;
const MAX_SNAKES = 3;

/** @type {null | (() => void)} */
let repaint = null;
let raf = 0;

/**
 * @typedef {{
 *   startMs: number,
 *   progress: number,
 *   strength: number,
 * }} AllProjectsLineSnake
 */

/** @type {AllProjectsLineSnake[]} */
let snakes = [];

function scheduleRepaint() {
	repaint?.();
}

function stopRaf() {
	if (!raf) {
		return;
	}
	cancelAnimationFrame(raf);
	raf = 0;
}

/**
 * @param {number} railLen
 */
function resolveSnakeLen(railLen) {
	return Math.max(28, Math.min(railLen * 0.92, 62));
}

/**
 * @param {number} t
 */
function easeInOutCubic(t) {
	const x = Math.min(1, Math.max(0, t));
	return x < 0.5 ? 4 * x * x * x : 1 - ((-2 * x + 2) ** 3) / 2;
}

/**
 * @param {number} now
 */
function tick(now) {
	raf = 0;
	if (snakes.length === 0) {
		scheduleRepaint();
		return;
	}

	const next = [];
	for (let i = 0; i < snakes.length; i += 1) {
		const snake = snakes[i];
		const raw = Math.min(1, (now - snake.startMs) / SNAKE_DURATION_MS);
		// Soft ease — still overshoots past both tips; clip handles the cut.
		snake.progress = easeInOutCubic(raw);
		snake.strength = 0.85;
		if (raw < 1) {
			next.push(snake);
		}
	}
	snakes = next;

	scheduleRepaint();
	if (snakes.length > 0) {
		raf = requestAnimationFrame(tick);
	}
}

function ensureRaf() {
	if (raf) {
		return;
	}
	raf = requestAnimationFrame(tick);
}

/**
 * Spawn a snake on hover. Running snakes are not cancelled; caps at MAX_SNAKES
 * (oldest is dropped when spawning past the limit).
 */
export function playCaseAllProjectsLineSnake() {
	if (snakes.length >= MAX_SNAKES) {
		snakes.shift();
	}
	snakes.push({
		startMs: performance.now(),
		progress: 0,
		strength: 0.85,
	});
	ensureRaf();
	scheduleRepaint();
}

/**
 * Hover leave must not abort — snakes finish on their own.
 * Kept as a no-op so call sites stay shared with prev/next.
 */
export function clearCaseAllProjectsLineSnake() {
	// Intentionally empty: animation runs to completion.
}

/** Hard-stop line snakes (click leave / dispose). */
export function abortCaseAllProjectsLineSnake() {
	snakes = [];
	stopRaf();
	scheduleRepaint();
}

/**
 * One-way snake clipped to the rail: head leads left, tail only behind (right).
 * Motion continues past both ends — visibility is cut by the rail only.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} headX leading tip (may be outside the rail)
 * @param {number} tailLen
 * @param {number} y
 * @param {number} strength
 * @param {number} railX0
 * @param {number} railX1
 */
function drawSnakeSegment(ctx, headX, tailLen, y, strength, railX0, railX1) {
	const s = Math.min(1, Math.max(0, strength));
	const len = Math.max(4, tailLen);
	if (s < 0.01) {
		return;
	}

	const full0 = headX;
	const full1 = headX + len;
	const sx0 = Math.max(railX0, full0);
	const sx1 = Math.min(railX1, full1);
	if (sx1 - sx0 < 0.75) {
		return;
	}

	// Gradient in full snake space so the clipped slice looks like a cut, not a fade-out.
	const gradient = ctx.createLinearGradient(full0, y, full1, y);
	gradient.addColorStop(0, `rgba(255, 255, 255, ${0.55 + s * 0.4})`);
	gradient.addColorStop(0.1, siteMainRgba(0.28 + s * 0.28));
	gradient.addColorStop(0.38, siteMainRgba(0.1 + s * 0.14));
	gradient.addColorStop(0.72, siteMainRgba(0.03 + s * 0.05));
	gradient.addColorStop(1, siteMainRgba(0));

	const bloomWidth = 1.6 + s * 1.1;
	const coreWidth = 0.85 + s * 0.45;
	const opacity = 0.42 + s * 0.28;

	ctx.save();
	// Butt + rail clip = hard cut at the line ends (not a soft extinguish).
	ctx.lineCap = "butt";
	ctx.globalCompositeOperation = "lighter";
	ctx.strokeStyle = gradient;

	ctx.globalAlpha = opacity * 0.7;
	ctx.shadowColor = siteMainRgba(0.35);
	ctx.shadowBlur = 2;
	ctx.lineWidth = bloomWidth;
	ctx.beginPath();
	ctx.moveTo(sx0, y);
	ctx.lineTo(sx1, y);
	ctx.stroke();

	ctx.globalAlpha = Math.min(1, opacity + 0.2);
	ctx.shadowColor = "rgba(255, 255, 255, 0.3)";
	ctx.shadowBlur = 1.2;
	ctx.lineWidth = coreWidth;
	ctx.beginPath();
	ctx.moveTo(sx0, y);
	ctx.lineTo(sx1, y);
	ctx.stroke();

	ctx.restore();
}

/**
 * Ambient cyan rail + traveling snake pulse(s) (RTL).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x0 left end of the marker line
 * @param {number} y
 * @param {number} length
 */
export function drawCaseAllProjectsMarkerLine(ctx, x0, y, length) {
	const railLen = Math.max(8, length);
	const x1 = x0 + railLen;

	ctx.save();
	ctx.lineCap = "round";

	ctx.shadowColor = siteMainRgba(0.45);
	ctx.shadowBlur = 4;
	ctx.strokeStyle = SITE_MAIN_COLOR;
	ctx.globalAlpha = 0.72;
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(x0, y);
	ctx.lineTo(x1, y);
	ctx.stroke();
	ctx.shadowBlur = 0;
	ctx.globalAlpha = 1;

	if (snakes.length > 0) {
		const snakeLen = resolveSnakeLen(railLen);
		// Enter from just past the right tip; exit fully past the left tip.
		const headStart = x1 + 1;
		const headEnd = x0 - snakeLen;

		ctx.save();
		ctx.beginPath();
		ctx.rect(x0, y - 5, railLen, 10);
		ctx.clip();
		for (let i = 0; i < snakes.length; i += 1) {
			const snake = snakes[i];
			if (snake.strength <= 0.01) {
				continue;
			}
			const headX = headStart + (headEnd - headStart) * snake.progress;
			drawSnakeSegment(ctx, headX, snakeLen, y, snake.strength, x0, x1);
		}
		ctx.restore();
	}

	ctx.restore();
}

/**
 * @param {() => void} callback
 */
export function registerCaseAllProjectsLineSnakeRepaint(callback) {
	repaint = callback;
	return () => {
		if (repaint === callback) {
			repaint = null;
		}
	};
}

export function disposeCaseAllProjectsLineSnake() {
	stopRaf();
	snakes = [];
	repaint = null;
}
