import * as THREE from "three";

/** Offline vector atlas, owned by the Medium services line and loaded before Start. */
export async function loadHeroStackMsdf() {
	const base = `${import.meta.env.BASE_URL}fonts/Jura/msdf/jura-600`;
	const response = await fetch(`${base}.json`);
	if (!response.ok) throw new Error(`Home MSDF metrics: HTTP ${response.status}`);
	const data = await response.json();
	const texture = await new THREE.TextureLoader().loadAsync(`${base}.png`);
	texture.name = "Home services Jura 600 MSDF";
	// RGB stores distances, not display colours. Never apply an sRGB conversion.
	texture.colorSpace = THREE.NoColorSpace;
	texture.generateMipmaps = false;
	texture.minFilter = texture.magFilter = THREE.LinearFilter;
	return { texture, ...data, glyphMap: new Map(data.glyphs.map(g => [g.unicode, g])) };
}

/** Map vector plane bounds into the existing bitmap tile; both modes share layout. */
export function heroMsdfRects(msdf, char, { left, baseline, width, height, fontSize }) {
	const glyph = msdf.glyphMap.get(char.codePointAt(0));
	if (!glyph?.planeBounds) return null;
	const p = glyph.planeBounds, a = glyph.atlasBounds;
	return {
		plane: [(left + p.left * fontSize) / width, (height - baseline + p.bottom * fontSize) / height,
			(p.right - p.left) * fontSize / width, (p.top - p.bottom) * fontSize / height],
		atlas: [a.left / msdf.atlas.width, a.bottom / msdf.atlas.height,
			(a.right - a.left) / msdf.atlas.width, (a.top - a.bottom) / msdf.atlas.height],
	};
}
