/** Limit raster work without changing viewport, camera or texture coordinates.
 * RT scissor lives on the target so nested overlay setRenderTarget calls retain it. */
export function withRenderTargetBand(renderer, target, band, draw) {
	if (!target || !band || (band.min <= 0 && band.max >= 1)) return draw();
	const { x, y, z, w } = target.scissor;
	const enabled = target.scissorTest;
	const previous = renderer.getRenderTarget();
	const bottom = Math.floor(Math.max(0, band.min) * target.height);
	const top = Math.ceil(Math.min(1, band.max) * target.height);
	target.scissor.set(0, bottom, target.width, Math.max(0, top - bottom));
	target.scissorTest = true;
	try { return draw(); }
	finally {
		target.scissor.set(x, y, z, w);
		target.scissorTest = enabled;
		// Also restore native state if a nested pass returned to this same RT.
		renderer.setRenderTarget(previous);
	}
}
