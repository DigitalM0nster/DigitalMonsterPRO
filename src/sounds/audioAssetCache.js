import { getMasterAudioContext } from "./masterAudioBus.js";

const audioDataPromises = new Map();
const decodedBufferPromises = new Map();

function assertAudioResponse(response, src) {
	if (!response.ok) {
		throw new Error(`[audio] Failed to load ${src}: HTTP ${response.status}`);
	}
	const contentType = String(response.headers.get("content-type") ?? "").toLowerCase();
	if (contentType.includes("text/html")) {
		throw new Error(`[audio] ${src} resolved to HTML instead of an audio asset`);
	}
}

export function fetchAudioData(src) {
	if (!audioDataPromises.has(src)) {
		const promise = fetch(src)
			.then((response) => {
				assertAudioResponse(response, src);
				return response.arrayBuffer();
			})
			.catch((error) => {
				audioDataPromises.delete(src);
				throw error;
			});
		audioDataPromises.set(src, promise);
	}
	return audioDataPromises.get(src);
}

export function loadAudioBuffer(src, context = getMasterAudioContext()) {
	if (!context) {
		return Promise.reject(new Error("[audio] AudioContext unavailable"));
	}
	if (!decodedBufferPromises.has(src)) {
		const promise = fetchAudioData(src)
			.then((arrayBuffer) => context.decodeAudioData(arrayBuffer.slice(0)))
			.catch((error) => {
				decodedBufferPromises.delete(src);
				throw error;
			});
		decodedBufferPromises.set(src, promise);
	}
	return decodedBufferPromises.get(src);
}

export function prefetchAudioAssets(sources) {
	return Promise.allSettled([...new Set(sources)].map((src) => fetchAudioData(src)));
}

function yieldToPaint() {
	return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/** Decode sequentially under the loader curtain, yielding after every buffer. */
export async function preloadAudioBuffers(sources, context = getMasterAudioContext()) {
	const results = [];
	for (const src of [...new Set(sources)]) {
		try {
			results.push({ src, status: "fulfilled", value: await loadAudioBuffer(src, context) });
		} catch (reason) {
			results.push({ src, status: "rejected", reason });
		}
		await yieldToPaint();
	}
	return results;
}
