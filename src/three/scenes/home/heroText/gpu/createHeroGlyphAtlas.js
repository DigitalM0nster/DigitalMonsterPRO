import * as THREE from "three";
import { heroMsdfRects } from "./heroStackMsdf.js";
import { getGraphicsTier } from "@/functions/getGraphicsTier.js";
import { createGlitchTextSlots } from "@/components/GlitchText/glitchLetterModel.js";
import { getSnakeLength } from "@/components/GlitchText/glitchSnakeEngine.js";
import { drawGlitchTextLine } from "@/components/GlitchText/drawGlitchText.js";
import { heroTextGlitchConfig, resolveHeroReplacementMetrics, resolveHeroReplacementDisplayChar } from "../heroTextGlitchConfig.js";

/** Cache compact glyph/replacement tiles, not full-panel animation frames. */
export async function createHeroGlyphAtlas(renderer, copies, style, cancelled = () => false) {
	await Promise.all([...copies.map(copy => document.fonts.load(`${style.fontWeight} ${style.fontSize}px ${copy.fontFamily}`, copy.text.join(""))),
		document.fonts.load(`${heroTextGlitchConfig.replacementFontWeight} ${style.fontSize}px ${heroTextGlitchConfig.replacementFontFamily}`)]);
	if (cancelled()) return null;
	// Prepare crisp text independently of the DPR-1 scene, without larger scene RTs.
	const dpr = getGraphicsTier() === "medium" ? 2 : renderer.getPixelRatio();
	const measure = document.createElement("canvas").getContext("2d");
	const tiles = new Map(), instances = [], variants = [];
	const pad = style.pad ?? Math.ceil(Math.max(8, style.fontSize * 0.4));
	const tileSize = style.fontSize * 1.5 + pad * 2;
	const tileWidth = style.nativeSmallGlyphs ? Math.ceil(tileSize) * dpr : Math.ceil(tileSize * dpr);
	const tileHeight = tileWidth;
	const glyphLeft = width => style.nativeSmallGlyphs
		? Math.round(tileWidth / dpr / 2 - width / 2) : tileWidth / dpr / 2 - width / 2;
	const replacementMetrics = style.snakeProfile?.resolveReplacementMetrics ?? resolveHeroReplacementMetrics;
	const replacementDisplay = style.snakeProfile?.resolveReplacementDisplayChar ?? resolveHeroReplacementDisplayChar;
	let lineId = 0;
	for (let locale = 0; locale < copies.length; locale++) {
		const copy = copies[locale], lines = [];
		measure.font = `${style.fontWeight} ${style.fontSize}px ${copy.fontFamily}`;
		measure.textBaseline = "alphabetic";
		const alphabeticAscent = measure.measureText("H").actualBoundingBoxAscent;
		measure.textBaseline = "top";
		const baseline = pad + alphabeticAscent - measure.measureText("H").actualBoundingBoxAscent;
		copy.text.forEach((text, row) => {
			const slots = createGlitchTextSlots(text.trim(), false);
			const letterCount = slots.filter(slot => !slot.isSpace).length, length = getSnakeLength(letterCount);
			let x = 0, index = 0, lastCount = 0;
			for (const slot of slots) {
				if (slot.isSpace) { x += style.fontSize * 0.35; continue; }
				const width = measure.measureText(slot.char).width;
				if (slot.replacements.length > 3) throw new Error("Home GPU snake supports up to three replacements per letter");
				const key = `glyph:${copy.fontFamily}:${slot.char}`;
				const getTile = (tileKey, frame) => {
					if (!tiles.has(tileKey)) tiles.set(tileKey, { slot, frame, width, baseline, locale: copy.key, fontFamily: copy.fontFamily, w: tileWidth, h: tileHeight });
					return tiles.get(tileKey);
				};
				const tile = getTile(key, 0);
				// Share replacement tiles across letters/locales with the same glyph and metrics.
				const metrics = JSON.stringify(replacementMetrics(slot.char));
				const symbols = slot.replacements.map((symbol, i) => getTile(`symbol:${replacementDisplay(symbol, slot.char)}:${metrics}`, i + 1));
				instances.push({ tile, symbols, rect: [x - glyphLeft(width), (style.inset ?? 0) + row * style.lineHeight - pad, tile.w / dpr, tile.h / dpr],
					data: [locale, lineId, Math.floor(index / length), index % length], count: slot.replacements.length });
				x += width + style.fontSize * (style.letterSpacing ?? 0);
				index++; lastCount = slot.replacements.length;
			}
			lines.push({ id: lineId++, lastWave: Math.floor(Math.max(0, index - 1) / length),
				lastIndex: Math.max(0, index - 1) % length, lastCount });
		});
		variants.push({ ...copy, lines });
	}
	const maxWidth = Math.min(renderer.capabilities.maxTextureSize, 2048);
	let x = 0, y = 0, rowHeight = 0;
	for (const tile of tiles.values()) {
		if (tile.w > maxWidth) throw new Error("Hero glyph exceeds texture width");
		if (x + tile.w > maxWidth) { x = 0; y += rowHeight; rowHeight = 0; }
		tile.x = x; tile.y = y; x += tile.w; rowHeight = Math.max(rowHeight, tile.h);
	}
	const canvas = document.createElement("canvas");
	canvas.width = maxWidth; canvas.height = Math.max(1, y + rowHeight);
	if (canvas.height > renderer.capabilities.maxTextureSize) throw new Error("Hero glyph atlas exceeds texture height");
	const ctx = canvas.getContext("2d", { alpha: true });
	// Native-size clean glyphs retain browser font hinting at DPR 1. Copy exact
	// pixel blocks into the existing 2x atlas; animated replacement tiles stay 2x.
	const nativeCanvas = style.nativeSmallGlyphs ? document.createElement("canvas") : null;
	if (nativeCanvas) { nativeCanvas.width = tileWidth / dpr; nativeCanvas.height = tileHeight / dpr; }
	const nativeContext = nativeCanvas?.getContext("2d", { alpha: true });
	let sliceStart = performance.now();
	for (const tile of tiles.values()) {
		const frame = tile.frame, drawX = glyphLeft(tile.width);
		ctx.save(); ctx.translate(tile.x, tile.y); ctx.scale(dpr, dpr);
		const painter = frame === 0 && nativeContext ? nativeContext : ctx;
		if (painter === nativeContext) painter.clearRect(0, 0, nativeCanvas.width, nativeCanvas.height);
		const slot = { ...tile.slot, appearPending: frame > 0,
			visibleCounts: tile.slot.replacements.map((_, i) => Number(i === frame - 1)) };
		if (frame === 0 && style.mainGlow) {
			ctx.font = `${style.fontWeight} ${style.fontSize}px ${tile.fontFamily}`;
			ctx.textBaseline = "top"; ctx.shadowColor = style.mainGlow.color; ctx.shadowBlur = style.mainGlow.blur;
			ctx.fillStyle = style.color;
			ctx.globalAlpha = Math.min(1, 0.45 + style.mainGlow.strength * 0.12);
			for (let pass = 0; pass < Math.min(5, Math.ceil(style.mainGlow.strength)); pass++) ctx.fillText(slot.char, drawX, pad);
			ctx.shadowBlur = 0; ctx.globalAlpha = 1;
		}
		drawGlitchTextLine(painter, [slot], drawX, pad, { ...style, fontFamily: tile.fontFamily, drawProfile: "hero" }, { clear: false });
		if (painter === nativeContext) { ctx.imageSmoothingEnabled = false; ctx.drawImage(nativeCanvas, 0, 0); }
		ctx.restore();
		if (performance.now() - sliceStart >= 3) {
			await new Promise(resolve => requestAnimationFrame(resolve));
			if (cancelled()) return null;
			sliceStart = performance.now();
		}
	}
	const texture = new THREE.CanvasTexture(canvas);
	texture.name = `Home ${style.name} glyph atlas`;
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.generateMipmaps = false;
	texture.minFilter = texture.magFilter = THREE.LinearFilter;
	const geometry = new THREE.InstancedBufferGeometry();
	geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], 3));
	geometry.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
	geometry.setIndex([0, 1, 2, 0, 2, 3]);
	if (style.decoration) instances.push({ rect: [0, style.fontSize * 0.12 - 1, 1, 2], data: [-1, 0, 0, 0], count: 0 });
	const rects = [], atlasRects = [], symbolRects = [[], [], []], data = [], counts = [];
	const msdfPlanes = [], msdfAtlasRects = [];
	const uvRect = t => t ? [t.x / canvas.width, 1 - (t.y + t.h) / canvas.height, t.w / canvas.width, t.h / canvas.height] : [0, 0, 0, 0];
	for (const instance of instances) {
		rects.push(...instance.rect); data.push(...instance.data); counts.push(instance.count);
		atlasRects.push(...uvRect(instance.tile));
		for (let i = 0; i < 3; i++) symbolRects[i].push(...uvRect(instance.symbols?.[i]));
		if (style.msdf) {
			const tile = instance.tile;
			// Chinese retains the prepared system-font raster for this bounded trial.
			const bounds = tile && tile.locale !== "zh" ? heroMsdfRects(style.msdf, tile.slot.char, {
				left: glyphLeft(tile.width), baseline: tile.baseline,
				width: tile.w / dpr, height: tile.h / dpr, fontSize: style.fontSize,
			}) : null;
			msdfPlanes.push(...(bounds?.plane ?? [0, 0, 0, 0]));
			msdfAtlasRects.push(...(bounds?.atlas ?? [0, 0, 0, 0]));
		}
	}
	geometry.setAttribute("aRect", new THREE.InstancedBufferAttribute(new Float32Array(rects), 4));
	geometry.setAttribute("aAtlasRect", new THREE.InstancedBufferAttribute(new Float32Array(atlasRects), 4));
	symbolRects.forEach((rect, i) => geometry.setAttribute(`aSymbolRect${i}`, new THREE.InstancedBufferAttribute(new Float32Array(rect), 4)));
	geometry.setAttribute("aLetter", new THREE.InstancedBufferAttribute(new Float32Array(data), 4));
	geometry.setAttribute("aSymbols", new THREE.InstancedBufferAttribute(new Float32Array(counts), 1));
	if (style.msdf) {
		geometry.setAttribute("aMsdfPlane", new THREE.InstancedBufferAttribute(new Float32Array(msdfPlanes), 4));
		geometry.setAttribute("aMsdfAtlas", new THREE.InstancedBufferAttribute(new Float32Array(msdfAtlasRects), 4));
	}
	geometry.instanceCount = instances.length;
	return { texture, geometry, variants, lineCount: lineId, pad, width: canvas.width, height: canvas.height };
}
