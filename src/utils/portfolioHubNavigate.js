import { requestHexNavigation } from "@/utils/hexNavigation.js";
import { publishSiteRouteTransition } from "@/three/render/transition/siteTransitionIntent.js";
import { store } from "@/store.jsx";

/** Переход на страницу кейса (хаб, другой кейс, 3D, список). */
export function requestPortfolioCaseNavigation(targetPath, fromPath = null) {
	if (!targetPath || typeof targetPath !== "string") {
		return;
	}

	const from = fromPath ?? (typeof window !== "undefined" ? window.location.pathname : null);
	if (requestHexNavigation(targetPath, fromPath)) {
		return;
	}

	// Non-hex fallback — still one leave decision publisher (SITE_TRANSITION.md).
	publishSiteRouteTransition(from, targetPath, { mode: "html-fallback" });
	store.sceneCarouselNavigatePath = targetPath;
}
