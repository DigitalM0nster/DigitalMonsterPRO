/** @typedef {'frame' | 'wheel' | 'commitForward' | 'commitBackward'} CarouselProgressLogEvent */

const MAX_ENTRIES = 20000;

/** @type {Array<Record<string, unknown>>} */
let entries = [];
let recording = false;
let frameIndex = 0;
let startedAt = 0;

function formatNum(value, digits = 6) {
	return Number(value).toFixed(digits);
}

/**
 * @param {import('../render/transition/SceneCarousel.js').SceneCarousel} carousel
 * @param {CarouselProgressLogEvent} event
 * @param {Record<string, unknown>} [extra]
 */
function snapshot(carousel, event, extra = {}) {
	const now = typeof performance !== "undefined" ? performance.now() : Date.now();
	if (startedAt === 0) {
		startedAt = now;
	}

	frameIndex += 1;

	return {
		frame: frameIndex,
		tMs: Math.round((now - startedAt) * 100) / 100,
		event,
		progress: carousel.progress,
		progressTarget: carousel.progressTarget,
		scrollIntent: carousel.scrollIntent ?? null,
		currentId: carousel.currentId,
		...extra,
	};
}

/**
 * @param {Record<string, unknown>} entry
 */
function pushEntry(entry) {
	entries.push(entry);

	if (entries.length > MAX_ENTRIES) {
		entries.shift();
	}

	console.log(
		`[carousel] f=${entry.frame} t=${entry.tMs}ms evt=${entry.event} p=${formatNum(entry.progress)} pt=${formatNum(entry.progressTarget)} intent=${entry.scrollIntent ?? "null"}${
			entry.wheelDelta !== undefined ? ` wheel=${formatNum(entry.wheelDelta, 4)}` : ""
		}${entry.delta !== undefined ? ` delta=${formatNum(entry.delta, 4)}` : ""}`,
	);
}

/**
 * @param {import('../render/transition/SceneCarousel.js').SceneCarousel} carousel
 * @param {number} delta
 */
export function logCarouselProgressFrame(carousel, delta) {
	if (!import.meta.env.DEV || !recording) {
		return;
	}

	pushEntry(snapshot(carousel, "frame", { delta }));
}

/**
 * @param {import('../render/transition/SceneCarousel.js').SceneCarousel} carousel
 * @param {number} wheelDelta
 */
export function logCarouselProgressWheel(carousel, wheelDelta) {
	if (!import.meta.env.DEV || !recording) {
		return;
	}

	pushEntry(snapshot(carousel, "wheel", { wheelDelta }));
}

/**
 * @param {import('../render/transition/SceneCarousel.js').SceneCarousel} carousel
 * @param {'forward' | 'backward'} direction
 */
export function logCarouselProgressCommit(carousel, direction) {
	if (!import.meta.env.DEV || !recording) {
		return;
	}

	pushEntry(snapshot(carousel, direction === "forward" ? "commitForward" : "commitBackward"));
}

export function startCarouselProgressTargetLog() {
	if (!import.meta.env.DEV) {
		return;
	}

	recording = true;
	startedAt = 0;
	frameIndex = 0;
	entries = [];
	console.log("[carousel] ▶ запись progressTarget — каждый кадр в консоль. Копировать: copyCarouselProgressTargetLog()");
}

export function stopCarouselProgressTargetLog() {
	if (!import.meta.env.DEV) {
		return;
	}

	recording = false;
	console.log(`[carousel] ⏹ запись остановлена. строк: ${entries.length}. copyCarouselProgressTargetLog()`);
}

export function clearCarouselProgressTargetLog() {
	entries = [];
	frameIndex = 0;
	startedAt = 0;
	console.log("[carousel] лог очищен");
}

export function isCarouselProgressTargetLogRecording() {
	return recording;
}

export function getCarouselProgressTargetLogCount() {
	return entries.length;
}

export function getCarouselProgressTargetLogText() {
	const header = "frame\ttMs\tevent\tprogress\tprogressTarget\tscrollIntent\tcurrentId\twheelDelta\tdelta\n";
	const lines = entries.map((entry) =>
		[
			entry.frame,
			entry.tMs,
			entry.event,
			formatNum(entry.progress),
			formatNum(entry.progressTarget),
			entry.scrollIntent ?? "",
			entry.currentId ?? "",
			entry.wheelDelta !== undefined ? formatNum(entry.wheelDelta, 4) : "",
			entry.delta !== undefined ? formatNum(entry.delta, 4) : "",
		].join("\t"),
	);

	return `${header}${lines.join("\n")}\n`;
}

export async function copyCarouselProgressTargetLog() {
	const text = getCarouselProgressTargetLogText();

	try {
		await navigator.clipboard.writeText(text);
		console.log(`[carousel] ✓ скопировано ${entries.length} строк в буфер (TSV)`);
		return text;
	} catch {
		console.log("[carousel] clipboard недоступен — текст ниже:");
		console.log(text);
		return text;
	}
}

if (import.meta.env.DEV && typeof window !== "undefined") {
	window.startCarouselProgressTargetLog = startCarouselProgressTargetLog;
	window.stopCarouselProgressTargetLog = stopCarouselProgressTargetLog;
	window.clearCarouselProgressTargetLog = clearCarouselProgressTargetLog;
	window.copyCarouselProgressTargetLog = copyCarouselProgressTargetLog;
	window.getCarouselProgressTargetLogText = getCarouselProgressTargetLogText;
}
