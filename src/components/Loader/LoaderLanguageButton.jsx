/* eslint-disable react/prop-types */
import { useRef } from "react";

const START_LABELS = { ru: "ЗАПУСК…", en: "STARTING…", zh: "启动中…" };
const TAP_SLOP = 12;

/** Touch release activates directly; the following synthetic click is ignored. */
export default function LoaderLanguageButton({ locale, children, disabled, selected, onActivate }) {
	const gesture = useRef(null);
	const suppressClickUntil = useRef(0);

	const handlePointerDown = event => {
		if (event.pointerType === "mouse" || !event.isPrimary || event.button !== 0) return;
		gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, cancelled: false };
	};
	const handlePointerMove = event => {
		const tap = gesture.current;
		if (tap?.id !== event.pointerId) return;
		if (Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > TAP_SLOP) tap.cancelled = true;
	};
	const handlePointerCancel = event => {
		if (gesture.current?.id !== event.pointerId) return;
		gesture.current = null;
		suppressClickUntil.current = event.timeStamp + 800;
	};
	const handlePointerUp = event => {
		const tap = gesture.current;
		if (tap?.id !== event.pointerId) return;
		gesture.current = null;
		suppressClickUntil.current = event.timeStamp + 800;
		event.preventDefault();
		const rect = event.currentTarget.getBoundingClientRect();
		const inside = event.clientX >= rect.left && event.clientX <= rect.right
			&& event.clientY >= rect.top && event.clientY <= rect.bottom;
		if (disabled || tap.cancelled || !inside
			|| Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > TAP_SLOP) return;
		// Keep audio/orientation unlocks inside the trusted touch/pen gesture.
		onActivate(locale);
	};
	const handleClick = event => {
		if (event.detail !== 0 && event.timeStamp < suppressClickUntil.current) {
			event.preventDefault();
			return;
		}
		onActivate(locale);
	};

	return (
		<button type="button" disabled={disabled} aria-busy={selected || undefined}
			data-selected={selected || undefined}
			onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp} onPointerCancel={handlePointerCancel}
			onClick={handleClick}>
			{selected ? START_LABELS[locale] : children}
		</button>
	);
}
