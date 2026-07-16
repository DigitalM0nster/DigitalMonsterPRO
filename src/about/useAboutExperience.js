import { useLayoutEffect, useRef } from "react";
import { subscribeKey } from "valtio/utils";
import { store } from "@/store.jsx";
import {
	addCarouselWheelDelta,
	CAROUSEL_WHEEL_PROGRESS_FACTOR,
} from "@/three/render/transition/carouselScroll.js";
import { getSceneCarousel } from "@/three/render/transition/carouselPage.js";
import states, { ABOUT_SCROLL_ANCHORS } from "./states.js";

const MIN_STORY_LENGTH_PX = 2200;
const STORY_VIEWPORTS = 4;
const WHEEL_IDLE_MS = 170;
const PROGRESS_EASING = 13;
const PROGRESS_EPSILON = 0.00015;
const CAROUSEL_MOTION_EPSILON = 0.0005;
const LINE_HEIGHT_PX = 16;
const MAX_WHEEL_VIEWPORT_RATIO = 0.9;
const SNAP_INTENT_MIN_PX = 8;
const BOUNDARY_INTENT_TRIGGER_PX = 120;
const BOUNDARY_CAROUSEL_DELTA_PX = 560;

function clamp01(value) {
	return Math.max(0, Math.min(1, value));
}

function isAboutPath(pathname) {
	return /^\/about(?:\/|$)/.test(String(pathname ?? ""));
}

function isEditableTarget(target) {
	return (
		target instanceof Element &&
		Boolean(target.closest("input, textarea, select, [contenteditable='true'], .sceneDevTools"))
	);
}

function getStoryLengthPx() {
	return Math.max(MIN_STORY_LENGTH_PX, window.innerHeight * STORY_VIEWPORTS);
}

function getNearestStageIndex(progress) {
	return Math.max(0, Math.min(states.length - 1, Math.round(clamp01(progress) * (states.length - 1))));
}

function getDirectionalAnchor(progress, direction) {
	const normalized = clamp01(progress);
	const epsilon = 0.002;
	if (direction > 0) {
		return ABOUT_SCROLL_ANCHORS.find((anchor) => anchor > normalized + epsilon)
			?? ABOUT_SCROLL_ANCHORS[ABOUT_SCROLL_ANCHORS.length - 1];
	}

	for (let index = ABOUT_SCROLL_ANCHORS.length - 1; index >= 0; index -= 1) {
		if (ABOUT_SCROLL_ANCHORS[index] < normalized - epsilon) {
			return ABOUT_SCROLL_ANCHORS[index];
		}
	}
	return ABOUT_SCROLL_ANCHORS[0];
}

function ensureAboutExperience() {
	if (!store.aboutExperience) {
		store.aboutExperience = {
			active: false,
			progress: 0,
			progressTarget: 0,
			stagePosition: 0,
			activeStageIndex: 0,
			activeStageId: states[0].id,
		};
	}
	return store.aboutExperience;
}

function normalizeWheelDelta(event) {
	let delta = event.deltaY;
	if (event.deltaMode === 1) {
		delta *= LINE_HEIGHT_PX;
	} else if (event.deltaMode === 2) {
		delta *= window.innerHeight;
	}
	const limit = Math.max(480, window.innerHeight * MAX_WHEEL_VIEWPORT_RATIO);
	return Math.max(-limit, Math.min(limit, delta));
}

/**
 * One progress/target controller for the complete About story. No native scroll
 * container is involved, so local progress and route progress cannot feed each
 * other. At 0/1, and only there, unused input is handed to SceneCarousel.
 */
