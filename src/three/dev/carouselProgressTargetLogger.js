import { store } from "@/store.jsx";

/** @typedef {'frame' | 'wheel' | 'commitForward' | 'commitBackward' | string} CarouselProgressLogEvent */

const MAX_ENTRIES = 20000;
const TRACE_SCENE_IDS = ["home", "portfolioHub", "about", "contacts"];

/** @type {Array<Record<string, unknown>>} */
let entries = [];
let recording = false;
let frameIndex = 0;
let startedAt = 0;
let startedAtIso = null;

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
	const experience = store.portfolioExperience ?? {};
	const scenes = Object.fromEntries(TRACE_SCENE_IDS.map((sceneId) => [
		sceneId,
		{
			progress: carousel.getSceneProgress(sceneId),
			target: carousel.getSceneProgressTarget(sceneId),
			role: carousel.getSceneProgressRole(sceneId),
		},
	]));

	return {
		frame: frameIndex,
		tMs: Math.round((now - startedAt) * 100) / 100,
		event,
		progress: carousel.progress,
		progressTarget: carousel.progressTarget,
		scrollIntent: carousel.scrollIntent ?? null,
		currentId: carousel.currentId,
		previousId: carousel.previousId,
		nextId: carousel.nextId,
		stage: {
			storeScroll: store.scroll,
			scrollTarget: store.caseScrollTarget,
			slug: experience.slug ?? null,
			activeStateIndex: experience.activeStateIndex ?? null,
			activeStateId: experience.activeStateId ?? null,
			progress: experience.stageProgress ?? null,
			target: experience.stageProgressTarget ?? null,
		},
		scenes,
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

	if (entry.event !== "frame" && entry.event !== "about:frame") {
		console.log(
			`[about-scroll-trace] f=${entry.frame} t=${entry.tMs}ms evt=${entry.event} p=${formatNum(entry.progress)} pt=${formatNum(entry.progressTarget)} intent=${entry.scrollIntent ?? "null"}${
				entry.wheelDelta !== undefined ? ` wheel=${formatNum(entry.wheelDelta, 4)}` : ""
			}${entry.delta !== undefined ? ` delta=${formatNum(entry.delta, 4)}` : ""}`
			+ ` stageT=${formatNum(entry.stage?.target ?? 0, 4)}`
			+ ` caseT=${formatNum(entry.stage?.scrollTarget ?? 0, 4)}`,
		);
	}
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

/**
 * @param {import('../render/transition/SceneCarousel.js').SceneCarousel} carousel
 * @param {Record<string, unknown> & { type?: string }} trace
 */
export function logAboutScrollTrace(carousel, trace) {
	if (!import.meta.env.DEV || !recording || !carousel) {
		return;
	}

	const type = typeof trace?.type === "string" ? trace.type : "event";
	pushEntry(snapshot(carousel, `about:${type}`, {
		source: "about-scroll",
		about: trace,
	}));
}

export function startCarouselProgressTargetLog() {
	if (!import.meta.env.DEV) {
		return;
	}

	recording = true;
	startedAt = 0;
	startedAtIso = new Date().toISOString();
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
	startedAtIso = null;
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

export function getCarouselProgressTargetLogJsonl() {
	const metadata = {
		type: "about-scroll-trace-metadata",
		version: 1,
		startedAt: startedAtIso,
		exportedAt: new Date().toISOString(),
		entryCount: entries.length,
		viewport: typeof window !== "undefined"
			? { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio }
			: null,
	};
	return `${[metadata, ...entries].map((entry) => JSON.stringify(entry)).join("\n")}\n`;
}

export function downloadCarouselProgressTargetLog() {
	if (!import.meta.env.DEV || typeof document === "undefined") {
		return null;
	}

	const text = getCarouselProgressTargetLogJsonl();
	const blob = new Blob([text], { type: "application/x-ndjson;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	const filename = `about-scroll-trace-${stamp}.jsonl`;
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	link.style.display = "none";
	document.body.appendChild(link);
	link.click();
	link.remove();
	window.setTimeout(() => URL.revokeObjectURL(url), 1000);
	console.log(`[about-scroll-trace] saved ${entries.length} entries to ${filename}`);
	return filename;
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
	window.downloadCarouselProgressTargetLog = downloadCarouselProgressTargetLog;
	window.getCarouselProgressTargetLogJsonl = getCarouselProgressTargetLogJsonl;
}
