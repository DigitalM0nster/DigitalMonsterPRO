import { store } from "@/store.jsx";

const MAX_ENTRIES = 30000;

/** @type {Array<Record<string, unknown>>} */
let entries = [];
let recording = false;
let frameIndex = 0;
let startedAt = 0;
let startedAtIso = null;
let rafId = 0;
let lastSampleKey = "";
/** @type {string | null} */
let segmentLabel = null;

/**
 * Live sampler registered by the debug panel (avoids import cycle with stageProgress).
 * @type {(() => {
 *   progress: number,
 *   progressTarget: number,
 *   scrollIntent: string | null,
 * }) | null}
 */
let liveSampler = null;

function formatNum(value, digits = 6) {
	const number = Number(value);
	return Number.isFinite(number) ? number.toFixed(digits) : "";
}

function nowMs() {
	return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function readLive() {
	if (liveSampler) {
		return liveSampler();
	}
	const experience = store.portfolioExperience ?? {};
	return {
		progress: Number(experience.stageProgress) || 0,
		progressTarget: Number(experience.stageProgressTarget) || 0,
		scrollIntent: null,
	};
}

/**
 * @param {string} event
 * @param {Record<string, unknown>} [extra]
 */
function snapshot(event, extra = {}) {
	const now = nowMs();
	if (startedAt === 0) {
		startedAt = now;
	}

	frameIndex += 1;
	const experience = store.portfolioExperience ?? {};
	const live = readLive();

	return {
		frame: frameIndex,
		tMs: Math.round((now - startedAt) * 100) / 100,
		event,
		label: segmentLabel,
		progress: live.progress,
		progressTarget: live.progressTarget,
		scrollIntent: live.scrollIntent,
		storeScroll: store.scroll,
		caseScrollTarget: store.caseScrollTarget,
		slug: experience.slug ?? null,
		activeStateIndex: experience.activeStateIndex ?? null,
		activeStateId: experience.activeStateId ?? null,
		storeStageProgress: experience.stageProgress ?? null,
		storeStageProgressTarget: experience.stageProgressTarget ?? null,
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

	if (entry.event !== "frame") {
		console.log(
			`[stage-progress-trace] f=${entry.frame} t=${entry.tMs}ms evt=${entry.event}`
			+ (entry.label ? ` label=${entry.label}` : "")
			+ ` p=${formatNum(entry.progress, 4)} → pt=${formatNum(entry.progressTarget, 4)}`
			+ ` intent=${entry.scrollIntent ?? "null"}`
			+ ` idx=${entry.activeStateIndex ?? "?"}`
			+ (entry.beforeProgress !== undefined ? ` before=${formatNum(entry.beforeProgress, 4)}` : "")
			+ (entry.afterProgress !== undefined ? ` after=${formatNum(entry.afterProgress, 4)}` : ""),
		);
	}
}

function sampleKey() {
	const live = readLive();
	return [
		Number(live.progress).toFixed(5),
		Number(live.progressTarget).toFixed(5),
		live.scrollIntent ?? "",
		String(store.scroll ?? ""),
		String(store.caseScrollTarget ?? ""),
		String(store.portfolioExperience?.activeStateIndex ?? ""),
		segmentLabel ?? "",
	].join("|");
}

function recordingLoop() {
	rafId = 0;
	if (!recording || typeof window === "undefined") {
		return;
	}

	const key = sampleKey();
	if (key !== lastSampleKey) {
		lastSampleKey = key;
		pushEntry(snapshot("frame"));
	}

	rafId = window.requestAnimationFrame(recordingLoop);
}

function ensureRecordingLoop() {
	if (!recording || typeof window === "undefined" || rafId) {
		return;
	}
	rafId = window.requestAnimationFrame(recordingLoop);
}

function stopRecordingLoop() {
	if (rafId && typeof window !== "undefined") {
		window.cancelAnimationFrame(rafId);
	}
	rafId = 0;
}

/**
 * @param {typeof liveSampler} sampler
 */
export function registerStageProgressTraceSampler(sampler) {
	liveSampler = sampler;
}

/**
 * Explicit commit marker (called from stageProgress tick).
 * @param {'forward' | 'backward'} direction
 * @param {{ beforeProgress: number, afterProgress: number, beforeTarget: number, afterTarget: number }} values
 */
export function logStageProgressCommit(direction, values) {
	if (!import.meta.env.DEV || !recording) {
		return;
	}

	lastSampleKey = "";
	pushEntry(snapshot(direction === "forward" ? "commitForward" : "commitBackward", {
		beforeProgress: values.beforeProgress,
		afterProgress: values.afterProgress,
		beforeTarget: values.beforeTarget,
		afterTarget: values.afterTarget,
		progress: values.afterProgress,
		progressTarget: values.afterTarget,
	}));
}

/**
 * @param {number} wheelDelta
 */
export function logStageProgressWheel(wheelDelta) {
	if (!import.meta.env.DEV || !recording) {
		return;
	}

	lastSampleKey = "";
	pushEntry(snapshot("wheel", { wheelDelta }));
}

/**
 * @param {string | null} label
 */
export function setStageProgressTraceLabel(label) {
	segmentLabel = label && String(label).trim() ? String(label).trim() : null;
	if (recording) {
		lastSampleKey = "";
		pushEntry(snapshot("label", { note: segmentLabel }));
	}
}

export function getStageProgressTraceLabel() {
	return segmentLabel;
}

export function startStageProgressTrace() {
	if (!import.meta.env.DEV) {
		return;
	}

	recording = true;
	startedAt = 0;
	startedAtIso = new Date().toISOString();
	frameIndex = 0;
	entries = [];
	lastSampleKey = "";
	console.log("[stage-progress-trace] ▶ recording. Stop + download JSONL, then paste/send the file.");
	ensureRecordingLoop();
	pushEntry(snapshot("start"));
}

export function stopStageProgressTrace() {
	if (!import.meta.env.DEV) {
		return;
	}

	recording = false;
	stopRecordingLoop();
	if (entries.length > 0) {
		pushEntry(snapshot("stop"));
	}
	console.log(`[stage-progress-trace] ⏹ stopped. entries=${entries.length}`);
}

export function clearStageProgressTrace() {
	entries = [];
	frameIndex = 0;
	startedAt = 0;
	startedAtIso = null;
	lastSampleKey = "";
	console.log("[stage-progress-trace] cleared");
}

export function isStageProgressTraceRecording() {
	return recording;
}

export function getStageProgressTraceCount() {
	return entries.length;
}

export function getStageProgressTraceJsonl() {
	const metadata = {
		type: "stage-progress-trace-metadata",
		version: 1,
		startedAt: startedAtIso,
		exportedAt: new Date().toISOString(),
		entryCount: entries.length,
		label: segmentLabel,
		viewport: typeof window !== "undefined"
			? { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio }
			: null,
	};
	return `${[metadata, ...entries].map((entry) => JSON.stringify(entry)).join("\n")}\n`;
}

export function getStageProgressTraceTsv() {
	const header = [
		"frame",
		"tMs",
		"event",
		"label",
		"progress",
		"progressTarget",
		"scrollIntent",
		"activeStateIndex",
		"storeScroll",
		"caseScrollTarget",
		"beforeProgress",
		"afterProgress",
		"beforeTarget",
		"afterTarget",
		"wheelDelta",
	].join("\t");
	const lines = entries.map((entry) =>
		[
			entry.frame,
			entry.tMs,
			entry.event,
			entry.label ?? "",
			formatNum(entry.progress),
			formatNum(entry.progressTarget),
			entry.scrollIntent ?? "",
			entry.activeStateIndex ?? "",
			formatNum(entry.storeScroll),
			formatNum(entry.caseScrollTarget),
			entry.beforeProgress !== undefined ? formatNum(entry.beforeProgress) : "",
			entry.afterProgress !== undefined ? formatNum(entry.afterProgress) : "",
			entry.beforeTarget !== undefined ? formatNum(entry.beforeTarget) : "",
			entry.afterTarget !== undefined ? formatNum(entry.afterTarget) : "",
			entry.wheelDelta !== undefined ? formatNum(entry.wheelDelta, 4) : "",
		].join("\t"),
	);
	return `${header}\n${lines.join("\n")}\n`;
}

export function downloadStageProgressTrace() {
	if (!import.meta.env.DEV || typeof document === "undefined") {
		return null;
	}

	const text = getStageProgressTraceJsonl();
	const blob = new Blob([text], { type: "application/x-ndjson;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	const filename = `stage-progress-trace-${stamp}.jsonl`;
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	link.style.display = "none";
	document.body.appendChild(link);
	link.click();
	link.remove();
	window.setTimeout(() => URL.revokeObjectURL(url), 1000);
	console.log(`[stage-progress-trace] saved ${entries.length} entries → ${filename}`);
	return filename;
}

export async function copyStageProgressTrace() {
	const text = getStageProgressTraceTsv();
	try {
		await navigator.clipboard.writeText(text);
		console.log(`[stage-progress-trace] ✓ copied ${entries.length} rows (TSV)`);
		return text;
	} catch {
		console.log("[stage-progress-trace] clipboard unavailable — dump below:");
		console.log(text);
		return text;
	}
}

if (import.meta.env.DEV && typeof window !== "undefined") {
	window.startStageProgressTrace = startStageProgressTrace;
	window.stopStageProgressTrace = stopStageProgressTrace;
	window.clearStageProgressTrace = clearStageProgressTrace;
	window.downloadStageProgressTrace = downloadStageProgressTrace;
	window.copyStageProgressTrace = copyStageProgressTrace;
	window.getStageProgressTraceJsonl = getStageProgressTraceJsonl;
	window.setStageProgressTraceLabel = setStageProgressTraceLabel;
}
