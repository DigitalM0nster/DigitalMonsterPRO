/**
 * Shared pending project-nav chrome (prev/next names) for case→case transitions.
 * Used by HUD click and case-boundary scroll so chrome can snake before remount.
 */

/** @type {null | { projectId: string, route: string, data: object }} */
let pending = null;

/** @type {Set<() => void>} */
const listeners = new Set();

function notify() {
	for (const listener of listeners) {
		listener();
	}
}

/**
 * @param {null | { projectId: string, route: string, data: object }} entry
 */
export function setPendingCaseChromeNav(entry) {
	const next = entry ?? null;
	// Boundary scroll calls this every spring tick — only notify on real change
	// or painters force-repaint the HUD every frame (CPU spike).
	if (
		pending === next
		|| (
			pending
			&& next
			&& pending.projectId === next.projectId
			&& pending.route === next.route
		)
	) {
		pending = next;
		return;
	}
	pending = next;
	notify();
}

export function getPendingCaseChromeNav() {
	return pending;
}

/** @param {string | null | undefined} projectId */
export function clearPendingCaseChromeNavIfMatch(projectId) {
	if (pending && projectId != null && pending.projectId === projectId) {
		pending = null;
		notify();
	}
}

/** @param {() => void} listener */
export function subscribePendingCaseChromeNav(listener) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}
