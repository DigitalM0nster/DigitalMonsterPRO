import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import GlitchText from "../GlitchText.jsx";
import { store } from "@/store.jsx";
import {
	BUTTON_SELECTOR_DOTS,
	BUTTON_SELECTOR_RING_VIEWBOX,
	buildButtonSelectorRingSegments,
} from "./buttonSelectorRing.js";
import styles from "./MainPageButtonSelector.module.scss";

const RING_SEGMENTS = buildButtonSelectorRingSegments();
const LEADER_LINE_PATH =
	"M1.37712 47.5L25.3008 7.55258C27.8295 3.33008 32.3898 0.745607 37.3116 0.745605L52.8685 0.745598";

/**
 * CTA главной (aten7 button-selector):
 * idle — буква + тексты; hover — 3 дуги загораются из центра каждой, линия, «Смотреть».
 */
export default function MainPageButtonSelector({ onActivate }) {
	const buttonRef = useRef(null);
	const wrapperRef = useRef(null);
	const exploreRef = useRef(null);
	const location = useLocation();

	const [isHovered, setIsHovered] = useState(false);
	const [wrapperOffset, setWrapperOffset] = useState({ x: 0, y: 0 });

	useEffect(() => {
		const wrapper = wrapperRef.current;
		if (!wrapper) {
			return;
		}
		wrapper.style.setProperty("--wrapperX", `${wrapperOffset.x}px`);
		wrapper.style.setProperty("--wrapperY", `${wrapperOffset.y}px`);
	}, [wrapperOffset]);

	const handlePointerMove = useCallback((event) => {
		const button = buttonRef.current;
		if (!button) {
			return;
		}

		const rect = button.getBoundingClientRect();
		const centerX = rect.left + rect.width * 0.5;
		const centerY = rect.top + rect.height * 0.5;
		const dx = event.clientX - centerX;
		const dy = event.clientY - centerY;
		const maxShift = 42;

		setWrapperOffset({
			x: Math.max(-maxShift, Math.min(maxShift, dx * 0.22)),
			y: Math.max(-maxShift, Math.min(maxShift, dy * 0.22)),
		});
	}, []);

	const handlePointerEnter = useCallback(() => {
		setIsHovered(true);
		store.cursor.hovered = true;
		exploreRef.current?.playAppear?.(700);
	}, []);

	const handlePointerLeave = useCallback(() => {
		setIsHovered(false);
		store.cursor.hovered = false;
		setWrapperOffset({ x: 0, y: 0 });
		exploreRef.current?.restoreVisible?.();
	}, []);

	const handleClick = useCallback(() => {
		onActivate?.();
	}, [onActivate]);

	useEffect(() => {
		if (location.pathname !== "/") {
			setIsHovered(false);
			setWrapperOffset({ x: 0, y: 0 });
		}
	}, [location.pathname]);

	const buttonClassName = [styles.buttonSelector, isHovered && styles.hovered].filter(Boolean).join(" ");

	return (
		<button
			ref={buttonRef}
			type="button"
			className={buttonClassName}
			onPointerMove={handlePointerMove}
			onPointerEnter={handlePointerEnter}
			onPointerLeave={handlePointerLeave}
			onClick={handleClick}
			aria-label="Открыть портфолио"
		>
			<div ref={wrapperRef} className={styles.wrapper}>
				<svg
					className={styles.ringSvg}
					viewBox={BUTTON_SELECTOR_RING_VIEWBOX}
					xmlns="http://www.w3.org/2000/svg"
					aria-hidden="true"
				>
					<g className={styles.ringGroup}>
						{RING_SEGMENTS.map((segment, index) => (
							<g key={index} className={styles.arcSegment} data-segment={index}>
								<path className={styles.arcTrack} d={segment.fullArc} />
								<path className={styles.arcPaint} d={segment.halfA} pathLength="1" />
								<path className={styles.arcPaint} d={segment.halfB} pathLength="1" />
							</g>
						))}
						{BUTTON_SELECTOR_DOTS.map((dot) => (
							<circle
								key={`${dot.cx}-${dot.cy}`}
								className={styles.idleDot}
								cx={dot.cx}
								cy={dot.cy}
								r="1.5"
							/>
						))}
					</g>
				</svg>

				<div className={styles.letter}>L</div>

				<div className={styles.textIdle}>
					<span className={styles.textFaded}>Портфолио</span>
					<span className={styles.textBig}>DigitalMonster</span>
				</div>

				<svg
					className={styles.lineSvg}
					viewBox="0 0 53 48"
					xmlns="http://www.w3.org/2000/svg"
					aria-hidden="true"
				>
					<path className={styles.lineTrack} d={LEADER_LINE_PATH} />
					<path className={styles.linePaint} d={LEADER_LINE_PATH} pathLength="1" />
				</svg>

				<div className={styles.textExplore}>
					<GlitchText ref={exploreRef} text="Смотреть" className={styles.exploreGlitch} />
				</div>
			</div>
		</button>
	);
}
