const { chromium } = require("playwright");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

(async () => {
	const profile = fs.mkdtempSync(path.join(os.tmpdir(), "dm-city-gate4-"));
	const context = await chromium.launchPersistentContext(profile, {
		headless: true,
		executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
		viewport: { width: 1920, height: 945 },
		deviceScaleFactor: 1,
		args: ["--autoplay-policy=no-user-gesture-required"],
	});
	const page = context.pages()[0] || await context.newPage();
	const consoleErrors = [];
	const consoleWarnings = [];
	page.on("console", (message) => {
		if (message.type() === "error") consoleErrors.push(message.text());
		if (message.type() === "warning") consoleWarnings.push(message.text());
	});
	page.on("pageerror", (error) => consoleErrors.push(error.message));

	try {
		await page.goto("http://127.0.0.1:4184/capabilities/spatial-matrix", {
			waitUntil: "domcontentloaded",
			timeout: 30000,
		});
		const languageButton = page.getByRole("button", { name: "ENGLISH", exact: true });
		await languageButton.waitFor({ state: "visible", timeout: 120000 });
		await languageButton.click();
		await page.waitForFunction(() => !document.body.innerText.includes("LOADING"), null, { timeout: 120000 });
		await page.waitForTimeout(5000);

		const runtime = await page.evaluate(() => {
			const canvas = Array.from(document.querySelectorAll("canvas"))
				.find((item) => item.width >= innerWidth && item.clientWidth === innerWidth);
			const gl = canvas?.getContext("webgl2");
			const debug = gl?.getExtension("WEBGL_debug_renderer_info");
			return {
				pathname: location.pathname,
				viewport: [innerWidth, innerHeight],
				dpr: devicePixelRatio,
				canvas: canvas ? [canvas.width, canvas.height, canvas.clientWidth, canvas.clientHeight] : null,
				webgl2: Boolean(gl),
				renderer: gl && debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null,
			};
		});

		const measure = await page.evaluate(async () => {
			const intervals = [];
			await new Promise((resolve) => {
				let previous = performance.now();
				const end = previous + 15000;
				const tick = (now) => {
					intervals.push(now - previous);
					previous = now;
					if (now >= end) resolve();
					else requestAnimationFrame(tick);
				};
				requestAnimationFrame(tick);
			});
			intervals.shift();
			const sorted = [...intervals].sort((a, b) => a - b);
			const durationMs = intervals.reduce((sum, value) => sum + value, 0);
			return {
				durationMs,
				frames: intervals.length,
				averageFps: intervals.length / (durationMs / 1000),
				meanFrameMs: durationMs / intervals.length,
				p95FrameMs: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))],
				maxFrameMs: sorted.at(-1),
				framesOver25Ms: intervals.filter((value) => value > 25).length,
			};
		});

		process.stdout.write(JSON.stringify({ runtime, measure, consoleErrors, consoleWarnings }));
	} finally {
		await context.close();
		fs.rmSync(profile, { recursive: true, force: true });
	}
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
