import * as THREE from "three";

const SYMBOLS = "0123456789ABCDEF<>/+=*#?[]";

function canvasTexture(canvas, name) {
	const texture = new THREE.CanvasTexture(canvas);
	texture.generateMipmaps = false;
	texture.minFilter = texture.magFilter = THREE.NearestFilter;
	texture.name = name;
	return texture;
}

function createSymbols(name) {
	const canvas = document.createElement("canvas");
	canvas.width = SYMBOLS.length * 40;
	canvas.height = 64;
	const ctx = canvas.getContext("2d");
	ctx.scale(2, 2);
	ctx.font = '500 16px ManifoldExtended, "Segoe UI", sans-serif';
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillStyle = "#ffffff";
	for (let i = 0; i < SYMBOLS.length; i++) ctx.fillText(SYMBOLS[i], i * 20 + 10, 16);
	return canvasTexture(canvas, `${name}-glitch-symbols`);
}

/** Paint once before Start. The small order map stores one scanline per text row. */
export function createSceneHudAtlas(pixelRatio, states, name, { width = 300, height = 200, rowCount = 3 } = {}) {
	const stateCount = states[0].length;
	const atlasWidth = width * 3;
	const canvas = document.createElement("canvas");
	canvas.width = Math.round(atlasWidth * pixelRatio);
	canvas.height = Math.round(stateCount * height * pixelRatio);
	const ctx = canvas.getContext("2d");
	ctx.scale(pixelRatio, pixelRatio);
	ctx.textBaseline = "middle";
	const orderData = new Uint8Array(atlasWidth * stateCount * rowCount * 4);
	for (let locale = 0; locale < 3; locale++) {
		for (let state = 0; state < stateCount; state++) {
			const rows = Array.from({ length: rowCount }, () => []);
			ctx.save();
			ctx.translate(locale * width, state * height);
			const text = (value, x, y, size, color, row = -1, align = "left", typography = {}) => {
				ctx.font = typography.font ?? `500 ${size}px ManifoldExtended, "Segoe UI", sans-serif`;
				ctx.fillStyle = color;
				const tracking = typography.tracking ?? (size >= 14 ? 1.4 : 1.1);
				const space = typography.space ?? size * 0.55;
				let cursor = x;
				if (align === "right") {
					cursor -= Array.from(value).reduce((width, char) => width
						+ (char === " " ? space : ctx.measureText(char).width + tracking), 0) - tracking;
				}
				for (const char of value) {
					if (char === " ") { cursor += space; continue; }
					const width = ctx.measureText(char).width;
					ctx.fillText(char, cursor, y);
					if (row >= 0) rows[row].push({ x: cursor, width, size, row });
					cursor += width + tracking;
				}
			};
			for (const line of states[locale][state]) {
				text(line.text, line.x, line.y, line.size, line.color, line.row ?? -1, line.align, line);
			}
			ctx.restore();
			// Alternate direction at each turn, including large multi-line headings.
			const glyphs = rows.flatMap((row, index) => index % 2 ? row.reverse() : row);
			glyphs.forEach((glyph, index) => {
				for (let x = Math.max(0, Math.floor(glyph.x)); x < Math.min(width, Math.ceil(glyph.x + glyph.width)); x++) {
					const offset = ((state * rowCount + glyph.row) * atlasWidth + locale * width + x) * 4;
					orderData[offset] = Math.round((index + 0.5) / glyphs.length * 255);
					orderData[offset + 1] = Math.round(THREE.MathUtils.clamp((x + 0.5 - glyph.x) / glyph.width, 0, 1) * 255);
					orderData[offset + 2] = glyph.size;
					orderData[offset + 3] = 255;
				}
			});
		}
	}
	const orderTexture = new THREE.DataTexture(orderData, atlasWidth, stateCount * rowCount);
	orderTexture.name = `${name}-letter-order`;
	orderTexture.needsUpdate = true;
	return {
		texture: canvasTexture(canvas, `${name}-atlas`),
		orderTexture, glyphTexture: createSymbols(name), glyphCount: SYMBOLS.length,
	};
}
