const { chromium } = require("playwright");

(async () => {
	const context = await chromium.launchPersistentContext(
		"C:\\Users\\psych\\AppData\\Local\\Temp\\dm-city-gate3-c3-perf-20260814",
		{
			headless: true,
			executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
			viewport: { width: 1920, height: 945 },
			deviceScaleFactor: 1,
			args: ["--autoplay-policy=no-user-gesture-required"],
		},
	);
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
		const cityPage = page.locator('[data-capability-id="spatial-matrix"]');
		if (!await cityPage.isVisible().catch(() => false)) {
			const english = page.getByRole("button", { name: "ENGLISH", exact: true });
			await english.waitFor({ state: "visible", timeout: 150000 });
			await english.click();
		}
		await cityPage.waitFor({ state: "visible", timeout: 120000 });
		await page.waitForTimeout(3500);

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
				const end = previous + 10000;
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
			return {
				durationMs: intervals.reduce((sum, value) => sum + value, 0),
				frames: intervals.length,
				averageFps: intervals.length / (intervals.reduce((sum, value) => sum + value, 0) / 1000),
				p95FrameMs: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))],
				framesOver25Ms: intervals.filter((value) => value > 25).length,
			};
		});

		process.stdout.write(JSON.stringify({ runtime, measure, consoleErrors, consoleWarnings }));
	} finally {
		await context.close();
	}
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
