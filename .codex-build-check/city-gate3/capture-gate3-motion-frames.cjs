const { chromium } = require("playwright");

(async () => {
	const context = await chromium.launchPersistentContext(
		"C:\\Users\\psych\\AppData\\Local\\Temp\\dm-city-gate3-motion-frames",
		{
			headless: true,
			executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
			viewport: { width: 1920, height: 945 },
			deviceScaleFactor: 1,
			args: ["--autoplay-policy=no-user-gesture-required"],
		},
	);
	const page = context.pages()[0] || await context.newPage();
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
		await page.waitForTimeout(3000);
		const canvasBox = await page.locator("canvas").first().boundingBox();
		if (!canvasBox) throw new Error("Canvas not found");
		const startX = canvasBox.x + 1340;
		const startY = canvasBox.y + 570;
		const endX = canvasBox.x + 1145;
		const endY = canvasBox.y + 430;
		const captureAt = new Map(Array.from({ length: 10 }, (_, index) => {
			const percent = (index + 1) * 10;
			return [
				(index + 1) * 16,
				`gate3-motion-frame-${String(percent).padStart(3, "0")}pct.png`,
			];
		}));
		await page.mouse.move(startX, startY);
		await page.mouse.down();
		const startedAt = Date.now();
		for (let index = 1; index <= 160; index += 1) {
			const progress = index / 160;
			const eased = 0.5 - Math.cos(progress * Math.PI) * 0.5;
			await page.mouse.move(
				startX + (endX - startX) * eased,
				startY + (endY - startY) * eased + Math.sin(progress * Math.PI * 2) * 8,
			);
			await page.waitForTimeout(65);
			const fileName = captureAt.get(index);
			if (fileName) {
				await page.screenshot({
					path: `C:\\websites\\develope\\DigitalMonsterPRO\\.codex\\city-scene\\evidence\\${fileName}`,
				});
			}
		}
		await page.mouse.up();
		process.stdout.write(JSON.stringify({ motionDurationMs: Date.now() - startedAt }));
	} finally {
		await context.close();
	}
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
