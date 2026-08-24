const { chromium } = require("playwright");

(async () => {
	const context = await chromium.launchPersistentContext(
		"C:\\Users\\psych\\AppData\\Local\\Temp\\dm-city-gate3",
		{
			headless: true,
			executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
			viewport: { width: 1920, height: 945 },
			deviceScaleFactor: 1,
			recordVideo: {
				dir: "C:\\websites\\develope\\DigitalMonsterPRO\\.codex\\city-scene\\evidence\\gate3-video-temp",
				size: { width: 1920, height: 945 },
			},
			args: ["--autoplay-policy=no-user-gesture-required"],
		},
	);
	const page = context.pages()[0] || await context.newPage();
	const video = page.video();
	const consoleErrors = [];
	const consoleWarnings = [];
	page.on("console", (message) => {
		if (message.type() === "error") consoleErrors.push(message.text());
		if (message.type() === "warning") consoleWarnings.push(message.text());
	});
	page.on("pageerror", (error) => consoleErrors.push(error.message));
	let report = null;
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
			path: "C:\\websites\\develope\\DigitalMonsterPRO\\.codex\\city-scene\\evidence\\gate3-facade-distant-1920x945-dpr1.png",
		});
		await page.screenshot({
			path: "C:\\websites\\develope\\DigitalMonsterPRO\\.codex\\city-scene\\evidence\\gate3-facade-closeup-central.png",
			clip: { x: 720, y: 180, width: 850, height: 700 },
		});
		await page.screenshot({
			path: "C:\\websites\\develope\\DigitalMonsterPRO\\.codex\\city-scene\\evidence\\gate3-facade-closeup-rear.png",
			clip: { x: 1120, y: 170, width: 690, height: 610 },
		});
		await page.screenshot({
			path: "C:\\websites\\develope\\DigitalMonsterPRO\\.codex\\city-scene\\evidence\\gate3-family-edge-closeup-office.png",
			clip: { x: 610, y: 455, width: 720, height: 430 },
		});
		await page.screenshot({
			path: "C:\\websites\\develope\\DigitalMonsterPRO\\.codex\\city-scene\\evidence\\gate3-family-edge-closeup-civic.png",
			clip: { x: 1300, y: 455, width: 500, height: 390 },
		});

		const canvasBox = await page.locator("canvas").first().boundingBox();
		let motionDurationMs = 0;
		let returnDurationMs = 0;
		if (canvasBox) {
			const startX = canvasBox.x + 1340;
			const startY = canvasBox.y + 570;
			const endX = canvasBox.x + 1145;
			const endY = canvasBox.y + 430;
			await page.mouse.move(startX, startY);
			await page.mouse.down();
			const motionStart = Date.now();
			for (let index = 1; index <= 240; index += 1) {
				const progress = index / 240;
				const eased = 0.5 - Math.cos(progress * Math.PI) * 0.5;
				await page.mouse.move(
					startX + (endX - startX) * eased,
					startY + (endY - startY) * eased + Math.sin(progress * Math.PI * 2) * 8,
				);
				await page.waitForTimeout(48);
			}
			motionDurationMs = Date.now() - motionStart;
			await page.mouse.up();
			const returnStart = Date.now();
			await page.waitForTimeout(4500);
			returnDurationMs = Date.now() - returnStart;
			await page.screenshot({
				path: "C:\\websites\\develope\\DigitalMonsterPRO\\.codex\\city-scene\\evidence\\gate3-facade-oblique-after-motion-1920x945-dpr1.png",
			});
		}
		report = { runtime, measure, motionDurationMs, returnDurationMs, consoleErrors, consoleWarnings };
	} finally {
		await context.close();
	}
	const videoPath = video ? await video.path().catch(() => null) : null;
	process.stdout.write(JSON.stringify({ ...report, videoPath }));
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
