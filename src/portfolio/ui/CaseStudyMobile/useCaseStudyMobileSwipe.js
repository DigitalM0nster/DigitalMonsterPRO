import { useCallback, useEffect, useRef, useState } from "react";
import { store } from "@/store.jsx";

const SWIPE_THRESHOLD_PX = 48;
const EDGE_INSET_PX = 18;
const HINT_NUDGE_PX = 12;

/**
 * Горизонтальный свайп между сценами кейса на мобилке.
 *
 * @param {{
 *   stateCount: number,
 *   activeIndex: number,
 *   onIndexChange: (index: number) => void,
 *   blocked?: boolean,
 * }} options
 */
export function useCaseStudyMobileSwipe({ stateCount, activeIndex, onIndexChange, blocked = false }) {
	const trackRef = useRef(null);
	const dragRef = useRef({
		pointerId: null,
		startX: 0,
		startY: 0,
		startIndex: 0,
		lockedAxis: null,
	});
	const [dragOffsetPx, setDragOffsetPx] = useState(0);
	const [showSwipeHint, setShowSwipeHint] = useState(activeIndex === 0);
	const hintPlayedRef = useRef(false);

	const syncStoreSwipeProgress = useCallback(
		(index, offsetPx) => {
			const trackWidth = trackRef.current?.clientWidth ?? 1;
			const base = index / Math.max(stateCount - 1, 1);
			const delta = -offsetPx / trackWidth;
			const progress = Math.max(0, Math.min(1, base + delta / Math.max(stateCount - 1, 1)));
			store.portfolioExperience.mobileSwipeProgress = progress;
		},
		[stateCount],
	);

	const commitIndex = useCallback(
		(nextIndex) => {
			const clamped = Math.max(0, Math.min(stateCount - 1, nextIndex));
			onIndexChange(clamped);
			setDragOffsetPx(0);
			store.portfolioExperience.mobileSwipeProgress = clamped / Math.max(stateCount - 1, 1);
			if (clamped > 0) {
				setShowSwipeHint(false);
			}
		},
		[onIndexChange, stateCount],
	);

	useEffect(() => {
		syncStoreSwipeProgress(activeIndex, dragOffsetPx);
	}, [activeIndex, dragOffsetPx, syncStoreSwipeProgress]);

	useEffect(() => {
		if (activeIndex !== 0 || hintPlayedRef.current) {
			return undefined;
		}

		const timeoutId = window.setTimeout(() => {
			setDragOffsetPx(-HINT_NUDGE_PX);
			window.setTimeout(() => setDragOffsetPx(0), 420);
			hintPlayedRef.current = true;
		}, 900);

		return () => window.clearTimeout(timeoutId);
	}, [activeIndex]);

	const onPointerDown = useCallback(
		(event) => {
			if (blocked || stateCount <= 1) {
				return;
			}

			if (event.clientX < EDGE_INSET_PX) {
				return;
			}

			dragRef.current = {
				pointerId: event.pointerId,
				startX: event.clientX,
				startY: event.clientY,
				startIndex: activeIndex,
				lockedAxis: null,
			};
			event.currentTarget.setPointerCapture(event.pointerId);
		},
		[activeIndex, blocked, stateCount],
	);

	const onPointerMove = useCallback(
		(event) => {
			const drag = dragRef.current;
			if (drag.pointerId !== event.pointerId) {
				return;
			}

			const deltaX = event.clientX - drag.startX;
			const deltaY = event.clientY - drag.startY;

			if (!drag.lockedAxis) {
				if (Math.abs(deltaX) < 8 && Math.abs(deltaY) < 8) {
					return;
				}
				drag.lockedAxis = Math.abs(deltaX) > Math.abs(deltaY) ? "x" : "y";
			}

			if (drag.lockedAxis === "y") {
				return;
			}

			event.preventDefault();
			setDragOffsetPx(deltaX);
			syncStoreSwipeProgress(drag.startIndex, deltaX);
		},
		[syncStoreSwipeProgress],
	);

	const onPointerUp = useCallback(
		(event) => {
			const drag = dragRef.current;
			if (drag.pointerId !== event.pointerId) {
				return;
			}

			const deltaX = event.clientX - drag.startX;
			dragRef.current.pointerId = null;

			if (drag.lockedAxis !== "x") {
				setDragOffsetPx(0);
				return;
			}

			let nextIndex = drag.startIndex;
			if (deltaX <= -SWIPE_THRESHOLD_PX) {
				nextIndex += 1;
			} else if (deltaX >= SWIPE_THRESHOLD_PX) {
				nextIndex -= 1;
			}

			commitIndex(nextIndex);
		},
		[commitIndex],
	);

	return {
		trackRef,
		dragOffsetPx,
		showSwipeHint,
		onPointerDown,
		onPointerMove,
		onPointerUp,
		onPointerCancel: onPointerUp,
	};
}
