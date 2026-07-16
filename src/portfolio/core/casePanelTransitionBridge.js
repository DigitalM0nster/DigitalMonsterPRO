/**
 * Legacy bridge for case UI hex overlay snapshots.
 * Bake path removed — case leave/enter uses live arc snake + GPU HUD mosaic.
 * Kept so old imports fail loudly if reintroduced; do not set a canvas here.
 */
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
