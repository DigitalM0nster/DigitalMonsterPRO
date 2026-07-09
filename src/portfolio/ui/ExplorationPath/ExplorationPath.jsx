import { useMemo, useState } from "react";
import styles from "./ExplorationPath.module.scss";
import { usePortfolioProject } from "@/portfolio/core/PortfolioProjectContext.jsx";
import { getArcLength, getArcSpreadRad, getArcStepPositions, getArcTrackPath } from "./arcPositions.js";

const ARC_RADIUS = 280;

export default function ExplorationPath() {
	const { project, activeStateId, activeStateIndex, scrollProgress, goToState } = usePortfolioProject();
	const { states } = project;
	const [menuOpen, setMenuOpen] = useState(false);

	const spreadRad = useMemo(() => getArcSpreadRad(states.length), [states.length]);
	const positions = useMemo(() => getArcStepPositions(states.length, ARC_RADIUS), [states.length]);
	const arcPath = useMemo(() => getArcTrackPath(ARC_RADIUS, spreadRad), [spreadRad]);
	const arcLength = useMemo(() => getArcLength(ARC_RADIUS, spreadRad), [spreadRad]);
	const arcOffset = arcLength * (1 - scrollProgress);

	return (
		<nav className={styles.explorationPath} aria-label="Навигация по состояниям проекта">
			<div className={styles.arcField}>
				<svg
					className={styles.arcSvg}
					viewBox={`${-ARC_RADIUS - 24} ${-ARC_RADIUS - 24} ${ARC_RADIUS + 48} ${(ARC_RADIUS + 24) * 2}`}
					aria-hidden="true"
				>
					<path className={styles.arcTrack} d={arcPath} />
					<path
						className={styles.arcFill}
						d={arcPath}
						style={{
							strokeDasharray: arcLength,
							strokeDashoffset: arcOffset,
						}}
					/>
				</svg>

				<ol className={styles.steps}>
					{states.map((state, index) => {
						const isActive = state.id === activeStateId;
						const isPast = index < activeStateIndex;
						const chapterNum = String(index).padStart(2, "0");
						const pathTitle = (state.pathTitle ?? state.title).toUpperCase();
						const pos = positions[index];

						return (
							<li
								key={state.id}
								className={[
									styles.step,
									isActive && styles.active,
									isPast && styles.past,
									!isActive && !isPast && styles.future,
								]
									.filter(Boolean)
									.join(" ")}
								style={{
									"--arc-x": `${pos.x}px`,
									"--arc-y": `${pos.y}px`,
								}}
							>
								<button
									type="button"
									className={styles.stepButton}
									onClick={() => goToState(state.id)}
									aria-current={isActive ? "step" : undefined}
									title={state.title}
								>
									<span className={styles.stepMarker} aria-hidden="true">
										<span className={styles.stepRing} />
										<span className={styles.stepPulse} />
										<span className={styles.stepIndex}>{chapterNum}</span>
									</span>
									<span className={styles.stepTitle}>{pathTitle}</span>
								</button>
							</li>
						);
					})}
				</ol>
			</div>

			<button
				type="button"
				className={[styles.menuToggle, menuOpen && styles.open].filter(Boolean).join(" ")}
				aria-expanded={menuOpen}
				aria-label="Меню навигации"
				onClick={() => setMenuOpen((v) => !v)}
			>
				<span />
				<span />
				<span />
			</button>
		</nav>
	);
}
