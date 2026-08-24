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
	try {
		await page.goto("http://127.0.0.1:4184/capabilities/spatial-matrix", { waitUntil: "domcontentloaded", timeout: 30000 });
		const cityPage = page.locator('[data-capability-id="spatial-matrix"]');
		if (!await cityPage.isVisible().catch(() => false)) {
			const english = page.getByRole("button", { name: "ENGLISH", exact: true });
			await english.waitFor({ state: "visible", timeout: 150000 });
			await english.click();
		}
		await cityPage.waitFor({ state: "visible", timeout: 120000 });
		await page.waitForTimeout(1500);
		const canvas = page.locator("canvas").first();
		const box = await canvas.boundingBox();
		if (!box) throw new Error("canvas bounding box unavailable");
		await page.mouse.move(box.x + 1320, box.y + 560);
		await page.mouse.down();
		await page.mouse.move(box.x + 1180, box.y + 420, { steps: 36 });
		await page.mouse.up();
		await page.waitForTimeout(1200);
		await page.screenshot({ path: "C:\\websites\\develope\\DigitalMonsterPRO\\.codex\\city-scene\\evidence\\gate2-correction1-road-oblique-1920x945-dpr1.png" });
		process.stdout.write(JSON.stringify({ viewport: [await page.evaluate(() => innerWidth), await page.evaluate(() => innerHeight)], dpr: await page.evaluate(() => devicePixelRatio) }));
	} finally {
		await context.close();
	}
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
