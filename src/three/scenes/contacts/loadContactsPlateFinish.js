import { DataTexture, LinearFilter, LinearMipmapLinearFilter, TextureLoader } from "three";

const SIZE = 1024;
const BYTE_LENGTH = SIZE * SIZE * 4;

/** Lossless GPU-ready pixels preserve the original SVG's translucent edges.
 * Rows already follow GPU texture orientation; do not flip or premultiply again.
 * Original SVG is the compatibility/network-failure fallback. */
export async function loadContactsPlateFinish(svgUrl) {
	if (typeof DecompressionStream === "function") {
		try {
			const response = await fetch("/images/contacts/plate-finish.rgba.gz");
			if (!response.ok) throw new Error("Prepared plate texture is unavailable");
			let bytes = await response.arrayBuffer();
			// Some hosts serve .gz with Content-Encoding and fetch already decodes it.
			if (bytes.byteLength !== BYTE_LENGTH) {
				bytes = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
			}
			if (bytes.byteLength !== BYTE_LENGTH) throw new Error("Invalid prepared plate texture size");
			const texture = new DataTexture(new Uint8Array(bytes), SIZE, SIZE);
			texture.flipY = false;
			texture.generateMipmaps = true;
			texture.minFilter = LinearMipmapLinearFilter;
			texture.magFilter = LinearFilter;
			texture.needsUpdate = true;
			return texture;
		} catch {
			// Keep the original artwork available on older or restricted hosts.
		}
	}
	return new TextureLoader().loadAsync(svgUrl);
}
