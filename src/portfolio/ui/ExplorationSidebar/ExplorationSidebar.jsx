import { useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { requestHexNavigation } from "@/utils/hexNavigation.js";
import styles from "./ExplorationSidebar.module.scss";
import { usePortfolioProject } from "@/portfolio/core/PortfolioProjectContext.jsx";

const MODES = [
	{ id: "home", label: "Хаб портфолио", icon: "home" },
	{ id: "content", label: "Текст главы", icon: "grid" },
	{ id: "model", label: "3D-модель", icon: "cube" },
	{ id: "investigate", label: "Hotspots", icon: "target" },
	{ id: "data", label: "Метрики", icon: "flask" },
];

function SidebarIcon({ type }) {
	switch (type) {
		case "home":
			return <img src="/images/home.svg" alt="" className={styles.iconImg} />;
		case "grid":
			return (
				<svg viewBox="0 0 24 24" className={styles.iconSvg} aria-hidden="true">
					<rect x="3" y="3" width="7" height="7" rx="1" />
					<rect x="14" y="3" width="7" height="7" rx="1" />
					<rect x="3" y="14" width="7" height="7" rx="1" />
					<rect x="14" y="14" width="7" height="7" rx="1" />
				</svg>
			);
		case "cube":
			return (
				<svg viewBox="0 0 24 24" className={styles.iconSvg} aria-hidden="true">
					<polygon points="12,2 20,7 20,17 12,22 4,17 4,7" />
					<polyline points="12,2 12,12 20,7" />
					<polyline points="12,12 4,7" />
				</svg>
			);
		case "target":
			return (
				<svg viewBox="0 0 24 24" className={styles.iconSvg} aria-hidden="true">
					<circle cx="12" cy="12" r="8" />
					<circle cx="12" cy="12" r="3" />
					<line x1="12" y1="2" x2="12" y2="6" />
					<line x1="12" y1="18" x2="12" y2="22" />
					<line x1="2" y1="12" x2="6" y2="12" />
					<line x1="18" y1="12" x2="22" y2="12" />
				</svg>
			);
		case "flask":
			return (
				<svg viewBox="0 0 24 24" className={styles.iconSvg} aria-hidden="true">
					<path d="M9 3h6v5l5 9a2 2 0 0 1-1.7 3H5.7A2 2 0 0 1 4 17l5-9V3z" />
					<line x1="9" y1="3" x2="15" y2="3" />
				</svg>
			);
		default:
			return null;
	}
}

/**
 * @param {{ activeMode: string, onModeChange: (mode: string) => void }} props
 */
export default function ExplorationSidebar({ activeMode, onModeChange }) {
	const navigate = useNavigate();
	const { pathname } = useLocation();
	const {
		project,
		activeStateId,
		scrollProgress,
		isInvestigating,
		goToState,
		leaveInvestigation,
	} = usePortfolioProject();
	const { states } = project;
	const trackRef = useRef(null);

	const coreStyle = useMemo(
		() => ({ top: `${Math.max(0, Math.min(100, scrollProgress * 100))}%` }),
		[scrollProgress],
	);

	const handleIconClick = (modeId) => {
		if (modeId === "home") {
			if (requestHexNavigation("/portfolio", pathname)) {
				return;
			}
			navigate("/portfolio");
			return;
		}
		if (modeId === "model" && isInvestigating) {
			leaveInvestigation();
		}
		onModeChange(activeMode === modeId ? "model" : modeId);
	};

	return (
		<aside className={styles.explorationSidebar} aria-label="Навигация проекта">
			<div className={styles.iconRail}>
				{MODES.map((mode) => {
					const isActive =
						mode.id === activeMode ||
						(mode.id === "investigate" && isInvestigating) ||
						(mode.id === "model" && activeMode === "model" && !isInvestigating);

					return (
						<button
							key={mode.id}
							type="button"
							className={[styles.iconButton, isActive && styles.active].filter(Boolean).join(" ")}
							title={mode.label}
							aria-label={mode.label}
							aria-pressed={isActive}
							onClick={() => handleIconClick(mode.id)}
						>
							<SidebarIcon type={mode.icon} />
							{isActive && <span className={styles.iconDot} aria-hidden="true" />}
						</button>
					);
				})}
			</div>

			<div className={styles.stateRail} ref={trackRef}>
				<div className={styles.stateTrack} aria-hidden="true">
					<div className={styles.stateTrackFill} style={coreStyle} />
				</div>

				<ol className={styles.stateList}>
					{states.map((state, index) => {
						const isActive = state.id === activeStateId;
						const chapterNum = String(index).padStart(2, "0");

						return (
							<li key={state.id} className={[styles.stateItem, isActive && styles.active].filter(Boolean).join(" ")}>
								<button
									type="button"
									className={styles.stateButton}
									onClick={() => goToState(state.id)}
									aria-current={isActive ? "step" : undefined}
									title={state.title}
								>
									{chapterNum}
								</button>
							</li>
						);
					})}
				</ol>

				<div className={styles.scrollCore} style={coreStyle} aria-hidden="true">
					<span className={styles.coreRing} />
					<span className={styles.coreCrossV} />
					<span className={styles.coreCrossH} />
					<span className={styles.coreDot} />
				</div>
			</div>
		</aside>
	);
}
