import { getCasePanelHudState } from "@/portfolio/core/casePanelHudBridge.js";
import {
	isCasePanelHudRevealExiting,
	playCasePanelHudExit,
	releaseCasePanelHud,
} from "@/portfolio/core/casePanelHudReveal.js";
import { noteCaseEnterSourcePaths, noteCaseLeaveDestinationPaths, requestHexNavigation } from "@/utils/hexNavigation.js";
import { store } from "@/store.jsx";

function isPortfolioCasePath(path) {
	const normalized = String(path ?? "/").replace(/\/+$/, "") || "/";
	if (!normalized.startsWith("/portfolio/")) {
		return false;
	}
	const rest = normalized.slice("/portfolio/".length);
	return Boolean(rest) && !rest.includes("/");
}

/** Переход на страницу кейса (хаб, другой кейс, 3D, список). */
export function requestPortfolioCaseNavigation(targetPath, fromPath = null) {
	if (!targetPath || typeof targetPath !== "string") {
		return;
	}

	const from = fromPath ?? (typeof window !== "undefined" ? window.location.pathname : null);
	if (requestHexNavigation(targetPath, fromPath)) {
		return;
	}

	noteCaseEnterSourcePaths(from, targetPath);
	noteCaseLeaveDestinationPaths(from, targetPath);

	// Non-hex leave to non-case only: full HUD mosaic exit. Case→case keeps project nav.
	if (
		isPortfolioCasePath(from)
		&& !isPortfolioCasePath(targetPath)
		&& !isCasePanelHudRevealExiting()
	) {
		if (getCasePanelHudState().fromCanvas?.width) {
			playCasePanelHudExit({ mosaicScope: "full" });
		} else {
			releaseCasePanelHud();
		}
	}

	store.sceneCarouselNavigatePath = targetPath;
}
