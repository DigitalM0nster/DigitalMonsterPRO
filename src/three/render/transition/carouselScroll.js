import { getSceneCarousel } from "@/three/render/transition/carouselPage.js";
import { isCarouselRoutePage } from "./SceneCarousel.js";
import { isSceneDevToolsWheelTarget } from "../../dev/sceneDevPanelUtils.js";
import { dispatchLocalSceneScroll } from "./localSceneScroll.js";
import { attachCarouselTouch, usesSharedCarouselTouch, isCarouselTouchControlTarget } from "./carouselTouch.js";
import { sceneCanvasOwnsInput } from "../../interaction/sceneCanvasInput.js";
import { sceneOwnsHexHitAtClientY } from "../overlay/hexHitOwnership.js";

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

/** Не перехватывать wheel над полями формы (контакты и т.п.). */
function isEditableTarget(target) {
	return target instanceof Element && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
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
	if (event.target?.closest?.("[data-about-reading-panel]")) return false;
	if (isSceneDevToolsWheelTarget(event)) {
		return false;
	}
	if (isEditableTarget(event.target)) {
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
	// About owns a multi-stage internal story and hands only its edge overshoot
	// to the ring. Capability pages are ordinary route-level ring scenes.
	if (
		carousel.currentId === "about"
		|| carousel.isInteractionLocked()
	) {
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
	const canTouchContinue = owner => {
		const state = ctx.getStore(), carousel = getSceneCarousel();
		return state.appStarted && !state.openedCase && usesSharedCarouselTouch(owner)
			&& carousel.currentId === owner && !carousel.isInteractionLocked();
	};
	const detachTouch = attachCarouselTouch({
		target: window,
		isBlockedTarget: target => isCarouselTouchControlTarget(target) || isOverScrollableElement(target),
		getStartOwner: (touch, event) => {
			if (sceneCanvasOwnsInput(event)) return null;
			const owner = getSceneCarousel().currentId;
			return canTouchContinue(owner) && isCarouselRoutePage(ctx.getCurrentPage())
				&& !isSceneDevToolsWheelTarget(event) && sceneOwnsHexHitAtClientY(owner, touch.clientY) ? owner : null;
		},
		canContinue: canTouchContinue,
		addDelta: addCarouselWheelDelta,
	});
	const onWheel = (event) => {
		if (sceneCanvasOwnsInput(event, true)) return;
		if (!shouldCarouselScrollWheel(ctx, event)) {
			return;
		}

		if (Math.abs(event.deltaY) < Math.abs(event.deltaX)) {
			return;
		}

		event.preventDefault();

		const delta = normalizeWheelDelta(event);
		if (!dispatchLocalSceneScroll(getSceneCarousel().currentId, delta)) addCarouselWheelDelta(delta);
	};

	window.addEventListener("wheel", onWheel, { passive: false, capture: true });

	return () => {
		detachTouch();
		window.removeEventListener("wheel", onWheel, { capture: true });
	};
}
