import { useCallback, useEffect, useRef } from "react";
import { store } from "@/store.jsx";
import { requestCaseStudyScrollRepaint } from "@/portfolio/core/caseStudyAnimationFrame.js";
import {
	applyCaseScrollTargetRest,
	getSettledScrollAnchor,
	isCaseScrollSnapSettled,
} from "@/portfolio/core/caseScrollSnap.js";

/** Скорость догоняния scrollTop (меньше = плавнее). */
const SCROLL_LERP = 0.075;
/** Чувствительность колёсика / тачпада. */
const WHEEL_FACTOR = 1;
const KEYBOARD_STEP_VIEWPORT_RATIO = 0.35;
const KEYBOARD_STEP_MIN_PX = 320;
const LINE_HEIGHT_PX = 16;
const SCROLL_STORE_EPSILON = 1e-6;
/** Порог «дошли до target» для остановки rAF. */
const SCROLL_SETTLE_PX = 0.5;
/** Нативный scroll ещё движется (touch / inertia). */
const NATIVE_SCROLL_MOVE_PX = 0.1;
/** После последнего wheel — включаем snap-rest к anchor. */
const WHEEL_IDLE_MS = 120;

function clamp(value, min, max) {
	return Math.max(min, Math.min(max, value));
}

function getScrollMax(el) {
	return Math.max(0, el.scrollHeight - el.clientHeight);
}

function isEditableKeyboardTarget(target) {
	return (
		target instanceof Element &&
		Boolean(target.closest("input, textarea, select, [contenteditable='true'], .sceneDevTools"))
	);
}

function syncStoreScroll(el, scrollTop) {
	const max = getScrollMax(el);
	const next = max <= 0 ? 0 : scrollTop / max;
	if (Math.abs(store.scroll - next) < SCROLL_STORE_EPSILON) {
		return false;
	}

	store.scroll = next;
	requestCaseStudyScrollRepaint();
	return true;
}

/**
 * Плавный скролл контента кейса: wheel → target + lerp + snap к scrollAnchor этапов.
 *
 * @param {import('react').RefObject<HTMLElement | null>} containerRef
 * @param {boolean} [enabled]
 * @param {number[]} [snapAnchors] normalized 0…1 — якоря этапов; пустой массив = без snap
 */
