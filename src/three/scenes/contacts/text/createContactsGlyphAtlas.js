import * as THREE from "three";
import { drawGlitchTextLine } from "@/components/GlitchText/drawGlitchText.js";
import { getGlitchDrawProfile } from "@/components/GlitchText/glitchTextDrawProfiles.js";
import { getSnakeLength } from "@/components/GlitchText/glitchSnakeEngine.js";

/** Preserve the existing HUD bitmap scale, baseline and subpixel letter positions. */
export async function createContactsGlyphAtlas(slots, cfg) {
	const profile = getGlitchDrawProfile("hud");
	const style = { fontSize: 28, fontWeight: 500, letterSpacing: 0, ...cfg,
		fontFamily: cfg.fontFamily ?? profile.mainFontFamily, color: "#ffffff",
		drawProfile: "hud", replacementGlowStrength: 0, replacementFullOpacity: true };
	await document.fonts.load(`${profile.replacementFontWeight} ${style.fontSize}px ${profile.replacementFontFamily}`);
	const width = cfg.stableCanvasWidth, height = cfg.stableCanvasHeight;
	const ctx = document.createElement("canvas").getContext("2d");
	ctx.font = `${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`;
	const letters = slots.filter(slot => !slot.isSpace), length = getSnakeLength(letters.length);
	const tiles = [];
	let cursor = cfg.paddingLeft ?? 24, atlasWidth = 0, index = 0;
	for (const slot of slots) {
		if (slot.isSpace) { cursor += style.fontSize * 0.35; continue; }
		if (slot.replacements.length > 3) throw new Error("Contacts atlas supports up to three symbols per letter");
		const charWidth = ctx.measureText(slot.char).width;
		const left = Math.max(0, Math.floor(cursor - style.fontSize));
		const right = Math.min(width, Math.ceil(cursor + charWidth + style.fontSize));
		tiles.push({ slot, left, width: right - left, x: atlasWidth, cursor, index: index++ });
		atlasWidth += right - left;
		cursor += charWidth + style.fontSize * style.letterSpacing;
	}
	const canvas = document.createElement("canvas");
	canvas.width = atlasWidth; canvas.height = height * 4;
	const draw = canvas.getContext("2d");
	let sliceStart = performance.now();
	for (const tile of tiles) {
		for (let frame = 0; frame <= tile.slot.replacements.length; frame++) {
			draw.save(); draw.beginPath(); draw.rect(tile.x, frame * height, tile.width, height); draw.clip();
			const slot = { ...tile.slot, appearPending: frame > 0, mainAlpha: 1,
				visibleCounts: tile.slot.replacements.map((_, i) => Number(i === frame - 1)) };
			drawGlitchTextLine(draw, [slot], tile.x + tile.cursor - tile.left, frame * height + (cfg.paddingTop ?? 12), style, { clear: false });
			draw.restore();
			if (performance.now() - sliceStart >= 3) {
				await new Promise(resolve => requestAnimationFrame(resolve));
				sliceStart = performance.now();
			}
		}
	}
	const texture = new THREE.CanvasTexture(canvas);
	texture.name = `Contacts ${cfg.text} prepared glyphs`;
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.minFilter = texture.magFilter = THREE.LinearFilter;
	texture.generateMipmaps = false;
	const geometry = new THREE.InstancedBufferGeometry();
	geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], 3));
	geometry.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
	geometry.setIndex([0, 1, 2, 0, 2, 3]);
	geometry.setAttribute("aRect", new THREE.InstancedBufferAttribute(new Float32Array(tiles.flatMap(t => [t.left, 0, t.width, height])), 4));
	geometry.setAttribute("aAtlasRect", new THREE.InstancedBufferAttribute(new Float32Array(tiles.flatMap(t => [t.x / atlasWidth, 0.75, t.width / atlasWidth, 0.25])), 4));
	geometry.setAttribute("aLetter", new THREE.InstancedBufferAttribute(new Float32Array(tiles.flatMap(t => [Math.floor(t.index / length), t.index % length, t.slot.replacements.length])), 3));
	geometry.instanceCount = tiles.length;
	return { texture, geometry, width, height };
}
