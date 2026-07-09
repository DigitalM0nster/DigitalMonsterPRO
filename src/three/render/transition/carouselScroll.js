import { isSceneDevToolsWheelTarget } from "@/three/dev/sceneDevPanelUtils.js";
import { getSceneCarousel } from "./carouselPage.js";
import { isCarouselRoutePage } from "./SceneCarousel.js";

/** Чувствительность колёсика: deltaY (px) → единицы progressTarget. */
const WHEEL_PROGRESS_FACTOR = 0.001;
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

	if (getSceneCarousel().isInteractionLocked()) {
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

		const delta = normalizeWheelDelta(event) * WHEEL_PROGRESS_FACTOR;
		getSceneCarousel().addScrollDelta(delta);
	};

	window.addEventListener("wheel", onWheel, { passive: false, capture: true });

	return () => {
		window.removeEventListener("wheel", onWheel, { capture: true });
	};
}