export function useAboutExperience(rootRef) {
	const entryRef = useRef(null);
	if (entryRef.current === null) {
		const isClickEntry =
			store.sceneCarouselClickTargetId === "about" && store.sceneCarouselClickPhase !== "idle";
		const fromContacts =
			!isClickEntry &&
			store.sceneCarouselLastCommitFromId === "contacts" &&
			store.sceneCarouselLastCommitDirection === "backward";
		const initialProgress = fromContacts ? 1 : 0;
		const boundaryOverflow = !isClickEntry
			? Number(store.sceneCarouselLastCommitBoundaryOverflow ?? 0)
			: 0;
		const overflowPixels = Number.isFinite(boundaryOverflow)
			? boundaryOverflow / CAROUSEL_WHEEL_PROGRESS_FACTOR
			: 0;
		const initialTarget = clamp01(initialProgress + overflowPixels / getStoryLengthPx());
		entryRef.current = { initialProgress, initialTarget };
	}

	useLayoutEffect(() => {
		const root = rootRef.current;
		if (!root) {
			return undefined;
		}

		const experience = ensureAboutExperience();
		let current = entryRef.current.initialProgress;
		let target = entryRef.current.initialTarget;
		let pendingBoundaryPixels = 0;
		let rafId = 0;
		let snapTimerId = 0;
		let previousFrameAt = performance.now();
		let lastPublishedStage = -1;
		let touchId = null;
		let touchY = 0;
		let disposed = false;
		let activeHandoffDirection = 0;
		let inputBurstPixels = 0;
		const trace = (lastEvent = null) => {
			if (!import.meta.env.DEV) return;
			if (lastEvent) store.aboutScrollDebug.lastEvent = lastEvent;
			store.aboutScrollDebug.dom = current;
			store.aboutScrollDebug.current = current;
			store.aboutScrollDebug.target = target;
			store.aboutScrollDebug.boundedTarget = target;
			store.aboutScrollDebug.overflow = pendingBoundaryPixels / getStoryLengthPx();
			store.aboutScrollDebug.maxPx = getStoryLengthPx();
			store.aboutScrollDebug.scrollIntent = activeHandoffDirection === 0
				? null
				: activeHandoffDirection > 0 ? "forward" : "backward";
		};

		const ownsInput = () => {
			const carousel = getSceneCarousel();
			return isAboutPath(window.location.pathname) && carousel.currentId === "about";
		};

		const publish = () => {
			const stagePosition = current * (states.length - 1);
			const activeStageIndex = getNearestStageIndex(current);
			experience.progress = current;
			experience.progressTarget = target;
			experience.stagePosition = stagePosition;
			if (activeStageIndex !== lastPublishedStage) {
				lastPublishedStage = activeStageIndex;
				experience.activeStageIndex = activeStageIndex;
				experience.activeStageId = states[activeStageIndex].id;
				root.dataset.aboutStage = String(activeStageIndex + 1);
			}

			root.style.setProperty("--about-progress", current.toFixed(6));
			root.style.setProperty("--about-stage-position", stagePosition.toFixed(6));
			trace();
		};

		const carouselHandoffIsActive = (carousel) => {
			if (
				activeHandoffDirection !== 0 &&
				carousel.scrollIntent === null &&
				Math.abs(carousel.progress) <= CAROUSEL_MOTION_EPSILON &&
				Math.abs(carousel.progressTarget) <= CAROUSEL_MOTION_EPSILON
			) {
				activeHandoffDirection = 0;
			}
			return activeHandoffDirection !== 0 || carousel.scrollIntent !== null;
		};

		const handoffToCarousel = (deltaPixels) => {
			if (!ownsInput() || !Number.isFinite(deltaPixels) || deltaPixels === 0) {
				return false;
			}
			const carousel = getSceneCarousel();
			const handled = addCarouselWheelDelta(deltaPixels);
			if (handled) {
				activeHandoffDirection = Math.sign(deltaPixels);
				trace(
					`${activeHandoffDirection > 0 ? "handoff-forward" : "handoff-backward"}`
					+ `:${Math.round(deltaPixels)}px:pt=${carousel.progressTarget.toFixed(3)}`
					+ `:intent=${carousel.scrollIntent ?? "null"}`,
				);
			}
			return handled;
		};

		const flushBoundaryHandoff = () => {
			if (Math.abs(pendingBoundaryPixels) < BOUNDARY_INTENT_TRIGGER_PX) {
				return false;
			}
			const direction = Math.sign(pendingBoundaryPixels);
			const carouselDelta = direction * Math.max(
				BOUNDARY_CAROUSEL_DELTA_PX,
				Math.abs(pendingBoundaryPixels),
			);
			pendingBoundaryPixels = 0;
			inputBurstPixels = 0;
			return handoffToCarousel(carouselDelta);
		};

		const stopAnimation = () => {
			if (rafId) {
				window.cancelAnimationFrame(rafId);
				rafId = 0;
			}
		};

		const tick = (now) => {
			rafId = 0;
			if (disposed) {
				return;
			}
			if (!ownsInput()) {
				experience.active = false;
				return;
			}

			const dt = Math.min(0.05, Math.max(0, (now - previousFrameAt) / 1000));
			previousFrameAt = now;
			const difference = target - current;
			if (Math.abs(difference) <= PROGRESS_EPSILON) {
				current = target;
			} else {
				current += difference * (1 - Math.exp(-PROGRESS_EASING * dt));
			}

			if (
				pendingBoundaryPixels !== 0 &&
				((pendingBoundaryPixels > 0 && current === 1 && target === 1) ||
					(pendingBoundaryPixels < 0 && current === 0 && target === 0))
			) {
				flushBoundaryHandoff();
			}

			publish();
			const pendingNeedsBoundaryChase =
				(pendingBoundaryPixels > 0 && current < 1) ||
				(pendingBoundaryPixels < 0 && current > 0);
			if (Math.abs(target - current) > PROGRESS_EPSILON || pendingNeedsBoundaryChase) {
				rafId = window.requestAnimationFrame(tick);
			}
		};

		const startAnimation = () => {
			if (rafId || disposed) {
				return;
			}
			previousFrameAt = performance.now();
			rafId = window.requestAnimationFrame(tick);
		};

		const scheduleSnap = () => {
			if (snapTimerId) {
				window.clearTimeout(snapTimerId);
			}
			snapTimerId = window.setTimeout(() => {
				snapTimerId = 0;
				const carousel = getSceneCarousel();
				if (!ownsInput() || carouselHandoffIsActive(carousel)) {
					inputBurstPixels = 0;
					return;
				}
				if (pendingBoundaryPixels !== 0) {
					flushBoundaryHandoff();
					return;
				}
				if (Math.abs(inputBurstPixels) < SNAP_INTENT_MIN_PX) {
					return;
				}
				const direction = Math.sign(inputBurstPixels);
				inputBurstPixels = 0;
				target = getDirectionalAnchor(target, direction);
				publish();
				startAnimation();
			}, WHEEL_IDLE_MS);
		};

		const consumePendingBoundaryReversal = (deltaPixels) => {
			if (
				pendingBoundaryPixels === 0 ||
				Math.sign(pendingBoundaryPixels) === Math.sign(deltaPixels)
			) {
				return deltaPixels;
			}
			const remaining = deltaPixels + pendingBoundaryPixels;
			if (Math.sign(remaining) === Math.sign(pendingBoundaryPixels)) {
				pendingBoundaryPixels = remaining;
				return 0;
			}
			pendingBoundaryPixels = 0;
			return remaining;
		};

		const applyInputPixels = (rawDeltaPixels) => {
			if (!ownsInput() || !Number.isFinite(rawDeltaPixels) || rawDeltaPixels === 0) {
				return false;
			}

			const carousel = getSceneCarousel();
			if (carousel.isInteractionLocked()) {
				return false;
			}

			if (carouselHandoffIsActive(carousel)) {
				const boundaryDirection = Math.sign(
					activeHandoffDirection || (Math.abs(carousel.progressTarget) > CAROUSEL_MOTION_EPSILON
						? carousel.progressTarget
						: carousel.progress),
				);
				if (boundaryDirection !== 0 && Math.sign(rawDeltaPixels) !== boundaryDirection) {
					// Reversal first cancels the in-flight route transition. It cannot jump
					// through the About story to the route on the opposite side.
					carousel.setProgressTarget(0);
					trace(`handoff-reversal:${Math.round(rawDeltaPixels)}px`);
					return true;
				}
				return handoffToCarousel(rawDeltaPixels);
			}

			inputBurstPixels += rawDeltaPixels;
			let deltaPixels = consumePendingBoundaryReversal(rawDeltaPixels);
			if (deltaPixels === 0) {
				startAnimation();
				scheduleSnap();
				return true;
			}

			const storyLength = getStoryLengthPx();
			const previousTarget = target;
			target = clamp01(previousTarget + deltaPixels / storyLength);
			const consumedPixels = (target - previousTarget) * storyLength;
			const overflowPixels = deltaPixels - consumedPixels;
			if (Math.abs(overflowPixels) > 0.01) {
				const atBoundary =
					(overflowPixels > 0 && current === 1 && target === 1) ||
					(overflowPixels < 0 && current === 0 && target === 0);
				pendingBoundaryPixels += overflowPixels;
				if (atBoundary) flushBoundaryHandoff();
			}

			publish();
			startAnimation();
			scheduleSnap();
			return true;
		};

		const jumpToProgress = (nextProgress) => {
			pendingBoundaryPixels = 0;
			inputBurstPixels = 0;
			target = clamp01(nextProgress);
			publish();
			startAnimation();
		};

		const jumpByStage = (direction) => {
			const carousel = getSceneCarousel();
			if (carouselHandoffIsActive(carousel)) {
				const boundaryDirection = Math.sign(
					activeHandoffDirection || carousel.progressTarget || carousel.progress,
				);
				if (boundaryDirection !== 0 && direction !== boundaryDirection) {
					carousel.setProgressTarget(0);
					trace(`handoff-key-reversal:${direction}`);
				}
				return;
			}

			const stageIndex = getNearestStageIndex(target);
			const nextStageIndex = stageIndex + direction;
			if (states[nextStageIndex]) {
				jumpToProgress(states[nextStageIndex].scrollAnchor);
				return;
			}

			pendingBoundaryPixels = direction * BOUNDARY_INTENT_TRIGGER_PX;
			flushBoundaryHandoff();
		};

		const onWheel = (event) => {
			if (
				!ownsInput() ||
				event.defaultPrevented ||
				Math.abs(event.deltaY) < Math.abs(event.deltaX)
			) {
				return;
			}
			const delta = normalizeWheelDelta(event);
			if (delta === 0 || getSceneCarousel().isInteractionLocked()) {
				return;
			}
			event.preventDefault();
			applyInputPixels(delta);
		};

		const onKeyDown = (event) => {
			if (
				!ownsInput() ||
				event.defaultPrevented ||
				event.altKey ||
				event.ctrlKey ||
				event.metaKey ||
				isEditableTarget(event.target) ||
				getSceneCarousel().isInteractionLocked()
			) {
				return;
			}

			if (
				(event.key === "Home" || event.key === "End") &&
				carouselHandoffIsActive(getSceneCarousel())
			) {
				event.preventDefault();
				return;
			}

			if (event.key === "Home") {
				event.preventDefault();
				jumpToProgress(0);
				return;
			}
			if (event.key === "End") {
				event.preventDefault();
				jumpToProgress(1);
				return;
			}

			let direction = 0;
			if (event.key === "ArrowDown" || event.key === "PageDown" || event.key === " ") {
				direction = event.shiftKey && event.key === " " ? -1 : 1;
			} else if (event.key === "ArrowUp" || event.key === "PageUp") {
				direction = -1;
			}
			if (direction === 0) {
				return;
			}
			event.preventDefault();
			jumpByStage(direction);
		};

		const onTouchStart = (event) => {
			if (!ownsInput() || getSceneCarousel().isInteractionLocked()) {
				return;
			}
			if (event.touches.length !== 1) {
				touchId = null;
				scheduleSnap();
				return;
			}
			touchId = event.touches[0].identifier;
			touchY = event.touches[0].clientY;
			if (snapTimerId) {
				window.clearTimeout(snapTimerId);
				snapTimerId = 0;
			}
		};

		const onTouchMove = (event) => {
			if (!ownsInput() || touchId === null || getSceneCarousel().isInteractionLocked()) {
				return;
			}
			if (event.touches.length !== 1) {
				touchId = null;
				scheduleSnap();
				return;
			}
			const touch = Array.from(event.touches).find((item) => item.identifier === touchId);
			if (!touch) {
				return;
			}
			const delta = touchY - touch.clientY;
			touchY = touch.clientY;
			if (Math.abs(delta) < 0.1) {
				return;
			}
			event.preventDefault();
			applyInputPixels(delta * 1.12);
		};

		const onTouchEnd = (event) => {
			if (touchId === null) {
				return;
			}
			const remains = Array.from(event.touches).some((item) => item.identifier === touchId);
			if (!remains) {
				touchId = null;
				scheduleSnap();
			}
		};

		const unsubscribeNavigation = subscribeKey(store, "aboutStageNavigationRequest", (request) => {
			if (!request || !ownsInput()) {
				return;
			}
			const requestedIndex = Number(
				request.stageIndex ?? request.stateIndex ?? request.index ??
					states.findIndex((state) => state.id === request.stageId),
			);
			if (Number.isInteger(requestedIndex) && states[requestedIndex]) {
				jumpToProgress(states[requestedIndex].scrollAnchor);
			}
			store.aboutStageNavigationRequest = null;
		});

		experience.active = true;
		store.sceneCarouselLastCommitFromId = null;
		store.sceneCarouselLastCommitDirection = null;
		store.sceneCarouselLastCommitBoundaryOverflow = 0;
		publish();
		if (current !== target) {
			startAnimation();
		}

		window.addEventListener("wheel", onWheel, { passive: false, capture: true });
		window.addEventListener("keydown", onKeyDown);
		window.addEventListener("touchstart", onTouchStart, { passive: true, capture: true });
		window.addEventListener("touchmove", onTouchMove, { passive: false, capture: true });
		window.addEventListener("touchend", onTouchEnd, { passive: true, capture: true });
		window.addEventListener("touchcancel", onTouchEnd, { passive: true, capture: true });

		return () => {
			disposed = true;
			experience.active = false;
			store.aboutStageNavigationRequest = null;
			unsubscribeNavigation();
			stopAnimation();
			if (snapTimerId) {
				window.clearTimeout(snapTimerId);
			}
			window.removeEventListener("wheel", onWheel, { capture: true });
			window.removeEventListener("keydown", onKeyDown);
			window.removeEventListener("touchstart", onTouchStart, { capture: true });
			window.removeEventListener("touchmove", onTouchMove, { capture: true });
			window.removeEventListener("touchend", onTouchEnd, { capture: true });
			window.removeEventListener("touchcancel", onTouchEnd, { capture: true });
		};
	}, [rootRef]);

	return entryRef.current.initialProgress;
}
