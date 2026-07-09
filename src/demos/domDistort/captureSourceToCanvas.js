/**
 * Снимок текста из DOM → canvas 2D (прозрачный фон, только буквы).
 * Референс: .distortSampleTitle / .distortSampleText внутри sourceElement.
 */
export function captureSourceToCanvas(sourceElement) {
	const dpr = Math.min(2, window.devicePixelRatio || 1);
	const width = Math.max(320, sourceElement.offsetWidth || 560);
	const height = Math.max(120, sourceElement.offsetHeight || 220);

	const canvas = document.createElement("canvas");
	canvas.width = Math.floor(width * dpr);
	canvas.height = Math.floor(height * dpr);

	const ctx = canvas.getContext("2d");
	if (!ctx) {
		throw new Error("Canvas 2D недоступен");
	}

	ctx.scale(dpr, dpr);
	// Прозрачный фон — искажается только текст, подложка остаётся в CSS (.distortViewport)
	ctx.clearRect(0, 0, width, height);

	const drawLine = (el, yRatio) => {
		if (!el?.textContent?.trim()) return;

		const style = getComputedStyle(el);
		const fontSize = parseFloat(style.fontSize) || 32;
		const fontWeight = style.fontWeight || "700";
		const fontFamily = style.fontFamily || "sans-serif";
		const color = style.color || "#ffffff";

		ctx.fillStyle = color;
		ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillText(el.textContent.trim(), width / 2, height * yRatio);
	};

	drawLine(sourceElement.querySelector(".distortSampleTitle"), 0.42);
	drawLine(sourceElement.querySelector(".distortSampleText"), 0.62);

	return canvas;
}
