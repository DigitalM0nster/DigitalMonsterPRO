import { useCallback, useEffect, useRef } from "react";
import { store } from "@/store.jsx";
import { requestCaseStudyScrollRepaint } from "@/portfolio/core/caseStudyAnimationFrame.js";
import {
	applyCaseScrollTargetRest,
	getSettledScrollAnchor,
	isCaseScrollSnapSettled,
} from "@/portfolio/core/caseScrollSnap.js";
import { cancelSharedAnimationFrame, requestSharedAnimationFrame } from "@/utils/sharedAnimationFrame.js";

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
const SCROLL_EDGE_HANDOFF_PX = 2;
/** Keep one half-segment of wheel intent beyond either DOM scroll edge. */
const SCROLL_TARGET_OVERSHOOT_RATIO = 0.5;
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
		Boolean(target.closest("input, textarea, select, [contenteditable='true']"))
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

function syncStoreScrollTarget(max, scrollTarget) {
	const next = max <= 0 ? 0 : scrollTarget / max;
	if (Math.abs(store.caseScrollTarget - next) < SCROLL_STORE_EPSILON) {
		return false;
	}

	store.caseScrollTarget = next;
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
export function useSmoothCaseScroll(containerRef, enabled = true, snapAnchors = [], options = {}) {
	const scrollTargetRef = useRef(0);
	const scrollCurrentRef = useRef(0);
	const enabledRef = useRef(enabled);
	const snapAnchorsRef = useRef(snapAnchors);
	const initialProgressRef = useRef(options.initialProgress);
	const initialTargetDeltaPxRef = useRef(options.initialTargetDeltaPx);
	const onBoundaryScrollRef = useRef(options.onBoundaryScroll);
	const isBoundaryHandoffActiveRef = useRef(options.isBoundaryHandoffActive);
	const allowBoundaryOvershootRef = useRef(options.allowBoundaryOvershoot);
	const suppressWheelAfterStopRef = useRef(options.suppressWheelAfterStop !== false);
	const onTraceRef = useRef(options.onTrace);
	const scrollLoopRunningRef = useRef(false);
	const rafIdRef = useRef(0);
	const stopAtProgressRef = useRef(null);
	enabledRef.current = enabled;
	snapAnchorsRef.current = snapAnchors;
	initialProgressRef.current = options.initialProgress;
	initialTargetDeltaPxRef.current = options.initialTargetDeltaPx;
	onBoundaryScrollRef.current = options.onBoundaryScroll;
	isBoundaryHandoffActiveRef.current = options.isBoundaryHandoffActive;
	allowBoundaryOvershootRef.current = options.allowBoundaryOvershoot;
	suppressWheelAfterStopRef.current = options.suppressWheelAfterStop !== false;
	onTraceRef.current = options.onTrace;

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
		const initialProgress = Number.isFinite(initialProgressRef.current)
			? clamp(initialProgressRef.current, 0, 1)
			: 0;
		const initialTargetDeltaPx = Number.isFinite(initialTargetDeltaPxRef.current)
			? initialTargetDeltaPxRef.current
			: 0;
		const initialMax = getScrollMax(el);
		const initialTop = initialProgress * initialMax;
		const initialTargetTop = clamp(
			initialTop + initialTargetDeltaPx,
			-initialMax * SCROLL_TARGET_OVERSHOOT_RATIO,
			initialMax * (1 + SCROLL_TARGET_OVERSHOOT_RATIO),
		);
		el.scrollTop = initialTop;
		scrollTargetRef.current = initialTargetTop;
		scrollCurrentRef.current = initialTop;
		let lastSampledScrollTop = initialTop;
		let lastWheelAt = initialTargetDeltaPx === 0 ? 0 : performance.now();
		let wheelSuppressedUntil = 0;
		let lastFrameAt = performance.now();
		/** @type {'forward' | 'backward' | null} */
		let scrollIntent = initialTargetDeltaPx > 0 ? "forward" : initialTargetDeltaPx < 0 ? "backward" : null;
		let gestureStartProgress = initialProgress;
		let lastFrameTraceAt = 0;
		const traceScrollState = (type, details = {}) => {
			if (!onTraceRef.current) {
				return;
			}

			const max = getScrollMax(el);
			const normalize = (value) => max > 0 ? value / max : 0;
			onTraceRef.current({
				type,
				internal: {
					dom: normalize(el.scrollTop),
					current: normalize(scrollCurrentRef.current),
					target: normalize(scrollTargetRef.current),
					boundedTarget: normalize(clamp(scrollTargetRef.current, 0, max)),
					overflow: normalize(
						scrollTargetRef.current - clamp(scrollTargetRef.current, 0, max),
					),
					maxPx: max,
					scrollIntent,
				},
				...details,
			});
		};
		if (Math.abs(store.scroll - initialProgress) > SCROLL_STORE_EPSILON) {
			store.scroll = initialProgress;
		}
		syncStoreScrollTarget(initialMax, initialTargetTop);
		syncStoreScroll(el, initialTop);
		traceScrollState("mount", { initialProgress, initialTargetDeltaPx });

		const stopScrollLoop = () => {
			scrollLoopRunningRef.current = false;
			if (rafIdRef.current) {
				cancelSharedAnimationFrame(rafIdRef.current);
				rafIdRef.current = 0;
			}
		};

		stopAtProgressRef.current = (progress) => {
			const max = getScrollMax(el);
			const nextTop = clamp(progress, 0, 1) * max;

			stopScrollLoop();
			scrollIntent = null;
			gestureStartProgress = clamp(progress, 0, 1);
			wheelSuppressedUntil = suppressWheelAfterStopRef.current
				? performance.now() + WHEEL_IDLE_MS
				: 0;
			scrollTargetRef.current = nextTop;
			syncStoreScrollTarget(max, nextTop);
			scrollCurrentRef.current = nextTop;
			lastSampledScrollTop = nextTop;
			if (Math.abs(el.scrollTop - nextTop) > 0.01) {
				el.scrollTop = nextTop;
			}
			traceScrollState("stop-at-progress", { progress: clamp(progress, 0, 1) });
		};

		const getBoundedTarget = (max) => clamp(scrollTargetRef.current, 0, max);
		const getBoundaryOverflow = (max) => scrollTargetRef.current - getBoundedTarget(max);
		const isScrollSettled = () => {
			const max = getScrollMax(el);
			return Math.abs(scrollCurrentRef.current - getBoundedTarget(max)) < SCROLL_SETTLE_PX;
		};

		const isWheelIdle = () => performance.now() - lastWheelAt >= WHEEL_IDLE_MS;

		const flushBoundaryOverflow = (max) => {
			if (!allowBoundaryOvershootRef.current || !onBoundaryScrollRef.current || max <= 0) {
				return false;
			}

			const overflow = getBoundaryOverflow(max);
			if (Math.abs(overflow) <= SCROLL_SETTLE_PX) {
				return false;
			}

			const direction = overflow > 0 ? "forward" : "backward";
			const boundary = direction === "forward" ? max : 0;
			const currentTop = scrollCurrentRef.current;
			const domTop = el.scrollTop;
			const reachedBoundary = direction === "forward"
				? currentTop >= max - SCROLL_EDGE_HANDOFF_PX && domTop >= max - SCROLL_EDGE_HANDOFF_PX
				: currentTop <= SCROLL_EDGE_HANDOFF_PX && domTop <= SCROLL_EDGE_HANDOFF_PX;

			if (!reachedBoundary) {
				return false;
			}

			const handoffActive = isBoundaryHandoffActiveRef.current?.() === true;
			traceScrollState("boundary-overflow-attempt", {
				delta: overflow,
				direction,
				handoffActive,
			});
			const handled = onBoundaryScrollRef.current({
				delta: overflow,
				direction,
				event: null,
				handoffActive,
			});
			if (handled === false) {
				traceScrollState("boundary-overflow-blocked", {
					delta: overflow,
					direction,
					handoffActive,
				});
				return false;
			}

			// Overflow belongs to case-boundary leave (scroll-driven hex). Keep DOM at edge.
			scrollTargetRef.current = boundary;
			syncStoreScrollTarget(max, boundary);
			traceScrollState("boundary-overflow-transferred", {
				delta: overflow,
				direction,
				handoffActive,
			});
			// About-like return through 0: leftover px continues into interior stages.
			if (typeof handled === "number" && Math.abs(handled) > 0.01) {
				applyInputDelta(handled);
			}
			return true;
		};

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
				syncStoreScrollTarget(0, 0);
				scrollCurrentRef.current = 0;
				lastSampledScrollTop = 0;
				if (Math.abs(store.scroll) > SCROLL_STORE_EPSILON) {
					store.scroll = 0;
					requestCaseStudyScrollRepaint();
				}
				stopScrollLoop();
				return;
			}

			const minTarget = allowBoundaryOvershootRef.current
				? -max * SCROLL_TARGET_OVERSHOOT_RATIO
				: 0;
			const maxTarget = allowBoundaryOvershootRef.current
				? max * (1 + SCROLL_TARGET_OVERSHOOT_RATIO)
				: max;
			scrollTargetRef.current = clamp(scrollTargetRef.current, minTarget, maxTarget);
			syncStoreScrollTarget(max, scrollTargetRef.current);
			let boundedTarget = getBoundedTarget(max);
			let hasBoundaryOverflow = Math.abs(getBoundaryOverflow(max)) > SCROLL_SETTLE_PX;

			const anchors = snapAnchorsRef.current;
			const snapOptions =
				scrollIntent === "backward" && anchors.length > 0
					? {
							scrollIntent,
							gestureStartAnchor: getSettledScrollAnchor(gestureStartProgress, anchors),
						}
					: {};

			if (!hasBoundaryOverflow && isWheelIdle() && anchors.length > 0) {
				const progress = boundedTarget / max;
				const rested = applyCaseScrollTargetRest(progress, anchors, dt, snapOptions);
				scrollTargetRef.current = rested * max;
				syncStoreScrollTarget(max, scrollTargetRef.current);
				boundedTarget = scrollTargetRef.current;
			}

			const actualTop = el.scrollTop;
			const nativeMoving = Math.abs(actualTop - lastSampledScrollTop) > NATIVE_SCROLL_MOVE_PX;
			lastSampledScrollTop = actualTop;

			if (Math.abs(actualTop - scrollCurrentRef.current) > 2) {
				scrollCurrentRef.current = actualTop;
				scrollTargetRef.current = actualTop;
				syncStoreScrollTarget(max, actualTop);
				syncStoreScroll(el, actualTop);
			} else if (!isScrollSettled()) {
				const target = boundedTarget;
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

			flushBoundaryOverflow(max);
			boundedTarget = getBoundedTarget(max);
			hasBoundaryOverflow = Math.abs(getBoundaryOverflow(max)) > SCROLL_SETTLE_PX;
			const progressNorm = boundedTarget / max;
			const snapSettling =
				isWheelIdle() &&
				anchors.length > 0 &&
				!isCaseScrollSnapSettled(progressNorm, anchors, snapOptions);

			const keepLoop = !isScrollSettled() || nativeMoving || snapSettling || hasBoundaryOverflow;
			if (now - lastFrameTraceAt >= 80) {
				lastFrameTraceAt = now;
				traceScrollState("frame", {
					hasBoundaryOverflow,
					nativeMoving,
					snapSettling,
					wheelIdle: isWheelIdle(),
				});
			}
			if (keepLoop) {
				scrollLoopRunningRef.current = true;
				rafIdRef.current = requestSharedAnimationFrame(tick);
				return;
			}

			syncStoreScroll(el, scrollCurrentRef.current);
			scrollIntent = null;
			stopScrollLoop();
		};

		const startScrollLoop = () => {
			if (scrollLoopRunningRef.current) {
				return;
			}

			scrollLoopRunningRef.current = true;
			lastFrameAt = performance.now();
			rafIdRef.current = requestSharedAnimationFrame(tick);
		};

		const applyInputDelta = (delta) => {
			const max = getScrollMax(el);
			if (max <= 0 || delta === 0) {
				return false;
			}

			const now = performance.now();
			const previousTarget = scrollTargetRef.current;
			if (now - lastWheelAt >= WHEEL_IDLE_MS) {
				gestureStartProgress = scrollTargetRef.current / max;
			}

			scrollIntent = delta > 0 ? "forward" : "backward";
			lastWheelAt = now;
			const minTarget = allowBoundaryOvershootRef.current
				? -max * SCROLL_TARGET_OVERSHOOT_RATIO
				: 0;
			const maxTarget = allowBoundaryOvershootRef.current
				? max * (1 + SCROLL_TARGET_OVERSHOOT_RATIO)
				: max;
			scrollTargetRef.current = clamp(
				scrollTargetRef.current + delta,
				minTarget,
				maxTarget,
			);
			syncStoreScrollTarget(max, scrollTargetRef.current);
			traceScrollState("internal-target", {
				delta,
				previousTarget: previousTarget / max,
				nextTarget: scrollTargetRef.current / max,
			});
			startScrollLoop();
			return true;
		};

		const handoffBoundaryScroll = (event, delta) => {
			if (!onBoundaryScrollRef.current || delta === 0) {
				return false;
			}

			const max = getScrollMax(el);
			if (max <= 0) {
				return false;
			}

			const direction = delta > 0 ? "forward" : "backward";
			const handoffActive = isBoundaryHandoffActiveRef.current?.() === true;
			if (handoffActive) {
				traceScrollState("active-handoff-wheel", { delta, direction });
				const handled = onBoundaryScrollRef.current({
					delta,
					direction,
					event,
					handoffActive: true,
				});
				if (handled === false) {
					// Leave settled back at 0 — interior owns this wheel (like About).
					return false;
				}
				if (typeof handled === "number" && Math.abs(handled) > 0.01) {
					applyInputDelta(handled);
					return true;
				}
				return true;
			}

			// Target can reach the edge several frames before the visible scroll and
			// stage animation. Never hand the wheel to the global carousel early.
			const currentTop = scrollCurrentRef.current;
			const domTop = el.scrollTop;
			const atStart =
				scrollTargetRef.current <= SCROLL_EDGE_HANDOFF_PX &&
				currentTop <= SCROLL_EDGE_HANDOFF_PX &&
				domTop <= SCROLL_EDGE_HANDOFF_PX;
			const atEnd =
				scrollTargetRef.current >= max - SCROLL_EDGE_HANDOFF_PX &&
				currentTop >= max - SCROLL_EDGE_HANDOFF_PX &&
				domTop >= max - SCROLL_EDGE_HANDOFF_PX;
			if ((direction === "backward" && !atStart) || (direction === "forward" && !atEnd)) {
				traceScrollState("boundary-wheel-not-reached", {
					delta,
					direction,
					atStart,
					atEnd,
				});
				return false;
			}

			// Even when the DOM is already exactly at 0/1, route the first boundary
			// wheel through the virtual -0.5...1.5 target. The scroll loop then hands
			// that overflow to case-boundary leave (scroll-driven hex to adjacent case).
			if (allowBoundaryOvershootRef.current) {
				traceScrollState("boundary-wheel-queued-as-overflow", { delta, direction });
				return false;
			}

			const boundary = direction === "forward" ? max : 0;
			const pendingOverflow = direction === "forward"
				? Math.max(0, scrollTargetRef.current - max)
				: Math.min(0, scrollTargetRef.current);
			const handled = onBoundaryScrollRef.current({
				delta: delta + pendingOverflow,
				direction,
				event,
				handoffActive: false,
			});
			if (handled === false) {
				traceScrollState("boundary-wheel-result", {
					delta,
					direction,
					handoffDelta: delta + pendingOverflow,
					handled: false,
				});
				return false;
			}
			scrollTargetRef.current = boundary;
			syncStoreScrollTarget(max, boundary);
			if (typeof handled === "number" && Math.abs(handled) > 0.01) {
				applyInputDelta(handled);
			}
			traceScrollState("boundary-wheel-result", {
				delta,
				direction,
				handoffDelta: delta + pendingOverflow,
				handled: true,
			});
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
			traceScrollState("wheel", {
				delta,
				deltaMode: event.deltaMode,
			});

			if (handoffBoundaryScroll(event, delta)) {
				event.preventDefault();
				return;
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
			if (handoffBoundaryScroll(event, direction * keyboardStep)) {
				event.preventDefault();
				return;
			}
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
			syncStoreScrollTarget(getScrollMax(el), actualTop);
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
		if (Math.abs(initialTargetTop - initialTop) > SCROLL_SETTLE_PX) {
			startScrollLoop();
		}

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
