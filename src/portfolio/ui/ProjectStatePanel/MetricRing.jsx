import styles from "./MetricRing.module.scss";

/**
 * Кольцо метрики: процент — дуга, текст — подпись в центре.
 * @param {{ label: string, value: string }} props
 */
export default function MetricRing({ label, value }) {
	const numericMatch = value.match(/^(\d{1,3})\s*%?$/);
	const pct = numericMatch ? Math.min(100, Number(numericMatch[1])) : null;
	const displayValue = pct != null ? `${pct}%` : value;

	return (
		<div
			className={[styles.metricRing, pct == null && styles.textOnly].filter(Boolean).join(" ")}
			style={pct != null ? { "--ringPct": pct } : undefined}
		>
			<div className={styles.ring} aria-hidden="true">
				<svg viewBox="0 0 64 64" className={styles.ringSvg}>
					<circle className={styles.ringTrack} cx="32" cy="32" r="28" />
					<circle className={styles.ringArc} cx="32" cy="32" r="28" />
				</svg>
			</div>
			<div className={styles.center}>
				<span className={styles.value}>{displayValue}</span>
				<span className={styles.label}>{label}</span>
			</div>
		</div>
	);
}
