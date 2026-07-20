import { getSceneCarousel } from "@/three/render/transition/carouselPage.js";
import { isCarouselRoutePage } from "./SceneCarousel.js";
import { isSceneDevToolsWheelTarget } from "../../dev/sceneDevPanelUtils.js";

/** Чувствительность колёсика: deltaY (px) → единицы progressTarget. */
export const CAROUSEL_WHEEL_PROGRESS_FACTOR = 0.001;
const LINE_HEIGHT_PX = 16;

function normalizeWheelDelta(event) {
	let delta = event.deltaY;
	if (event.deltaMode === 1) {
		delta *= LINE_HEIGHT_PX;
	} else if (event.deltaMode === 2) {
		delta *= window.innerHeight;
	}
	return delta;
}

/**
 * Передаёт уже нормализованный wheel delta (в CSS px) напрямую карусели.
 * Используется внутренними scroll-сценами на первой/последней границе.
 */
export function addCarouselWheelDelta(deltaPixels) {
	if (!Number.isFinite(deltaPixels) || deltaPixels === 0) {
		return false;
	}

	getSceneCarousel().addScrollDelta(deltaPixels * CAROUSEL_WHEEL_PROGRESS_FACTOR);
	return true;
}

/** Не перехватывать wheel над прокручиваемым HTML-блоком (список портфолио и т.п.). */
function isOverScrollableElement(target) {
	let el = target;
	while (el instanceof Element) {
		const style = window.getComputedStyle(el);
		const overflowY = style.overflowY;
		if ((overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight + 1) {
			return true;
		}
		el = el.parentElement;
	}
	return false;
}

/**
 * @param {{ getCurrentPage: () => string, getStore: () => { appStarted?: boolean, openedCase?: boolean } }} ctx
 */
export function shouldCarouselScrollWheel(ctx, event) {
	if (isSceneDevToolsWheelTarget(event)) {
		return false;
	}
	if (isOverScrollableElement(event.target)) {
		return false;
	}

	const store = ctx.getStore();
	if (!store.appStarted || store.openedCase) {
		return false;
	}

	const carousel = getSceneCarousel();
	if (carousel.currentId === "about" || carousel.isInteractionLocked()) {
		return false;
	}

	const page = ctx.getCurrentPage();
	return isCarouselRoutePage(page);
}

/**
 * Wheel → progressTarget карусели.
 * @param {{ getCurrentPage: () => string, getStore: () => object }} ctx
 */
export function attachCarouselScroll(ctx) {
	const onWheel = (event) => {
		if (!shouldCarouselScrollWheel(ctx, event)) {
			return;
		}

		if (Math.abs(event.deltaY) < Math.abs(event.deltaX)) {
			return;
		}

		event.preventDefault();

		addCarouselWheelDelta(normalizeWheelDelta(event));
	};

	window.addEventListener("wheel", onWheel, { passive: false, capture: true });

	return () => {
		window.removeEventListener("wheel", onWheel, { capture: true });
	};
}
