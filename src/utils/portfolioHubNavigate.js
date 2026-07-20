import { normalizeSitePath, requestHexNavigation } from "@/utils/hexNavigation.js";
import { publishSiteRouteTransition } from "@/three/render/transition/siteTransitionIntent.js";
import { store } from "@/store.jsx";

/** Переход на страницу кейса (хаб, другой кейс, 3D, список). */
export function requestPortfolioCaseNavigation(targetPath, fromPath = null) {
	if (!targetPath || typeof targetPath !== "string") {
		return false;
	}

	const from = fromPath ?? (typeof window !== "undefined" ? window.location.pathname : null);
	if (requestHexNavigation(targetPath, fromPath)) {
		return true;
	}
	if (normalizeSitePath(from) === normalizeSitePath(targetPath)) {
		return false;
	}

	// Non-hex fallback — still one leave decision publisher (SITE_TRANSITION.md).
	publishSiteRouteTransition(from, targetPath, { mode: "html-fallback" });
	store.sceneCarouselNavigatePath = targetPath;
	return true;
}
