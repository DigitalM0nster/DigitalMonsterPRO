import { requestHexNavigation } from "@/utils/hexNavigation.js";
import { store } from "@/store.jsx";

/** Переход на страницу кейса (хаб, другой кейс, 3D, список). */
export function requestPortfolioCaseNavigation(targetPath, fromPath = null) {
	if (!targetPath || typeof targetPath !== "string") {
		return;
	}

	if (requestHexNavigation(targetPath, fromPath)) {
		return;
	}

	store.sceneCarouselNavigatePath = targetPath;
}
