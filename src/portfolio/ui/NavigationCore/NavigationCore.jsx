import { useMemo, useState } from "react";
import styles from "./NavigationCore.module.scss";
import { usePortfolioProject } from "@/portfolio/core/PortfolioProjectContext.jsx";

/** Углы дуги радиального меню (градусы, 0 = вправо). */
const ARC_START = 200;
const ARC_END = 340;
const ORBIT_RADIUS = 132;

function polarToCss(angleDeg, radius) {
	const rad = (angleDeg * Math.PI) / 180;
	return {
		x: Math.cos(rad) * radius,
		y: Math.sin(rad) * radius,
	};
}

export default function NavigationCore() {
	const { project, activeStateId, activeStateIndex, goToState } = usePortfolioProject();
	const [expanded, setExpanded] = useState(false);
	const { states } = project;

	const orbitItems = useMemo(() => {
		const count = states.length;
		if (count <= 1) {
			return [];
		}
		return states.map((state, index) => {
			const t = count === 1 ? 0 : index / (count - 1);
			const angle = ARC_START + (ARC_END - ARC_START) * t;
			const { x, y } = polarToCss(angle, ORBIT_RADIUS);
			return { state, index, x, y, angle };
		});
	}, [states]);

	return (
		<nav
			className={[styles.navigationCore, expanded && styles.expanded].filter(Boolean).join(" ")}
			aria-label="Навигация по состояниям проекта"
			onMouseEnter={() => setExpanded(true)}
			onMouseLeave={() => setExpanded(false)}
		>
			<div className={styles.orbitField} aria-hidden={!expanded}>
				{orbitItems.map(({ state, index, x, y }) => (
					<button
						key={state.id}
						type="button"
						className={[
							styles.orbitItem,
							state.id === activeStateId && styles.active,
							state.id !== activeStateId && styles.inactive,
						]
							.filter(Boolean)
							.join(" ")}
						style={{
							"--orbit-x": `${x}px`,
							"--orbit-y": `${y}px`,
						}}
						title={state.title}
						onClick={() => {
							goToState(state.id);
							setExpanded(false);
						}}
					>
						<span className={styles.orbitIndex}>{String(index).padStart(2, "0")}</span>
						<span className={styles.orbitLabel}>{state.title}</span>
					</button>
				))}
			</div>

			<button
				type="button"
				className={styles.coreButton}
				aria-expanded={expanded}
				aria-label={`Состояние ${activeStateIndex + 1} из ${states.length}. Открыть меню`}
				onClick={() => setExpanded((v) => !v)}
			>
				<span className={styles.coreRing} />
				<span className={styles.corePulse} />
				<span className={styles.coreIndex}>{String(activeStateIndex).padStart(2, "0")}</span>
			</button>
		</nav>
	);
}
