const { chromium } = require("playwright");

(async () => {
	const userDataDir = "C:\\Users\\psych\\AppData\\Local\\Temp\\dm-city-gate0-video";
	const context = await chromium.launchPersistentContext(userDataDir, {
		headless: true,
		executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
		viewport: { width: 1920, height: 945 },
		deviceScaleFactor: 1,
		args: ["--autoplay-policy=no-user-gesture-required"],
	});
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
			const canvas = document.querySelector("canvas");
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
		await page.screenshot({
			path: "C:\\websites\\develope\\DigitalMonsterPRO\\.codex\\city-scene\\evidence\\gate1-correction1-blockout-city-exact-1920x945-dpr1.png",
		});
		process.stdout.write(JSON.stringify({ runtime, consoleErrors }));
	} finally {
		await context.close();
	}
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
