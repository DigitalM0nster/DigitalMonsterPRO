import { useEffect, useLayoutEffect, useRef } from "react";
import { useStore } from "@/store.jsx";

const SCROLL_PROGRESS_LERP = 0.07;
const SCROLL_END_THRESHOLD = 0.995;

function clamp01(v) {
	return Math.max(0, Math.min(v, 1));
}

/** Индикаторы скролла на страницах кейсов (без списка проектов). */
export default function CaseScrollOverlay() {
	const snap = useStore();
	const scrollProgressRef = useRef(null);
	const smoothScrollRef = useRef(0);

	useLayoutEffect(() => {
		const el = scrollProgressRef.current;
		if (el) {
			el.style.transition = "none";
		}
	}, []);

	useEffect(() => {
		const target = clamp01(snap.scroll);
		smoothScrollRef.current = target;
		const el = scrollProgressRef.current;
		if (el) {
			el.style.setProperty("--scrollProgress", String(target));
		}
	}, [snap.scroll]);

	useEffect(() => {
		let rafId = 0;
		const tick = () => {
			const target = clamp01(snap.scroll);
			const prev = smoothScrollRef.current;
			smoothScrollRef.current = prev + (target - prev) * SCROLL_PROGRESS_LERP;
			const el = scrollProgressRef.current;
			if (el) {
				el.style.setProperty("--scrollProgress", String(smoothScrollRef.current));
			}
			rafId = requestAnimationFrame(tick);
		};
		rafId = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(rafId);
	}, [snap]);

	const scrollProgress = clamp01(snap.scroll);
	const scrollEnded =
		Number.isFinite(scrollProgress) && scrollProgress >= SCROLL_END_THRESHOLD;

	return (
		<>
			<div className="caseScrollProgress">
				<div className="scroll">
					<div ref={scrollProgressRef} className="scrollProgress" />
				</div>
			</div>
			<div className={scrollEnded ? "bottomPanel scrollEnded" : "bottomPanel"}>
				<div className="arrowScrollBlock">
					<div className="arrow scroll">
						<div className="line" />
						<div className="line" />
					</div>
					<div className="scrollText">
						<div className="textOverflow">
							<div className="text">scroll</div>
						</div>
					</div>
				</div>
			</div>
		</>
	);
}
