/**
 * Vite DEV only: skip the honest full preloader warm so Start unlocks faster.
 * Production builds always warm fully.
 *
 * Source of truth / REMOVE reminder: `src/config/devFlags.js` (`DEV_FAST_PRELOADER`).
 * Escape hatch while flag is on: `?fullWarm=1`
 */
import { DEV_FAST_PRELOADER } from "../config/devFlags.js";

export function isDevFastPreloader() {
	if (!import.meta.env.DEV || !DEV_FAST_PRELOADER) {
		return false;
	}
	if (typeof window === "undefined") {
		return true;
	}
	try {
		const params = new URLSearchParams(window.location.search);
		if (!params.has("fullWarm")) {
			return true;
		}
		const value = params.get("fullWarm");
		return value === "0" || value === "false";
	} catch {
		return true;
	}
}
