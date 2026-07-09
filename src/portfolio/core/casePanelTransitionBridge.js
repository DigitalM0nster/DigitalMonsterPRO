let snapshotCanvas = null;
let revision = 0;

export function setCasePanelTransitionCanvas(canvas) {
	snapshotCanvas = canvas ?? null;
	revision += 1;
}

export function clearCasePanelTransitionCanvas() {
	if (!snapshotCanvas) {
		return;
	}
	snapshotCanvas = null;
	revision += 1;
}

export function getCasePanelTransitionCanvasState() {
	return { canvas: snapshotCanvas, revision };
}
