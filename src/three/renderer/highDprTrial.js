/** DPR above the native ratio is earned by this prepared viewport, never a GPU name/cache. */
export function shouldTrialHighDpr({ tier, width, baselineDpr }) {
	return tier === "high" && Number.isFinite(width) && width >= 980
		&& Number.isFinite(baselineDpr) && baselineDpr > 0 && baselineDpr < 2;
}

/**
 * Observe completed prepared-frame cadence, including browser/GPU backpressure.
 * The caller owns drawing and resource lifetime; this never changes the DPR.
 * Do not persist this result: viewport, thermal state and browser load can differ.
 */
export async function measurePreparedHighDpr({
	sceneIds, draw, nextFrame, now = () => performance.now(),
	cancelled = () => false, isCurrentViewport = () => true, isVisible = () => true,
	frameCount = 64, maxDurationMs = 2400,
}) {
	const intervals = [];
	const byScene = new Map();
	let slowFrames = 0;
	const finish = (reason) => {
		const sorted = [...intervals].sort((a, b) => a - b);
		const total = intervals.reduce((sum, ms) => sum + ms, 0);
		const fps = total > 0 ? intervals.length * 1000 / total : 0;
		const p90Ms = sorted.length ? sorted[Math.ceil(sorted.length * .9) - 1] : null;
		const scenes = [...byScene].map(([id, values]) => ({
			id, frames: values.length, fps: values.length * 1000 / values.reduce((sum, ms) => sum + ms, 0),
		}));
		// A fast home must not hide a consistently slow heavier prepared scene.
		const accepted = reason === "complete" && fps >= 50 && p90Ms <= 20
			&& scenes.every(scene => scene.fps >= 50);
		return { accepted, reason, dpr: 2, frames: intervals.length, fps, p90Ms, scenes };
	};
	const invalidReason = () => cancelled() ? "cancelled"
		: !isCurrentViewport() ? "viewport-changed" : !isVisible() ? "hidden" : null;
	if (!sceneIds.length) return finish("no-scenes");
	await nextFrame();
	const startedAt = now();
	for (let i = 0; i < frameCount; i++) {
		let invalid = invalidReason();
		if (invalid) return finish(invalid);
		const id = sceneIds[Math.min(sceneIds.length - 1, Math.floor(i * sceneIds.length / frameCount))];
		const start = now();
		if (draw(id) === false) return finish("missing-frame");
		await nextFrame();
		invalid = invalidReason();
		if (invalid) return finish(invalid);
		const interval = now() - start;
		if (!Number.isFinite(interval) || interval <= 0) return finish("invalid-clock");
		intervals.push(interval);
		if (!byScene.has(id)) byScene.set(id, []);
		byScene.get(id).push(interval);
		slowFrames = interval > 28 ? slowFrames + 1 : 0;
		if (interval > 150 || slowFrames >= 3) return finish("slow");
		if (now() - startedAt > maxDurationMs) return finish("timeout");
	}
	return finish("complete");
}