export function useSmoothCaseScroll(containerRef, enabled = true, snapAnchors = []) {
	const scrollTargetRef = useRef(0);
	const scrollCurrentRef = useRef(0);
	const enabledRef = useRef(enabled);
	const snapAnchorsRef = useRef(snapAnchors);
	const scrollLoopRunningRef = useRef(false);
	const rafIdRef = useRef(0);
	const stopAtProgressRef = useRef(null);
	enabledRef.current = enabled;
	snapAnchorsRef.current = snapAnchors;

	const stopAtProgress = useCallback((progress) => {
		stopAtProgressRef.current?.(progress);
	}, []);

	useEffect(() => {
		const el = containerRef.current;
		if (!el || !enabled) {
			return;
		}

		// Старт кейса всегда с нуля — иначе при смене проекта DOM сохраняет scrollTop
		// и syncStoreScroll сразу поднимает store.scroll → прогон всех этапов.
		el.scrollTop = 0;
		scrollTargetRef.current = 0;
		scrollCurrentRef.current = 0;
		let lastSampledScrollTop = 0;
		let lastWheelAt = 0;
		let wheelSuppressedUntil = 0;
		let lastFrameAt = performance.now();
		/** @type {'forward' | 'backward' | null} */
		let scrollIntent = null;
		let gestureStartProgress = 0;
		if (Math.abs(store.scroll) > SCROLL_STORE_EPSILON) {
			store.scroll = 0;
		}
		syncStoreScroll(el, 0);

		const stopScrollLoop = () => {
			scrollLoopRunningRef.current = false;
			if (rafIdRef.current) {
				cancelAnimationFrame(rafIdRef.current);
				rafIdRef.current = 0;
			}
		};

		stopAtProgressRef.current = (progress) => {
			const max = getScrollMax(el);
			const nextTop = clamp(progress, 0, 1) * max;

			stopScrollLoop();
			scrollIntent = null;
			gestureStartProgress = clamp(progress, 0, 1);
			wheelSuppressedUntil = performance.now() + WHEEL_IDLE_MS;
			scrollTargetRef.current = nextTop;
			scrollCurrentRef.current = nextTop;
			lastSampledScrollTop = nextTop;
			if (Math.abs(el.scrollTop - nextTop) > 0.01) {
				el.scrollTop = nextTop;
			}
		};

		const isScrollSettled = () =>
			Math.abs(scrollCurrentRef.current - scrollTargetRef.current) < SCROLL_SETTLE_PX;

		const isWheelIdle = () => performance.now() - lastWheelAt >= WHEEL_IDLE_MS;

		const tick = (now) => {
			rafIdRef.current = 0;

			if (!enabledRef.current) {
				stopScrollLoop();
				return;
			}

			const dt = Math.min(0.05, (now - lastFrameAt) / 1000);
			lastFrameAt = now;

			const max = getScrollMax(el);
			if (max <= 0) {
				el.scrollTop = 0;
				scrollTargetRef.current = 0;
				scrollCurrentRef.current = 0;
				lastSampledScrollTop = 0;
				if (Math.abs(store.scroll) > SCROLL_STORE_EPSILON) {
					store.scroll = 0;
					requestCaseStudyScrollRepaint();
				}
				stopScrollLoop();
				return;
			}

			scrollTargetRef.current = clamp(scrollTargetRef.current, 0, max);

			const anchors = snapAnchorsRef.current;
			const snapOptions =
				scrollIntent === "backward" && anchors.length > 0
					? {
							scrollIntent,
							gestureStartAnchor: getSettledScrollAnchor(gestureStartProgress, anchors),
						}
					: {};

			if (isWheelIdle() && anchors.length > 0) {
				const progress = scrollTargetRef.current / max;
				const rested = applyCaseScrollTargetRest(progress, anchors, dt, snapOptions);
				scrollTargetRef.current = rested * max;
			}

			const actualTop = el.scrollTop;
			const nativeMoving = Math.abs(actualTop - lastSampledScrollTop) > NATIVE_SCROLL_MOVE_PX;
			lastSampledScrollTop = actualTop;

			if (Math.abs(actualTop - scrollCurrentRef.current) > 2) {
				scrollCurrentRef.current = actualTop;
				scrollTargetRef.current = actualTop;
				syncStoreScroll(el, actualTop);
			} else if (!isScrollSettled()) {
				const target = scrollTargetRef.current;
				const prev = scrollCurrentRef.current;
				const next = prev + (target - prev) * SCROLL_LERP;
				const settled = Math.abs(next - target) < SCROLL_SETTLE_PX;
				const scrollTop = settled ? target : next;

				scrollCurrentRef.current = scrollTop;
				if (Math.abs(el.scrollTop - scrollTop) > 0.01) {
					el.scrollTop = scrollTop;
				}
				syncStoreScroll(el, scrollTop);
			}

			const progressNorm = scrollTargetRef.current / max;
			const snapSettling =
				isWheelIdle() &&
				anchors.length > 0 &&
				!isCaseScrollSnapSettled(progressNorm, anchors, snapOptions);

			const keepLoop = !isScrollSettled() || nativeMoving || snapSettling;
			if (keepLoop) {
				scrollLoopRunningRef.current = true;
				rafIdRef.current = requestAnimationFrame(tick);
				return;
			}

			scrollIntent = null;
			stopScrollLoop();
		};

		const startScrollLoop = () => {
			if (scrollLoopRunningRef.current) {
				return;
			}

			scrollLoopRunningRef.current = true;
			lastFrameAt = performance.now();
			rafIdRef.current = requestAnimationFrame(tick);
		};

		const applyInputDelta = (delta) => {
			const max = getScrollMax(el);
			if (max <= 0 || delta === 0) {
				return false;
			}

			const now = performance.now();
			if (now - lastWheelAt >= WHEEL_IDLE_MS) {
				gestureStartProgress = scrollTargetRef.current / max;
			}

			scrollIntent = delta > 0 ? "forward" : "backward";
			lastWheelAt = now;
			scrollTargetRef.current = clamp(scrollTargetRef.current + delta, 0, max);
			startScrollLoop();
			return true;
		};

		const onWheel = (event) => {
			if (!enabledRef.current) {
				return;
			}
			if (event.defaultPrevented) {
				return;
			}

			const eventNow = performance.now();
			if (eventNow < wheelSuppressedUntil) {
				wheelSuppressedUntil = eventNow + WHEEL_IDLE_MS;
				event.preventDefault();
				return;
			}

			const max = getScrollMax(el);
			if (max <= 0) {
				return;
			}

			if (Math.abs(event.deltaY) < Math.abs(event.deltaX)) {
				return;
			}

			let delta = event.deltaY;
			if (event.deltaMode === 1) {
				delta *= LINE_HEIGHT_PX;
			} else if (event.deltaMode === 2) {
				delta *= el.clientHeight;
			}

			event.preventDefault();

			applyInputDelta(delta * WHEEL_FACTOR);
		};

		const onKeyDown = (event) => {
			if (
				!enabledRef.current ||
				event.defaultPrevented ||
				event.altKey ||
				event.ctrlKey ||
				event.metaKey ||
				isEditableKeyboardTarget(event.target)
			) {
				return;
			}

			const direction = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
			if (direction === 0) {
				return;
			}

			const eventNow = performance.now();
			if (eventNow < wheelSuppressedUntil) {
				event.preventDefault();
				return;
			}

			const keyboardStep = Math.max(
				KEYBOARD_STEP_MIN_PX,
				el.clientHeight * KEYBOARD_STEP_VIEWPORT_RATIO,
			);
			if (applyInputDelta(direction * keyboardStep)) {
				event.preventDefault();
			}
		};

		const onNativeScroll = () => {
			if (!enabledRef.current) {
				return;
			}

			const actualTop = el.scrollTop;
			if (Math.abs(actualTop - scrollCurrentRef.current) <= 2) {
				return;
			}

			scrollCurrentRef.current = actualTop;
			scrollTargetRef.current = actualTop;
			syncStoreScroll(el, actualTop);
			startScrollLoop();
		};

		const onTouchStart = () => {
			if (!enabledRef.current) {
				return;
			}
			lastWheelAt = performance.now();
			startScrollLoop();
		};

		// The visual case UI contains canvas and selectable DOM siblings of the
		// hidden scroll element, so wheel must be observed above all three layers.
		window.addEventListener("wheel", onWheel, { passive: false });
		window.addEventListener("keydown", onKeyDown);
		el.addEventListener("scroll", onNativeScroll, { passive: true });
		el.addEventListener("touchstart", onTouchStart, { passive: true });

		return () => {
			stopAtProgressRef.current = null;
			window.removeEventListener("wheel", onWheel);
			window.removeEventListener("keydown", onKeyDown);
			el.removeEventListener("scroll", onNativeScroll);
			el.removeEventListener("touchstart", onTouchStart);
			stopScrollLoop();
		};
	}, [containerRef, enabled, snapAnchors]);

	return stopAtProgress;
}
