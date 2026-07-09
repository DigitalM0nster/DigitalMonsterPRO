import { useState } from "react";
import styles from "./HotspotLayer.module.scss";
import { usePortfolioProject } from "@/portfolio/core/PortfolioProjectContext.jsx";

/**
 * HTML-слой маркеров hotspot на 3D-модели.
 * Hover — подсветка, click — вход в investigation.
 */
export default function HotspotLayer({ screenPositions = {} }) {
	const { visibleHotspots = [], enterInvestigation, isInvestigating } = usePortfolioProject();
	const [hoveredId, setHoveredId] = useState(null);

	const positionedHotspots = visibleHotspots.filter(
		(h) => h.status !== "needsPosition" && screenPositions[h.id],
	);

	if (positionedHotspots.length === 0 || isInvestigating) {
		return null;
	}

	return (
		<div className={styles.hotspotLayer}>
			{positionedHotspots.map((hotspot) => {
				const screen = screenPositions[hotspot.id];
				const isHovered = hoveredId === hotspot.id;

				return (
					<button
						key={hotspot.id}
						type="button"
						className={[styles.marker, isHovered && styles.hovered].filter(Boolean).join(" ")}
						style={{ left: `${screen.x}px`, top: `${screen.y}px` }}
						aria-label={hotspot.title}
						onMouseEnter={() => setHoveredId(hotspot.id)}
						onMouseLeave={() => setHoveredId(null)}
						onFocus={() => setHoveredId(hotspot.id)}
						onBlur={() => setHoveredId(null)}
						onClick={() => enterInvestigation(hotspot.id)}
					>
						<span className={styles.leaderLine} aria-hidden="true" />
						<span className={styles.ringOuter} aria-hidden="true" />
						<span className={styles.ring} aria-hidden="true" />
						<span className={styles.core} aria-hidden="true" />
						{isHovered && <span className={styles.label}>{hotspot.title}</span>}
					</button>
				);
			})}
		</div>
	);
}
