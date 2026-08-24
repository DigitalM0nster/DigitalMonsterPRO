const { chromium } = require("playwright");

(async () => {
	const context = await chromium.launchPersistentContext(
		"C:\\Users\\psych\\AppData\\Local\\Temp\\dm-city-gate0-video",
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
	page.on("console", (message) => {
		if (message.type() === "error") consoleErrors.push(message.text());
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
		await page.waitForTimeout(2500);
		const runtime = await page.evaluate(() => {
			const canvases = Array.from(document.querySelectorAll("canvas"));
			const canvas = canvases.find((item) => item.width >= innerWidth) || canvases[0];
			const gl = canvas?.getContext("webgl2");
			const debug = gl?.getExtension("WEBGL_debug_renderer_info");
			return {
				pathname: location.pathname,
				viewport: [innerWidth, innerHeight],
				dpr: devicePixelRatio,
				canvas: canvas ? [canvas.width, canvas.height, canvas.clientWidth, canvas.clientHeight] : null,
				webgl2: Boolean(gl),
				renderer: gl && debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null,
				hudVisible: Boolean(document.querySelector("[class*='spatialCityHud']")),
			};
		});
		const measure = await page.evaluate(async () => {
			const frames = [];
			await new Promise((resolve) => {
				let previous = performance.now();
				const end = previous + 5000;
				const tick = (now) => {
					frames.push(now - previous);
					previous = now;
					if (now >= end) resolve();
					else requestAnimationFrame(tick);
				};
				requestAnimationFrame(tick);
			});
			frames.shift();
			const sorted = [...frames].sort((a, b) => a - b);
			return {
				frames: frames.length,
				averageFps: frames.length / (frames.reduce((sum, value) => sum + value, 0) / 1000),
				p95FrameMs: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))],
				over25Ratio: frames.filter((value) => value > 25).length / frames.length,
			};
		});
		await page.screenshot({
			path: "C:\\websites\\develope\\DigitalMonsterPRO\\.codex\\city-scene\\evidence\\gate2-correction3-city-exact-1920x945-dpr1.png",
		});
		const canvasBox = await page.locator("canvas").first().boundingBox();
		if (canvasBox) {
			await page.mouse.move(canvasBox.x + 1320, canvasBox.y + 560);
			await page.mouse.down();
			await page.mouse.move(canvasBox.x + 1180, canvasBox.y + 420, { steps: 36 });
			await page.mouse.up();
			await page.waitForTimeout(1000);
			await page.screenshot({
				path: "C:\\websites\\develope\\DigitalMonsterPRO\\.codex\\city-scene\\evidence\\gate2-correction3-road-oblique-1920x945-dpr1.png",
			});
		}
		process.stdout.write(JSON.stringify({ runtime, measure, consoleErrors }));
	} finally {
		await context.close();
	}
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
