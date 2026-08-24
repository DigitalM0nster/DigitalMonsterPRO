const { chromium } = require("playwright");
const path = require("path");
const { pathToFileURL } = require("url");

(async () => {
	const browser = await chromium.launch({
		headless: true,
		executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
		args: ["--autoplay-policy=no-user-gesture-required"],
	});
	try {
		const page = await browser.newPage({ viewport: { width: 1920, height: 945 }, deviceScaleFactor: 1 });
		const videoPath = path.resolve("C:\\websites\\develope\\DigitalMonsterPRO\\.codex\\city-scene\\evidence\\gate0-slow-camera-1920x945-dpr1.webm");
		await page.goto(pathToFileURL(videoPath).href, { waitUntil: "load", timeout: 30000 });
		await page.waitForFunction(() => {
			const video = document.querySelector("video");
			return video && Number.isFinite(video.duration) && video.duration > 0;
		}, null, { timeout: 30000 });
		const duration = await page.locator("video").evaluate((video) => video.duration);
		const frameTimes = [3, 12, 21, 30, 39, 42, 45, 48, 51, 54, 57];
		for (const seconds of frameTimes) {
			if (seconds >= duration) continue;
			await page.locator("video").evaluate((video, time) => new Promise((resolve, reject) => {
				const timeout = setTimeout(() => reject(new Error(`seek timeout ${time}`)), 10000);
				video.addEventListener("seeked", () => {
					clearTimeout(timeout);
					resolve();
				}, { once: true });
				video.currentTime = time;
			}), seconds);
			await page.screenshot({
				path: `C:\\websites\\develope\\DigitalMonsterPRO\\.codex\\city-scene\\evidence\\gate0-motion-${String(seconds).padStart(2, "0")}s.png`,
			});
		}
		process.stdout.write(JSON.stringify({ duration, frames: frameTimes.filter((t) => t < duration) }));
	} finally {
		await browser.close();
	}
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
