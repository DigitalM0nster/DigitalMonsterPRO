import styles from "./SiteTopHud.module.scss";

const TICK_POSITIONS = [4, 12, 22, 34, 48, 62, 76, 88, 94];

/**
 * Декоративная «шкала сигнала» по центру HUD — как timeline в sci-fi интерфейсах.
 * Маркер медленно сканирует линию (имитация активного канала данных).
 */
export default function SiteTopHudTimeline() {
	return (
		<div className={styles.timeline} aria-hidden="true">
			<svg className={styles.timelineSvg} viewBox="0 0 100 10" preserveAspectRatio="none">
				<defs>
					<filter id="topHudTimelineGlow" x="-50%" y="-50%" width="200%" height="200%">
						<feGaussianBlur stdDeviation="0.8" result="blur" />
						<feMerge>
							<feMergeNode in="blur" />
							<feMergeNode in="SourceGraphic" />
						</feMerge>
					</filter>
				</defs>
				<line className={styles.timelineBase} x1="0" y1="5" x2="100" y2="5" />
				{TICK_POSITIONS.map((x) => (
					<line key={x} className={styles.timelineTick} x1={x} y1="3.5" x2={x} y2="6.5" />
				))}
				<circle className={styles.timelineMarker} cy="5" r="1.6" filter="url(#topHudTimelineGlow)">
					<animate attributeName="cx" values="2;98;2" dur="14s" repeatCount="indefinite" />
				</circle>
			</svg>
		</div>
	);
}
