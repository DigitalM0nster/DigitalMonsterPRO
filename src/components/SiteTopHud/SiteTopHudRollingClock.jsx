import { useEffect, useRef, useState } from "react";
import styles from "./SiteTopHud.module.scss";

/** 0–9 + дубликат 0 для плавного перехода 9 → 0. */
const DIGIT_STRIP = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

function parseClockParts(date) {
	const hours = String(date.getHours()).padStart(2, "0");
	const minutes = String(date.getMinutes()).padStart(2, "0");
	const seconds = String(date.getSeconds()).padStart(2, "0");

	return {
		isoTime: `${hours}:${minutes}:${seconds}`,
		digits: `${hours}${minutes}${seconds}`.split("").map(Number),
	};
}

/** Одна прокручиваемая цифра: колонка 0–9, смена — старая уходит вниз, новая приходит сверху. */
function RollingDigit({ value }) {
	const mountedRef = useRef(false);
	const prevValueRef = useRef(value);
	const [stripIndex, setStripIndex] = useState(value);
	const [animate, setAnimate] = useState(false);

	useEffect(() => {
		const prev = prevValueRef.current;

		if (!mountedRef.current) {
			mountedRef.current = true;
			prevValueRef.current = value;
			setStripIndex(value);
			return;
		}

		if (value === prev) {
			return;
		}

		prevValueRef.current = value;
		setAnimate(true);

		if (value > prev) {
			setStripIndex(value);
			return;
		}

		// 9 → 0: докручиваем до нижнего дубликата нуля, затем мгновенно сбрасываем на верхний.
		setStripIndex(10);
	}, [value]);

	const handleTransitionEnd = (event) => {
		if (event.propertyName !== "transform" || stripIndex !== 10) {
			return;
		}

		setAnimate(false);
		setStripIndex(0);
	};

	return (
		<span className={styles.digitSlot} aria-hidden="true">
			<span
				className={styles.digitStrip}
				data-animate={animate ? "true" : "false"}
				style={{ "--digitIndex": stripIndex }}
				onTransitionEnd={handleTransitionEnd}
			>
				{DIGIT_STRIP.map((digit, index) => (
					<span key={`${digit}-${index}`} className={styles.digitCell}>
						{digit}
					</span>
				))}
			</span>
		</span>
	);
}

/** Часы HH:MM:SS с одометр-анимацией каждой цифры. */
export default function SiteTopHudRollingClock() {
	const [parts, setParts] = useState(() => parseClockParts(new Date()));

	useEffect(() => {
		const tick = () => setParts(parseClockParts(new Date()));
		tick();
		const intervalId = window.setInterval(tick, 1000);
		return () => window.clearInterval(intervalId);
	}, []);

	const [h1, h2, m1, m2, s1, s2] = parts.digits;

	return (
		<time className={styles.clock} dateTime={parts.isoTime}>
			<RollingDigit value={h1} />
			<RollingDigit value={h2} />
			<span className={styles.clockSep}>:</span>
			<RollingDigit value={m1} />
			<RollingDigit value={m2} />
			<span className={styles.clockSep}>:</span>
			<RollingDigit value={s1} />
			<RollingDigit value={s2} />
		</time>
	);
}
