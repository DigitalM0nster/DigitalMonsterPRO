// Accessibility controls call the same scene actions as the WebGL raycast targets.
let activeHandler = null;
export function attachFilmActions(handler) {
	activeHandler = handler;
	return () => { if (activeHandler === handler) activeHandler = null; };
}
export function requestFilmAction(action) { activeHandler?.(action); }

let snapshot = { index: 0, playing: false, progress: 0, muted: true, volume: 0, focused: false, seekable: false };
const listeners = new Set();
export const getFilmUiSnapshot = () => snapshot;
export function subscribeFilmUi(listener) { listeners.add(listener); return () => listeners.delete(listener); }
export function publishFilmUi(next) {
	if (Object.keys(next).every(key => next[key] === snapshot[key])) return;
	snapshot = next;
	for (const listener of listeners) listener();
}

// Persistent DOM hit/reading surface follows the scene, including before route commit.
let infoView = null;
let infoFrame = { opacity: 0 };
export function attachFilmInfoView(view) {
	infoView = view;
	view(infoFrame);
	return () => { if (infoView === view) infoView = null; };
}
export function updateFilmInfoView(frame) { infoFrame = frame; infoView?.(frame); }
