/**
 * Состояние открытия кейса на плите хаба (новая версия case UI).
 * Прогресс красит Three; React только читает и шлёт запросы.
 */
import { store } from "@/app/store.jsx";

export function getHubPlateCaseState() {
	return store.portfolioPlateCase;
}

/** Клик по плите / списку → открыть кейс на плите (без hex на legacy case). */
export function requestHubPlateCaseOpen(projectIndex) {
	const index = Number(projectIndex);
	if (!Number.isInteger(index) || index < 0) {
		return;
	}
	const state = store.portfolioPlateCase;
	state.requestOpenIndex = index;
	state.requestClose = false;
}

export function requestHubPlateCaseClose() {
	const state = store.portfolioPlateCase;
	if (!state.open && state.progress < 0.001) {
		return;
	}
	state.requestClose = true;
	state.requestOpenIndex = null;
}

export function requestHubPlateCaseSwitch(projectIndex) {
	const index = Number(projectIndex);
	if (!Number.isInteger(index) || index < 0) {
		return;
	}
	const state = store.portfolioPlateCase;
	if (!state.open && state.progress < 0.001) {
		requestHubPlateCaseOpen(index);
		return;
	}
	state.requestOpenIndex = index;
}

export function setHubPlateCaseGalleryIndex(galleryIndex) {
	const state = store.portfolioPlateCase;
	const next = Math.max(0, Math.floor(Number(galleryIndex) || 0));
	if (state.galleryIndex === next) {
		return;
	}
	state.galleryIndex = next;
}

/** Вызывается из PortfolioHubScene каждый кадр. */
export function syncHubPlateCaseFromScene({
	open,
	projectIndex,
	progress,
}) {
	const state = store.portfolioPlateCase;
	state.open = Boolean(open);
	state.projectIndex = Number.isInteger(projectIndex) ? projectIndex : -1;
	state.progress = Math.max(0, Math.min(1, Number(progress) || 0));
}

export function setHubPlateCaseColumnMotion({ progress, target }) {
	const state = store.portfolioPlateCase;
	state.columnProgress = Math.max(-1.5, Math.min(1.5, Number(progress) || 0));
	state.columnTarget = Math.max(-1.5, Math.min(1.5, Number(target) || 0));
}

export function resetHubPlateCaseColumnMotion() {
	setHubPlateCaseColumnMotion({ progress: 0, target: 0 });
}

export function consumeHubPlateCaseOpenRequest() {
	const state = store.portfolioPlateCase;
	const index = state.requestOpenIndex;
	state.requestOpenIndex = null;
	return Number.isInteger(index) ? index : null;
}

export function consumeHubPlateCaseCloseRequest() {
	const state = store.portfolioPlateCase;
	if (!state.requestClose) {
		return false;
	}
	state.requestClose = false;
	return true;
}
