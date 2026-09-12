import * as THREE from "three";

/** Dev-only asset export. Import through Vite, call, then save the returned Blob
 * as public/images/contacts/plate-finish.rgba.gz. Source is the adjacent SVG.
 * Read the uploaded texture directly: Canvas2D/PNG changes translucent edges. */
export async function exportContactsPlateFinish() {
	const renderer = new THREE.WebGLRenderer({ antialias: false });
	let texture, framebuffer;
	const gl = renderer.getContext();
	try {
		texture = await new THREE.TextureLoader().loadAsync("/images/contacts/plate-finish.svg");
		texture.colorSpace = THREE.SRGBColorSpace;
		renderer.initTexture(texture);
		if (texture.image.width !== 1024 || texture.image.height !== 1024) throw new Error("Expected 1024px artwork");
		framebuffer = gl.createFramebuffer();
		gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
		// Pinned r155 internal handle; this is offline export, never shipped runtime.
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D,
			renderer.properties.get(texture).__webglTexture, 0);
		if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("Texture readback unavailable");
		const data = new Uint8Array(1024 * 1024 * 4);
		gl.readPixels(0, 0, 1024, 1024, gl.RGBA, gl.UNSIGNED_BYTE, data);
		if (gl.getError() !== gl.NO_ERROR) throw new Error("Texture readback failed");
		return await new Response(new Blob([data]).stream().pipeThrough(new CompressionStream("gzip"))).blob();
	} finally {
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		if (framebuffer) gl.deleteFramebuffer(framebuffer);
		texture?.dispose(); renderer.dispose(); renderer.forceContextLoss();
	}
}
