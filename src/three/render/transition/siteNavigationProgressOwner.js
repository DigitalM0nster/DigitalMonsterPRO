const NAVIGATION_REST_EPS = 1e-4;

/**
 * The active story runtime (About or a case) owns its painted/target progress.
 * SceneCarousel only drives the owner's existing values during a navigation
 * settle; it never creates a second story spring or rAF.
 *
 * @typedef {{
 *   id: string,
 *   sceneId: string,
 *   snapshot: () => null | {
 *     current: number,
 *     target: number,
 *     rest: number,
 *     restPath: string,
 *     restSceneId: string,
 *     routeChanged: boolean,
 *   },
 *   apply: (value: number, delta: number) => void,
 *   commit: () => void,
 * }} SiteNavigationProgressOwner
 */

/** @type {SiteNavigationProgressOwner | null} */
let activeOwner = null;

/**
 * @param {SiteNavigationProgressOwner} owner
 * @returns {() => void}
 */
export function registerSiteNavigationProgressOwner(owner) {
	activeOwner = owner;
	return () => {
		if (activeOwner === owner) {
			activeOwner = null;
		}
	};
}

/** @param {string} sourceSceneId */
export function getSiteNavigationProgressOwner(sourceSceneId) {
	return activeOwner?.sceneId === sourceSceneId ? activeOwner : null;
}

/**
 * Resolve the exact rest that the canonical segment spring has selected.
 * The decision is made from target; painted progress is only the animation start.
 */
export function resolveLocalSegmentRest(target) {
	if (target >= 0.5) return 1;
	if (target <= -0.5) return -1;
	return 0;
}

/** Resolve an About/case story target to its nearest integer/route-edge rest. */
export function resolveStoryRest(target, storyMax) {
	const value = Number.isFinite(target) ? target : 0;
	const max = Math.max(0, Number(storyMax) || 0);

	if (value < 0) {
		return resolveLocalSegmentRest(value);
	}
	if (value > max) {
		return max + Math.max(0, resolveLocalSegmentRest(value - max));
	}
	if (Math.abs(value - max) <= NAVIGATION_REST_EPS) {
		return max;
	}

	const segment = Math.floor(value + 1e-12);
	const local = value - segment;
	return Math.min(max, segment + (local >= 0.5 ? 1 : 0));
}

export function needsFastNavigationSettle(current, target, rest) {
	return (
		Math.abs(current - rest) > NAVIGATION_REST_EPS
		|| Math.abs(target - rest) > NAVIGATION_REST_EPS
	);
}
