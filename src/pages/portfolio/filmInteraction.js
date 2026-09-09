// Accessibility controls call the same scene actions as the WebGL raycast targets.
let activeHandler = null;
export function attachFilmActions(handler) {
	activeHandler = handler;
	return () => { if (activeHandler === handler) activeHandler = null; };
}
export function requestFilmAction(action) { activeHandler?.(action); }
