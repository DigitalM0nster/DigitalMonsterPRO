import { normalizeSitePath, requestHexNavigation } from "@/functions/hexNavigation.js";
import { publishSiteRouteTransition } from "@/three/render/transition/siteTransitionIntent.js";
import { store } from "@/app/store.jsx";
import { isPortfolioCasePath, isPortfolioHubPath } from "@/three/scenes/portfolio/hub/projectsData.js";

/**
 * Commit hub -> selected-case without a site transition. The selected case is
 * another state of the already-warmed portfolioHub scene, so URL/HTML catch up
 * immediately while the scene keeps ownership of the plate animation.
 */
export function commitPortfolioHubCaseRoute(targetPath, fromPath = null) {
	if (!targetPath || typeof targetPath !== "string") {
		return false;
	}

	const from = fromPath ?? (typeof window !== "undefined" ? window.location.pathname : null);
	if (normalizeSitePath(from) === normalizeSitePath(targetPath)) {
		return false;
	}

	store.sceneCarouselSkipHtmlExit = true;
	store.sceneCarouselNavigatePath = targetPath;
	return true;
}

/** Переход на страницу кейса (хаб, другой кейс, 3D, список). */
export function requestPortfolioCaseNavigation(targetPath, fromPath = null) {
	if (!targetPath || typeof targetPath !== "string") {
		return false;
	}

	const from = fromPath ?? (typeof window !== "undefined" ? window.location.pathname : null);
	if (
		isPortfolioCasePath(targetPath) &&
		(isPortfolioHubPath(from) || isPortfolioCasePath(from))
	) {
		return commitPortfolioHubCaseRoute(targetPath, from);
	}
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
