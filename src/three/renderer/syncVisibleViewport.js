/**
 * Safari's 100vh includes collapsed browser bars, while scene layouts and input
 * use innerHeight. Give the DOM host exactly that same logical viewport before
 * sizing the renderer; never infer camera dimensions from the oversized host.
 * visualViewport is only an event source: its dimensions shrink during pinch
 * zoom, which must not reframe the 3D scene or allocate a new set of targets.
 */
export function syncVisibleViewport(environment = window) {
	const width = Math.round(environment.innerWidth);
	const height = Math.round(environment.innerHeight);
	if (!(width > 0 && height > 0)) return null;
	const style = environment.document.documentElement.style;
	for (const [name, value] of [["--site-viewport-width", width], ["--site-viewport-height", height]]) {
		const pixels = `${value}px`;
		if (style.getPropertyValue(name) !== pixels) style.setProperty(name, pixels);
	}
	return { width, height };
}
