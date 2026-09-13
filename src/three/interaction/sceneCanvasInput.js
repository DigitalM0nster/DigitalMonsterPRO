const interfaces = new Set();
export function registerSceneCanvasInput(ui) { interfaces.add(ui); return () => interfaces.delete(ui); }

/** Coordinate ownership is shared with early capture listeners, regardless of registration order. */
export function sceneCanvasOwnsInput(event, modalOnly = false) {
	const point = event.touches?.[0] ?? event.changedTouches?.[0] ?? event;
	for (const ui of interfaces) {
		if (!ui.owns({ target: event.target, clientY: point.clientY ?? ui.height / 2 })) continue;
		if (ui.reading || ui.projectsOpen) return true;
		if (!modalOnly && !ui.allowSiteSwipe && ui.hit(point.clientX, point.clientY)) return true;
	}
	return false;
}
