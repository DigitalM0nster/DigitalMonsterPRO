import { siteArcRuntime } from "./siteArcConfig.js";

let source = null;

export function setSiteArcNavigationSource(nextSource) {
	// Never reset focus/select motion when the data source changes. This is one
	// persistent chrome component: site → capabilities → cases must inherit the
	// exact painted orbit angle and animate the new active node into the centre.
	// Resetting here turned a route commit into a one-frame arc snap.
	source = nextSource?.items?.length ? nextSource : null;
	if (source) {
		siteArcRuntime.introRotationDeg = 0;
		siteArcRuntime.introOpacity = 1;
	}
}

export function getSiteArcNavigationSource() {
	return source;
}

export function isSiteArcNavigationActive() {
	return Boolean(source?.items?.length);
}
